// POST /api/hub/kitchen/clock-in — open a shift for the current kitchen staffer.
// Body: { geo?: {lat,lng,acc}, scheduled?: bool, scheduled_at?: ms }
// Idempotent-ish: if an open shift already exists, returns it instead of duplicating.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, now, toJson, bit } from '../../../_lib/hub.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);

  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this session.', 403);

  let b = {};
  try { b = await request.json(); } catch { /* body optional */ }

  // Reuse an existing open shift rather than stacking duplicates.
  const open = await env.DB
    .prepare("SELECT * FROM shifts WHERE staff_id = ? AND status = 'open' ORDER BY clock_in_at DESC LIMIT 1")
    .bind(staff.id).first();
  if (open) {
    return json({ ok: true, shift: open, already_open: true });
  }

  const geo = b && b.geo && typeof b.geo === 'object' ? b.geo : null;
  const scheduled = !!(b && b.scheduled);
  let minutesLate = null;
  if (scheduled && b && b.scheduled_at) {
    const diffMin = Math.round((now() - Number(b.scheduled_at)) / 60000);
    minutesLate = diffMin > 0 ? diffMin : 0;
  }

  const shiftId = id('shift');
  const ts = now();
  await env.DB.prepare(
    `INSERT INTO shifts (id, staff_id, team, clock_in_at, clock_in_geo, geo_captured, scheduled, minutes_late, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    shiftId, staff.id, staff.team || 'kitchen', ts,
    toJson(geo), bit(!!geo), bit(scheduled), minutesLate, 'open', ts, ts
  ).run();

  await env.DB.prepare('UPDATE staff SET last_active_at = ?, updated_at = ? WHERE id = ?')
    .bind(ts, ts, staff.id).run();

  await capture(env, {
    event: 'shift.clocked_in',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { geo_captured: !!geo, scheduled, minutes_late: minutesLate, shift_id: shiftId },
  });

  const shift = await env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(shiftId).first();
  return json({ ok: true, shift });
};
