// POST /api/hub/driver/clock-in — driver (or owner) opens a shift.
// Body: { geo?: {lat,lng,acc}, scheduled?: bool, minutes_late?: int }
// Idempotent-ish: if an open shift already exists it is returned instead of duplicated.
// Fires shift.clocked_in.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { id, now, toJson } from '../../../_lib/hub.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b = {};
  try { b = await request.json(); } catch { /* body optional */ }

  // Reuse an already-open shift rather than creating a second one.
  const open = await env.DB
    .prepare("SELECT * FROM shifts WHERE staff_id=? AND status='open' ORDER BY clock_in_at DESC LIMIT 1")
    .bind(staff.id)
    .first();
  if (open) return json({ ok: true, shift: open, already_open: true });

  // Probe mode: report clock state without creating a shift (used by the home screen).
  if (b && b.probe) return json({ ok: true, shift: null, already_open: false, probe: true });

  const geo = b && typeof b.geo === 'object' ? b.geo : null;
  const geoCaptured = geo && typeof geo.lat === 'number' && typeof geo.lng === 'number';
  const scheduled = b && b.scheduled ? 1 : 0;
  const minutesLate = Number.isFinite(b && b.minutes_late) ? Math.round(b.minutes_late) : null;
  const ts = now();
  const sid = id('shift');

  await env.DB
    .prepare(
      'INSERT INTO shifts (id, staff_id, team, clock_in_at, clock_in_geo, geo_captured, scheduled, minutes_late, break_minutes, breaks, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )
    .bind(sid, staff.id, staff.team || 'delivery', ts, toJson(geo), geoCaptured ? 1 : 0, scheduled, minutesLate, 0, toJson([]), 'open', ts, ts)
    .run();

  await env.DB.prepare('UPDATE staff SET last_active_at=?, updated_at=? WHERE id=?').bind(ts, ts, staff.id).run();

  await capture(env, {
    event: 'shift.clocked_in',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { geo_captured: !!geoCaptured, scheduled: !!scheduled, minutes_late: minutesLate, platform: 'pwa' },
  });

  // Owner alert for a materially late clock-in (>= 10 min).
  if (minutesLate && minutesLate >= 10) {
    await raiseAlert(env, {
      alert_type: 'late_clock_in',
      severity: 'warning',
      title: 'Late clock-in',
      body: `${staff.name || 'Staff'} clocked in ${minutesLate}m late`,
      team: ctx.team || staff.team || null,
      ref_type: 'shift', ref_id: sid,
      source: 'surface',
      dedupe_key: `late_clock_in:${sid}`,
    });
  }

  return json({ ok: true, shift: { id: sid, staff_id: staff.id, clock_in_at: ts, status: 'open' } });
};
