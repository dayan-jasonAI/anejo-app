// GET /api/hub/owner/training-status — OWNER-ONLY training compliance: every active staffer and
// whether they have completed THEIR role's tutorial (+ when). Drives the compliance view.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let items = [];
  try {
    const r = await env.DB.prepare(
      `SELECT s.id, s.name, s.role, s.team, tc.completed_at, tc.lang
         FROM staff s
         LEFT JOIN training_completions tc ON tc.staff_id = s.id AND tc.module = s.role
        WHERE s.active = 1
        ORDER BY (tc.completed_at IS NULL) DESC, s.role, s.name`
    ).all();
    items = (r && r.results) || [];
  } catch (_) { /* empty */ }

  const done = items.filter((i) => i.completed_at).length;
  return json({ ok: true, items, done, total: items.length });
};
