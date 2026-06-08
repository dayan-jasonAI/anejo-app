// POST /api/hub/kitchen/clock-out — close the current open shift.
// Body: { geo?: {lat,lng,acc} }. Computes total_minutes (minus logged breaks).
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, toJson, bit } from '../../../_lib/hub.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);

  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this session.', 403);

  let b = {};
  try { b = await request.json(); } catch { /* body optional */ }

  const open = await env.DB
    .prepare("SELECT * FROM shifts WHERE staff_id = ? AND status = 'open' ORDER BY clock_in_at DESC LIMIT 1")
    .bind(staff.id).first();
  if (!open) return bad('No open shift to close.', 409);

  const geo = b && b.geo && typeof b.geo === 'object' ? b.geo : null;
  const ts = now();
  const grossMin = Math.max(0, Math.round((ts - Number(open.clock_in_at)) / 60000));
  const totalMin = Math.max(0, grossMin - (open.break_minutes || 0));

  await env.DB.prepare(
    `UPDATE shifts SET clock_out_at = ?, clock_out_geo = ?, geo_captured = (geo_captured | ?),
       total_minutes = ?, status = 'closed', updated_at = ? WHERE id = ?`
  ).bind(ts, toJson(geo), bit(!!geo), totalMin, ts, open.id).run();

  await env.DB.prepare('UPDATE staff SET last_active_at = ?, updated_at = ? WHERE id = ?')
    .bind(ts, ts, staff.id).run();

  await capture(env, {
    event: 'shift.clocked_out',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { total_minutes: totalMin, shift_id: open.id },
  });

  const shift = await env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(open.id).first();
  return json({ ok: true, shift });
};

// GET /api/hub/kitchen/clock-out is not meaningful; expose current shift via GET for convenience.
export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return json({ shift: null });
  const open = await env.DB
    .prepare("SELECT * FROM shifts WHERE staff_id = ? AND status = 'open' ORDER BY clock_in_at DESC LIMIT 1")
    .bind(staff.id).first();
  return json({ shift: open || null });
};
