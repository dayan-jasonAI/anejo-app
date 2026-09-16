// /api/hub/owner/timesheet — owner-only weekly hours, estimated pay, and shift corrections.
//   GET ?week=YYYY-MM-DD           → the Monday–Sunday (America/New_York) week containing that day
//                                    (default: this week): per person, each shift's in/out, breaks,
//                                    worked minutes, flags (open / forgotten / on_break / edited / long),
//                                    hourly pay for HOURLY staff only, route pay for PER-ROUTE staff only.
//   GET ?edits=<shift_id>          → that shift's correction history (who, when, why, old → new)
//   POST { op:'correct', shift_id, reason, clock_in_at|clock_in_et?, clock_out_at|clock_out_et?, break_minutes? }
//   POST { op:'close',   shift_id, reason, clock_out_at|clock_out_et, break_minutes? } → close a forgotten shift
// A reason is required for every change, and every change writes a shift_edits row. *_et values are
// ET wall-clock 'YYYY-MM-DDTHH:MM', so an edit means the same time whatever zone the phone is in.
// Math and the pay-basis rule live in _lib/timesheet.js, shared with the payroll CSV.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { addEtDays, parseJson } from '../../../_lib/hub.js';
import { weekOf, buildTimesheet, correctShift } from '../../../_lib/timesheet.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const editsFor = url.searchParams.get('edits');
  if (editsFor) {
    const res = await env.DB.prepare(
      `SELECT e.id, e.action, e.reason, e.old_values, e.new_values, e.created_at, e.edited_by, st.name AS edited_by_name
         FROM shift_edits e LEFT JOIN staff st ON st.id = e.edited_by
        WHERE e.shift_id = ? ORDER BY e.created_at DESC LIMIT 50`
    ).bind(editsFor).all();
    const edits = ((res && res.results) || []).map((e) => ({
      ...e, old_values: parseJson(e.old_values, {}), new_values: parseJson(e.new_values, {}),
    }));
    return json({ ok: true, shift_id: editsFor, edits });
  }

  const w = weekOf(url.searchParams.get('week'));
  const sheet = await buildTimesheet(env, { from: w.week_start, to: w.week_end });
  return json({
    ok: true,
    week_start: w.week_start,
    week_end: w.week_end,
    prev_week: addEtDays(w.week_start, -7),
    next_week: addEtDays(w.week_start, 7),
    timezone: 'America/New_York',
    staff: sheet.staff,
    totals: sheet.totals,
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const op = b && b.op;
  if (op !== 'correct' && op !== 'close') return bad('Unknown operation.');

  const r = await correctShift(env, { body: b, editorId: ctx.distinct_id, op });
  if (r.error) return bad(r.error, r.status || 400);
  return json({ ok: true, shift: r.shift, edit: r.edit });
};
