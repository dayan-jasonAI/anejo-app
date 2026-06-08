// POST /api/hub/kitchen/studio/media — attach a voice clip or photo reference to a session.
// Body: { session_id, media_type:'voice'|'photo', content (asset key/url), transcript?, meta? }
// We store a REFERENCE, not the binary (asset upload to R2/KV is a follow-up). For voice,
// an optional client-provided transcript is kept; otherwise STT wiring is a follow-up.
// Appends a recipe_session_events row, bumps media_count, fires recipe_session.media_added.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';

const MEDIA_TYPES = ['voice', 'photo'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sessionId = (b && b.session_id || '').toString().trim();
  const mediaType = (b && b.media_type || '').toString();
  if (!sessionId) return bad('Missing session_id.');
  if (!MEDIA_TYPES.includes(mediaType)) return bad("media_type must be 'voice' or 'photo'.");

  const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
  if (!session) return bad('Session not found.', 404);
  if (session.status !== 'active') return bad('Session is not active.', 409);

  // content = asset key/url reference. For voice, transcript (if any) is stored as content
  // when present, with the asset ref in meta; otherwise content holds the asset ref.
  const assetRef = (b && b.content) ? String(b.content).slice(0, 1000) : null;
  const transcript = (b && b.transcript) ? String(b.transcript).slice(0, 4000) : null;
  const content = mediaType === 'voice' ? (transcript || assetRef) : assetRef;

  const meta = {
    asset_ref: assetRef,
    has_transcript: !!transcript,
    stt_pending: mediaType === 'voice' && !transcript, // STT wiring is a follow-up
    ...(b && typeof b.meta === 'object' ? b.meta : {}),
  };

  const ts = now();
  const eventId = id('rse');
  await env.DB.prepare(
    `INSERT INTO recipe_session_events (id, session_id, kind, media_type, content, meta, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(eventId, sessionId, mediaType, mediaType, content, toJson(meta), ts).run();

  await env.DB.prepare(
    'UPDATE recipe_sessions SET media_count = media_count + 1, updated_at = ? WHERE id = ?'
  ).bind(ts, sessionId).run();

  await capture(env, {
    event: 'recipe_session.media_added',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { media_type: mediaType, session_id: sessionId },
  });

  return json({ ok: true, event_id: eventId, media_type: mediaType, stt_pending: meta.stt_pending });
};
