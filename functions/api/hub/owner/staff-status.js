// GET /api/hub/owner/staff-status — who's on shift right now + active roster snapshot.
// Owner-only. Returns open shifts joined to staff, plus a roster summary by team.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  let onShift = [];
  try {
    const res = await env.DB
      .prepare(
        "SELECT sh.id, sh.staff_id, sh.team, sh.clock_in_at, sh.minutes_late, sh.break_minutes, " +
        "st.name, st.role, st.lang " +
        "FROM shifts sh LEFT JOIN staff st ON st.id = sh.staff_id " +
        "WHERE sh.status='open' ORDER BY sh.clock_in_at ASC LIMIT 200"
      )
      .all();
    const t = now();
    onShift = ((res && res.results) || []).map((r) => ({
      shift_id: r.id,
      staff_id: r.staff_id,
      name: r.name,
      role: r.role,
      team: r.team,
      lang: r.lang,
      clock_in_at: r.clock_in_at,
      minutes_late: r.minutes_late,
      break_minutes: r.break_minutes,
      elapsed_minutes: r.clock_in_at ? Math.round((t - r.clock_in_at) / 60000) : null,
    }));
  } catch {
    onShift = [];
  }

  // Roster summary by team (active staff).
  let roster = [];
  try {
    const res = await env.DB
      .prepare("SELECT team, role, COUNT(*) n FROM staff WHERE active=1 GROUP BY team, role")
      .all();
    roster = (res && res.results) || [];
  } catch {
    roster = [];
  }

  return json({ ok: true, on_shift: onShift, on_shift_count: onShift.length, roster });
};
