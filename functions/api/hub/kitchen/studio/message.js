// POST /api/hub/kitchen/studio/message — one chef <-> AI turn in a Creative Studio session.
// Body: { session_id, text, assist_type? }   assist_type ∈ guidance|research|substitution|scaling|critique
// Appends a user_text event, calls Claude with the rolling transcript, appends an
// ai_assist event, bumps ai_assist_count, and fires recipe_session.ai_assist_used.
// Graceful demo mode: without ANTHROPIC_API_KEY it returns a canned coaching reply.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson, parseJson } from '../../../../_lib/hub.js';

const MODEL = 'claude-sonnet-4-6';
const ASSIST_TYPES = ['guidance', 'research', 'substitution', 'scaling', 'critique'];

const SYSTEM_PROMPT = `You are the Creative Studio sous-chef AI for Añejo Catering Co., a Mediterranean-Cuban longevity bowl service in Palm Beach County, Florida. A chef is developing a recipe live — speaking, snapping photos, and chatting with you. Your job is to guide, research, critique, scale, and suggest substitutions.

House style: Mediterranean-Cuban, longevity-forward, high-protein, anti-inflammatory, generous fiber, quinoa-forward bases, bright citrus and chimichurri/Añejo sauces. Bowls are ~16oz with sauce on the side.

Behavior:
- Be concise and practical — you are talking to a working chef mid-development, not writing an essay.
- When asked to scale, give exact quantities. When suggesting substitutions, respect allergens and the house style.
- When critiquing, be specific about flavor balance, macros, and plating.
- Never invent nutrition facts as precise medical claims; use approximate ranges and say "approx".
- Keep replies under ~150 words unless the chef asks for a full recipe.`;

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

async function buildTranscript(env, sessionId) {
  const { results } = await env.DB.prepare(
    'SELECT kind, content, assist_type FROM recipe_session_events WHERE session_id = ? ORDER BY created_at ASC LIMIT 40'
  ).bind(sessionId).all();
  const msgs = [];
  for (const e of results || []) {
    if (e.kind === 'user_text') msgs.push({ role: 'user', content: e.content || '' });
    else if (e.kind === 'ai_text' || e.kind === 'ai_assist') msgs.push({ role: 'assistant', content: e.content || '' });
    else if (e.kind === 'voice') msgs.push({ role: 'user', content: `[voice clip transcript pending] ${e.content || ''}`.trim() });
    else if (e.kind === 'photo') msgs.push({ role: 'user', content: '[chef attached a photo of the dish in progress]' });
  }
  return msgs;
}

async function callClaude(env, sessionId, userText, assistType) {
  const history = await buildTranscript(env, sessionId);
  const directive = assistType ? `\n\n(The chef is asking for: ${assistType}.)` : '';
  const messages = [...history, { role: 'user', content: (userText || '') + directive }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM_PROMPT, messages }),
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
  if (session.status !== 'active') return bad('Session is not active.', 409);

  const ts = now();
  // 1) record the chef's turn
  await env.DB.prepare(
    `INSERT INTO recipe_session_events (id, session_id, kind, content, created_at) VALUES (?,?,?,?,?)`
  ).bind(id('rse'), sessionId, 'user_text', text, ts).run();

  // 2) get the AI reply (or demo)
  let reply;
  let demo = false;
  if (env.ANTHROPIC_API_KEY) {
    try { reply = await callClaude(env, sessionId, text, assistType); }
    catch { reply = demoReply(text, assistType); demo = true; }
  } else {
    reply = demoReply(text, assistType);
    demo = true;
  }
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
