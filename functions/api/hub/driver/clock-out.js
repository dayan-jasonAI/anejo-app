// POST /api/hub/driver/clock-out — close the driver's open shift.
// Body: { geo?: {lat,lng,acc}, break_minutes?: int }
// If break_minutes is supplied it is added and a shift.break_logged event fires.
// Fires shift.clocked_out (and shift.break_logged when a break is recorded).
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, toJson, parseJson } from '../../../_lib/hub.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b = {};
  try { b = await request.json(); } catch { /* body optional */ }

  const shift = await env.DB
    .prepare("SELECT * FROM shifts WHERE staff_id=? AND status='open' ORDER BY clock_in_at DESC LIMIT 1")
    .bind(staff.id)
    .first();
  if (!shift) return bad('No open shift to close.', 409);

  const ts = now();
  const geo = b && typeof b.geo === 'object' ? b.geo : null;

  // Optional break captured at clock-out.
  const addBreak = Number.isFinite(b && b.break_minutes) && b.break_minutes > 0 ? Math.round(b.break_minutes) : 0;
  const breaks = parseJson(shift.breaks, []) || [];
  let breakMinutes = shift.break_minutes || 0;
  if (addBreak) {
    breaks.push({ start: null, stop: ts, minutes: addBreak });
    breakMinutes += addBreak;
  }

  const grossMinutes = Math.max(0, Math.round((ts - shift.clock_in_at) / 60000));
  const totalMinutes = Math.max(0, grossMinutes - breakMinutes);

  await env.DB
    .prepare(
      'UPDATE shifts SET clock_out_at=?, clock_out_geo=?, break_minutes=?, breaks=?, total_minutes=?, status=?, updated_at=? WHERE id=?'
    )
    .bind(ts, toJson(geo), breakMinutes, toJson(breaks), totalMinutes, 'closed', ts, shift.id)
    .run();

  await env.DB.prepare('UPDATE staff SET last_active_at=?, updated_at=? WHERE id=?').bind(ts, ts, staff.id).run();

  if (addBreak) {
    await capture(env, {
      event: 'shift.break_logged',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { break_minutes: addBreak, platform: 'pwa' },
    });
  }

  await capture(env, {
    event: 'shift.clocked_out',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { total_minutes: totalMinutes, platform: 'pwa' },
  });

  return json({ ok: true, shift: { id: shift.id, total_minutes: totalMinutes, break_minutes: breakMinutes, status: 'closed' } });
};
