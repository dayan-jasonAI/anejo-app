// POST /api/hub/kitchen/studio/message — one chef <-> AI turn in a Creative Studio session.
// Body: { session_id, text, assist_type? }   assist_type ∈ guidance|research|substitution|scaling|critique
// Appends a user_text event, calls Claude with the rolling transcript, appends an
// ai_assist event, bumps ai_assist_count, and fires recipe_session.ai_assist_used.
// Graceful demo mode: without ANTHROPIC_API_KEY it returns a canned coaching reply.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';
import { buildStudioSystem } from '../../../../_lib/studio_context.js';
import { getMedia, contentTypeForKey } from '../../../../_lib/media.js';

const MODEL = 'claude-sonnet-4-6';
const ASSIST_TYPES = ['guidance', 'research', 'substitution', 'scaling', 'critique'];
const MAX_VISION = 2;                       // most-recent session photos sent to the model per turn
const VISION_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Base64-encode an ArrayBuffer in chunks (avoids call-stack limits on large buffers).
function abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// A photo event stores its R2 ref as `/api/hub/media/<key>`. Pull the key (or null
// for data:-URL / reference-only photos we can't fetch).
function photoKeyFromContent(content) {
  const s = (content || '').toString();
  const m = /^\/api\/hub\/media\/(.+)$/.exec(s);
  return m ? m[1] : null;
}

// Fetch up to MAX_VISION most-recent session photos from R2 → Claude image blocks.
async function buildVisionBlocks(env, photoKeys) {
  if (!env.MEDIA || !photoKeys.length) return [];
  const recent = photoKeys.slice(-MAX_VISION);
  const blocks = [];
  for (const key of recent) {
    try {
      const obj = await getMedia(env, key);
      if (!obj) continue;
      let type = (obj.httpMetadata && obj.httpMetadata.contentType) || contentTypeForKey(key);
      type = (type || '').toLowerCase();
      if (!VISION_TYPES.includes(type)) continue;
      const ab = await obj.arrayBuffer();
      if (!ab || ab.byteLength === 0) continue;
      blocks.push({ type: 'image', source: { type: 'base64', media_type: type, data: abToBase64(ab) } });
    } catch { /* skip unreadable image */ }
  }
  return blocks;
}

function demoReply(text, assistType) {
  const t = (text || '').slice(0, 80);
  const lead = {
    guidance: 'Here is how I would approach that',
    research: 'A quick note from what is typical for this style',
    substitution: 'For a substitution that fits the house style',
    scaling: 'To scale that cleanly',
    critique: 'My honest read on this',
  }[assistType] || 'Here is a thought';
  return `${lead}: build on a quinoa base, keep protein ~40g, add a bright citrus/chimichurri accent, and balance with greens + a healthy fat. (Demo mode — connect ANTHROPIC_API_KEY for full AI coaching.) You said: "${t}".`;
}

async function buildTranscript(env, sessionId, beforeTs = null) {
  const cutoff = beforeTs == null ? Number.MAX_SAFE_INTEGER : Number(beforeTs);
  const { results } = await env.DB.prepare(
    'SELECT kind, content, assist_type FROM recipe_session_events WHERE session_id = ? AND created_at < ? ORDER BY created_at ASC LIMIT 40'
  ).bind(sessionId, cutoff).all();
  const msgs = [];
  const photoKeys = []; // R2 keys for photos, in chronological order (for vision)
  for (const e of results || []) {
    if (e.kind === 'user_text') msgs.push({ role: 'user', content: e.content || '' });
    else if (e.kind === 'ai_text' || e.kind === 'ai_assist') msgs.push({ role: 'assistant', content: e.content || '' });
    else if (e.kind === 'voice' || e.kind === 'voice_transcript') msgs.push({ role: 'user', content: `[voice] ${e.content || ''}`.trim() });
    else if (e.kind === 'photo') {
      msgs.push({ role: 'user', content: '[chef attached a photo of the dish in progress]' });
      const k = photoKeyFromContent(e.content);
      if (k) photoKeys.push(k);
    }
  }
  return { msgs, photoKeys };
}

