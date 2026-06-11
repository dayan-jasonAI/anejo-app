// GET /api/hub/driver/schedule — the signed-in driver's upcoming scheduled shifts
// (next 14 days, status='scheduled'). Drivers (or the owner, for their own staff row).
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { today } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  const from = today();
  let to = from;
  try {
    const d = new Date(`${from}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 14);
    to = d.toISOString().slice(0, 10);
  } catch { /* keep from */ }

  let shifts = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT id, shift_date, start_at, end_at, label, notes, status FROM shift_schedule ' +
        "WHERE staff_id=? AND status='scheduled' AND shift_date >= ? AND shift_date < ? " +
        'ORDER BY shift_date, start_at LIMIT 50'
      )
      .bind(staff.id, from, to)
      .all();
    shifts = (res && res.results) || [];
  } catch { shifts = []; }

  return json({ ok: true, from, to, shifts });
};
