// /api/hub/training/complete — record (and read) tutorial completion for the current staffer.
//   POST { module, lang } → upsert a training_completions row (idempotent per staff+module).
//   GET                   → { completed:[{module, completed_at}] } for the current staffer.
// Any staff role may complete their own training; the owner reads compliance via
// /api/hub/owner/training-status.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { id, now } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';

const MODULES = ['owner', 'kitchen', 'driver', 'vendor'];
const STAFF_ROLES = ['owner', 'kitchen', 'driver', 'vendor'];

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, STAFF_ROLES);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const staff = await currentStaff(env, request);
  let completed = [];
  try {
    const r = await env.DB.prepare('SELECT module, completed_at FROM training_completions WHERE staff_id = ?').bind(staff ? staff.id : '').all();
    completed = (r && r.results) || [];
  } catch (_) { /* empty */ }
  return json({ ok: true, completed });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, STAFF_ROLES);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff session.', 401);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const module = (b && b.module || '').toString().trim();
  if (!MODULES.includes(module)) return bad('Unknown training module.');
  const lang = (b && b.lang) === 'es' ? 'es' : 'en';
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO training_completions (id, staff_id, module, lang, completed_at) VALUES (?,?,?,?,?)
       ON CONFLICT(staff_id, module) DO UPDATE SET lang=excluded.lang, completed_at=excluded.completed_at`
    ).bind(id('tc'), staff.id, module, lang, t).run();
  } catch (_) { return bad('Could not record completion.', 500); }

  await capture(env, { event: 'training.completed', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { module, lang } });
  return json({ ok: true, module, completed_at: t });
};