async function callClaude(env, sessionId, userText, assistType, beforeTs = null) {
  const { msgs: history, photoKeys } = await buildTranscript(env, sessionId, beforeTs);
  const system = await buildStudioSystem(env);
  const directive = assistType ? `\n\n(The chef is asking for: ${assistType}.)` : '';

  // Attach the most-recent session photos to the final turn so the model can SEE the
  // dish (real vision for plating critiques). Falls back to text-only if none/unreadable.
  const images = await buildVisionBlocks(env, photoKeys);
  const finalText = (userText || '') + directive;
  const finalContent = images.length
    ? [{ type: 'text', text: finalText }, ...images]
    : finalText;
  const messages = [...history, { role: 'user', content: finalContent }];

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8192, system, messages }),
  });
  if (!r.ok) throw new Error(`AI ${r.status}`);
  const data = await r.json();
  return (data.content || []).map((c) => c.text || '').join('').trim();
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sessionId = (b && b.session_id || '').toString().trim();
  const text = (b && b.text || '').toString().trim();
  if (!sessionId) return bad('Missing session_id.');
  if (!text) return bad('Missing text.');
  const assistType = ASSIST_TYPES.includes(b && b.assist_type) ? b.assist_type : 'guidance';

  const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
  if (!session) return bad('Session not found.', 404);
  // Ownership: only the chef who owns the session (or an owner) may post into it.
  if (session.staff_id !== ctx.distinct_id && ctx.role !== 'owner') return bad('Session not found.', 404);
  // A conversation stays usable after a recipe is published from it (publishing finalizes the
  // session). Don't lock chat to 'active' — only a future explicit 'archived' status blocks new
  // turns; a finalized session is reactivated so the chef keeps coaching in the same thread.
  if (session.status === 'archived') return bad('This conversation is archived.', 409);
  if (session.status !== 'active') {
    await env.DB.prepare("UPDATE recipe_sessions SET status = 'active', updated_at = ? WHERE id = ?").bind(now(), sessionId).run();
  }

  const ts = now();
  // 1) record the chef's turn
  await env.DB.prepare(
    `INSERT INTO recipe_session_events (id, session_id, kind, content, created_at) VALUES (?,?,?,?,?)`
  ).bind(id('rse'), sessionId, 'user_text', text, ts).run();

  // 2) get the AI reply (or demo)
  let reply;
  let demo = false;
  if (env.ANTHROPIC_API_KEY) {
    try { reply = await callClaude(env, sessionId, text, assistType, ts); }
    catch { reply = demoReply(text, assistType); demo = true; }
  } else {
    reply = demoReply(text, assistType);
    demo = true;
  }
  if (!reply) reply = demoReply(text, assistType);
  // The shared studio system prompt (studio_context.js) tells the model to append image
  // requests after an ⟦IMG⟧ sentinel. Only stream.js renders those; this non-streaming
  // endpoint drops the block so no caller ever sees the raw sentinel (or gets it persisted
  // and replayed into future transcripts).
  const imgCut = reply.indexOf('⟦IMG⟧');
  if (imgCut !== -1) reply = reply.slice(0, imgCut).trim();
  if (!reply) reply = demoReply(text, assistType);

  // 3) record the AI turn + bump assist count
  const aiEventId = id('rse');
  await env.DB.prepare(
    `INSERT INTO recipe_session_events (id, session_id, kind, assist_type, content, meta, created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(aiEventId, sessionId, 'ai_assist', assistType, reply, toJson({ demo, model: demo ? null : MODEL }), ts + 1).run();

  await env.DB.prepare(
    'UPDATE recipe_sessions SET ai_assist_count = ai_assist_count + 1, updated_at = ? WHERE id = ?'
  ).bind(ts + 1, sessionId).run();

  await capture(env, {
    event: 'recipe_session.ai_assist_used',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { assist_type: assistType, session_id: sessionId },
  });

  return json({ ok: true, reply, assist_type: assistType, demo, event_id: aiEventId });
};
