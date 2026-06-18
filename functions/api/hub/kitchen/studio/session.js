// Creative Studio sessions.
//   POST /api/hub/kitchen/studio/session   → start a session  body: { mode?, title? }
//   GET  /api/hub/kitchen/studio/session?id=rsess_xxx → load a session + its events
//   GET  /api/hub/kitchen/studio/session   → list this chef's recent sessions
// Fires recipe_session.started on create.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, parseJson } from '../../../../_lib/hub.js';

const MODES = ['voice', 'text', 'mixed'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b = {};
  try { b = await request.json(); } catch { /* optional */ }
  const mode = MODES.includes(b && b.mode) ? b.mode : 'mixed';
  const title = (b && b.title) ? String(b.title).slice(0, 200) : null;

  const sessionId = id('rsess');
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO recipe_sessions (id, staff_id, mode, title, status, started_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(sessionId, staff ? staff.id : null, mode, title, 'active', ts, ts, ts).run();

  await capture(env, {
    event: 'recipe_session.started',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { mode, session_id: sessionId },
  });

  const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
  return json({ ok: true, session });
};

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  const url = new URL(request.url);
  const sessionId = (url.searchParams.get('id') || '').trim();

  if (sessionId) {
    const session = await env.DB.prepare('SELECT * FROM recipe_sessions WHERE id = ?').bind(sessionId).first();
    if (!session) return bad('Session not found.', 404);
    // Ownership: a chef may only open their own session; owners may view any. (404, not 403, so
    // the endpoint doesn't confirm another chef's session id exists.)
    if (session.staff_id !== (staff && staff.id) && !(staff && staff.role === 'owner')) {
      return bad('Session not found.', 404);
    }
    const { results } = await env.DB.prepare(
      'SELECT * FROM recipe_session_events WHERE session_id = ? ORDER BY created_at ASC'
    ).bind(sessionId).all();
    const events = (results || []).map((e) => ({ ...e, meta: parseJson(e.meta, null) }));
    return json({ session, events });
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM recipe_sessions WHERE staff_id = ? ORDER BY created_at DESC LIMIT 25'
  ).bind(staff ? staff.id : '').all();
  return json({ sessions: results || [] });
};
