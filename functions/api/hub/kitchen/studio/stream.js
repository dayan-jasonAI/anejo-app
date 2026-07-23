// POST /api/hub/kitchen/studio/stream — STREAMING Creative Studio turn.
// Same grounding/vision/persistence as studio/message.js, but streams Claude's reply
// token-by-token (text/plain ReadableStream) so the chef sees coaching appear live.
// Body: { session_id, text, assist_type? }. Production must fail visibly when AI is unavailable.
import { bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';
import { buildStudioSystem } from '../../../../_lib/studio_context.js';
import { getMedia, contentTypeForKey } from '../../../../_lib/media.js';
import { generatePlateImage } from '../../../../_lib/plate_image.js';

const MODEL = 'claude-sonnet-4-6';
const IMG_SENTINEL = '⟦IMG⟧';   // model puts image requests after this; the app renders them, chef never sees it
const MAX_GEN_IMAGES = 6;
const ASSIST_TYPES = ['guidance', 'research', 'substitution', 'scaling', 'critique'];
const MAX_VISION = 2;

// Parse the trailing "NAME :: prompt" lines the model emits after IMG_SENTINEL.
function parseImageRequests(block) {
  return String(block || '').split('\n').map((ln) => {
    const s = ln.trim().replace(/^[-*\d.\s]+/, '');
    const i = s.indexOf('::');
    if (i === -1) return null;
    const name = s.slice(0, i).trim().slice(0, 80);
    const prompt = s.slice(i + 2).trim().slice(0, 600);
    return prompt ? { name, prompt } : null;
  }).filter(Boolean).slice(0, MAX_GEN_IMAGES);
}
const VISION_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function photoKeyFromContent(content) {
  const m = /^\/api\/hub\/media\/(.+)$/.exec((content || '').toString());
  return m ? m[1] : null;
}
async function buildVisionBlocks(env, photoKeys) {
  if (!env.MEDIA || !photoKeys.length) return [];
  const blocks = [];
  for (const key of photoKeys.slice(-MAX_VISION)) {
    try {
      const obj = await getMedia(env, key);
      if (!obj) continue;
      let type = ((obj.httpMetadata && obj.httpMetadata.contentType) || contentTypeForKey(key) || '').toLowerCase();
      if (!VISION_TYPES.includes(type)) continue;
      const ab = await obj.arrayBuffer();
      if (!ab || ab.byteLength === 0) continue;
      blocks.push({ type: 'image', source: { type: 'base64', media_type: type, data: abToBase64(ab) } });
    } catch { /* skip */ }
  }
  return blocks;
}
async function buildTranscript(env, sessionId) {
  const { results } = await env.DB.prepare(
    'SELECT kind, content, assist_type FROM recipe_session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT 40'
  ).bind(sessionId).all();
  const msgs = [];
  const photoKeys = [];
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
const enc = new TextEncoder();

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sessionId = ((b && b.session_id) || '').toString().trim();
  const text = ((b && b.text) || '').toString().trim();
  if (!sessionId) return bad('Missing session_id.');
  if (!text) return bad('Missing text.');
  const assistType = ASSIST_TYPES.includes(b && b.assist_type) ? b.assist_type : 'guidance';
  if (!env.ANTHROPIC_API_KEY) return bad('Creative Studio AI is not configured. This turn was not drafted.', 503);

  const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
  if (!session) return bad('Session not found.', 404);
  if (session.staff_id !== ctx.distinct_id && ctx.role !== 'owner') return bad('Session not found.', 404);
  // A conversation stays usable after a recipe is published from it (publishing finalizes the
  // session). Don't lock chat to 'active' — only a future explicit 'archived' status blocks new
  // turns; a finalized session is reactivated so the chef keeps coaching in the same thread.
  if (session.status === 'archived') return bad('This conversation is archived.', 409);
  if (session.status !== 'active') {
    await env.DB.prepare("UPDATE recipe_sessions SET status = 'active', updated_at = ? WHERE id = ?").bind(now(), sessionId).run();
  }

  const ts = now();
  await env.DB.prepare(
    'INSERT INTO recipe_session_events (id, session_id, kind, content, created_at) VALUES (?,?,?,?,?)'
  ).bind(id('rse'), sessionId, 'user_text', text, ts).run();

  // Build the grounded prompt (brand brief + SOPs) + rolling transcript + recent photos (vision).
  const { msgs: history, photoKeys } = await buildTranscript(env, sessionId);
  const system = await buildStudioSystem(env);
  const directive = assistType ? `\n\n(The chef is asking for: ${assistType}.)` : '';
  const images = await buildVisionBlocks(env, photoKeys);
  const finalContent = images.length ? [{ type: 'text', text: text + directive }, ...images] : text + directive;
  const messages = [...history, { role: 'user', content: finalContent }];

  let aiResponse;
  try {
    aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8192, system, messages, stream: true }),
    });
  } catch {
    return bad('Creative Studio AI could not be reached. This turn was not drafted.', 502);
  }
  if (!aiResponse.ok || !aiResponse.body) {
    return bad(`Creative Studio AI returned ${aiResponse.status}. This turn was not drafted.`, 502);
  }

  // Persist the assistant turn once the full text is known (best-effort; never breaks the stream).
  async function persist(full, demo) {
    try {
      await env.DB.prepare(
        'INSERT INTO recipe_session_events (id, session_id, kind, assist_type, content, meta, created_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(id('rse'), sessionId, 'ai_assist', assistType, full, toJson({ demo, model: demo ? null : MODEL, streamed: true }), now()).run();
      await env.DB.prepare('UPDATE recipe_sessions SET ai_assist_count = ai_assist_count + 1, updated_at = ? WHERE id = ?').bind(now(), sessionId).run();
      await capture(env, { event: 'recipe_session.ai_assist_used', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { assist_type: assistType, session_id: sessionId, streamed: true } });
    } catch { /* logging only */ }
  }

  const stream = new ReadableStream({
    async start(controller) {
      let full = '', emitted = 0, sentinelAt = -1;
      const HOLD = IMG_SENTINEL.length; // hold back a few chars so a forming sentinel never leaks
      const flush = (final) => {
        let end = sentinelAt === -1 ? full.length : sentinelAt;
        if (sentinelAt === -1 && !final) end = Math.max(emitted, full.length - HOLD);
        if (end > emitted) { controller.enqueue(enc.encode(full.slice(emitted, end))); emitted = end; }
      };
      const push = (s) => {
        full += s;
        if (sentinelAt === -1) { const i = full.indexOf(IMG_SENTINEL); if (i !== -1) sentinelAt = i; }
        flush(false);
      };
      // After the model finishes: render any requested plate photos inline, then persist the clean turn.
      // Idempotent: if enqueue throws mid-image (client disconnected) and the catch path re-enters,
      // we must not regenerate images / double-insert photo events / persist twice.
      let turnDone = false;
      const finishTurn = async (demo) => {
        if (turnDone) return;
        turnDone = true;
        if (sentinelAt === -1) flush(true);
        const shown = sentinelAt === -1 ? full : full.slice(0, sentinelAt);
        let appended = '';
        if (sentinelAt !== -1) {
          const reqs = parseImageRequests(full.slice(sentinelAt + IMG_SENTINEL.length));
          for (const req of reqs) {
            const url = await generatePlateImage(env, req.prompt);
            if (!url) continue;
            const md = `\n\n**${(req.name || 'Plate').replace(/[[\]]/g, '')}**\n\n![${(req.name || 'plate').replace(/[[\]]/g, '')}](${url})`;
            controller.enqueue(enc.encode(md));
            appended += md;
            try {
              await env.DB.prepare('INSERT INTO recipe_session_events (id, session_id, kind, media_type, content, meta, created_at) VALUES (?,?,?,?,?,?,?)')
                .bind(id('rse'), sessionId, 'photo', 'photo', url, toJson({ ai_generated: true, label: req.name, prompt: req.prompt }), now()).run();
              await env.DB.prepare('UPDATE recipe_sessions SET media_count = media_count + 1, updated_at = ? WHERE id = ?').bind(now(), sessionId).run();
            } catch { /* best-effort */ }
          }
        }
        if (!demo) await persist((shown + appended).trim(), false);
      };
      try {
        // Parse Anthropic SSE: emit text from content_block_delta/text_delta.
        const reader = aiResponse.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith('data:')) continue;
            const payload = s.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const evt = JSON.parse(payload);
              if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') push(evt.delta.text || '');
            } catch { /* ignore keep-alive / partial */ }
          }
        }
        if (!full) throw new Error('empty stream');
        await finishTurn(false);
      } catch {
        try {
          if (!turnDone && sentinelAt === -1) push('\n\nCreative Studio AI stopped before a complete answer. Do not draft a recipe or Brief proposal from this turn.');
          await finishTurn(true);
        } catch { /* client gone — nothing left to deliver */ }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
};
