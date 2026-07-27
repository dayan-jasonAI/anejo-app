// POST /api/hub/kitchen/studio/transcribe — Whisper STT for a Creative Studio voice clip.
// Body: { session_id, audio: base64 dataUrl (webm/ogg/mp4), lang? }
// env.AI (Workers AI) MAY BE ABSENT — returns { ok:false, unavailable:true } with HTTP 200
// so the UI degrades quietly to today's "transcription pending" behavior.
// On success: appends a recipe_session_events row (kind 'voice_transcript'), stores the
// audio to R2 best-effort (kind 'studio'), bumps media_count, fires recipe_session.media_added.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';
import { putMedia, decodeDataUrl, MAX_MEDIA_BYTES } from '../../../../_lib/media.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sessionId = (b && b.session_id || '').toString().trim();
  const audio = (b && b.audio || '').toString();
  const lang = (b && b.lang || '').toString().slice(0, 8) || null;
  if (!sessionId) return bad('Missing session_id.');
  if (!audio) return bad('Missing audio.');

  const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
  if (!session) return bad('Session not found.', 404);
  if (session.staff_id !== ctx.distinct_id && ctx.role !== 'owner') return bad('Session not found.', 404);
  if (session.status !== 'active') return bad('Session is not active.', 409);

  // Feature-detect Workers AI — degrade quietly (HTTP 200) so the UI keeps today's behavior.
  if (!env.AI) return json({ ok: false, unavailable: true, error: 'Transcription not enabled yet.' });

  const decoded = decodeDataUrl(audio);
  if (!decoded) return bad('audio must be a base64 data URL.');
  if (decoded.bytes.length > MAX_MEDIA_BYTES) return bad('Audio too large (5MB max).', 413);

  // Transcribe. `@cf/openai/whisper` (the previous model here) takes a byte array and NO language
  // hint — it is the English-focused build, so Spanish came back as garbage or as English-ish
  // phonetic mush. Since the Studio has to be conversational in both languages, we use
  // whisper-large-v3-turbo, which is multilingual and accepts an explicit `language`.
  //
  // Passing the language rather than letting it auto-detect matters for short clips and for
  // Spanglish speech: without the hint, one Spanish sentence containing "chicken" or a bowl name
  // can flip the whole detection to English and wreck the transcript.
  const langCode = /^es/i.test(lang || '') ? 'es' : /^en/i.test(lang || '') ? 'en' : null;
  const b64 = audio.includes(',') ? audio.slice(audio.indexOf(',') + 1) : audio;

  let text = '';
  let usedModel = null;
  try {
    const turbo = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: b64,                                  // this model takes base64, not a byte array
      task: 'transcribe',                          // never 'translate' — we want their words, verbatim
      ...(langCode ? { language: langCode } : {}),
    });
    text = ((turbo && (turbo.text || turbo.transcription_info && turbo.text)) || '').trim();
    usedModel = 'whisper-large-v3-turbo';
  } catch (e) {
    // Fall back to the older model rather than losing the clip. It is English-biased, so this is a
    // degraded result for Spanish, not an equivalent one — hence it is recorded in meta below.
    try {
      const base = await env.AI.run('@cf/openai/whisper', { audio: [...decoded.bytes] });
      text = ((base && base.text) || '').trim();
      usedModel = 'whisper';
    } catch {
      return json({ ok: false, unavailable: true, error: 'Transcription failed.' });
    }
  }
  if (!text) return json({ ok: false, unavailable: true, error: 'No speech detected.' });

  // Best-effort: persist the audio itself to R2 (no-op when MEDIA binding is absent).
  const put = await putMedia(env, {
    kind: 'studio',
    bytes: decoded.bytes,
    contentType: decoded.contentType,
  });

  const ts = now();
  const eventId = id('rse');
  const meta = {
    lang,
    lang_code: langCode,
    model: usedModel,        // which model produced this — 'whisper' means the degraded fallback ran
    bytes: decoded.bytes.length,
    mime: decoded.contentType,
    asset_ref: put.stored ? put.url : null,
    audio_stored: !!put.stored,
    transcribed: true,
  };
  await env.DB.prepare(
    `INSERT INTO recipe_session_events (id, session_id, kind, media_type, content, meta, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(eventId, sessionId, 'voice_transcript', 'voice', text.slice(0, 4000), toJson(meta), ts).run();

  await env.DB.prepare(
    'UPDATE recipe_sessions SET media_count = media_count + 1, updated_at = ? WHERE id = ?'
  ).bind(ts, sessionId).run();

  await capture(env, {
    event: 'recipe_session.media_added',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { media_type: 'voice', transcribed: true, session_id: sessionId, audio_stored: !!put.stored },
  });

  return json({ ok: true, text, event_id: eventId, audio_stored: !!put.stored, audio_url: put.stored ? put.url : null });
};
