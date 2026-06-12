// GET/POST /api/hub/driver/available — driver availability for more orders.
//   GET  → { available, available_at }
//   POST { available: true|false } → flips the flag; when a driver goes available the owner's
//          dispatch view shows them as free to assign new/on-demand orders.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);
  const row = await env.DB.prepare('SELECT available, available_at FROM staff WHERE id=?').bind(staff.id).first();
  return json({ available: !!(row && row.available), available_at: (row && row.available_at) || null });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const available = (b && (b.available === true || b.available === 1)) ? 1 : 0;
  const ts = now();
  await env.DB.prepare('UPDATE staff SET available=?, available_at=?, updated_at=? WHERE id=?')
    .bind(available, available ? ts : null, ts, staff.id).run();

  await capture(env, {
    event: 'driver.availability', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { available: !!available },
  });
  return json({ ok: true, available: !!available, available_at: available ? ts : null });
};
