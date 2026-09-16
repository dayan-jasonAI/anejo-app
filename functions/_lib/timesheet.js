// Staff hours → pay. The shared math behind the kitchen/driver break buttons, the owner's weekly
// timesheet + corrections, and the payroll CSV. Files under functions/_lib are not routed.
//
// ONE CLOCK TABLE. `shifts` (0003) already holds clock in/out, breaks and total_minutes; this file
// only reads and corrects it. Everything is integer minutes and integer cents — a timesheet that
// drifts a cent per shift is a timesheet nobody can reconcile against a paycheck.
//
// PAY BASIS IS THE OWNER'S DECISION, PER PERSON (staff.pay_basis, migration 0110):
//   'hourly'    → worked minutes × pay_rate_cents.
//   'per_route' → paid by routes.pay_cents (owner/payouts.js), exactly as before. Their shifts
//                 still show HOURS, because hours are useful, but never hourly pay.
//   NULL        → today's behavior: kitchen hourly, driver per_route, anyone else hourly once they
//                 have shifts.
// A person is on exactly one basis at a time, so no total built here ever adds hourly pay AND
// route pay for the same person. Switching a driver to hourly moves them off route pay in these
// totals; the routes themselves still carry pay_cents in Payouts, so the timesheet flags that
// rather than silently paying twice.
import { json, bad } from './util.js';
import { requireRole, currentStaff } from './roles.js';
import { capture } from './track.js';
import { id, now, today, etMidnightMs, addEtDays, etDateOf, etWallClockMs, parseJson, toJson } from './hub.js';

export const PAY_BASES = ['hourly', 'per_route'];
export const EMPLOYMENT_TYPES = ['w2', 'contractor', 'external'];
export const MAX_RATE_CENTS = 20000;               // a sanity ceiling on a typo, not a pay policy
export const FORGOTTEN_AFTER_MIN = 12 * 60;        // same threshold the owner staff page already uses
export const MAX_SHIFT_MIN = 24 * 60;              // a correction longer than a day is a typo
export const MAX_REASON = 500;
const MIN_MS = 60000;
const FUTURE_SKEW_MS = 5 * MIN_MS;

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && Number.isFinite(Date.parse(`${s}T12:00:00Z`));

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The basis a person is actually paid on — see the header. `hasShifts` only matters for NULL non-kitchen/driver rows. */
export function effectivePayBasis(staff, hasShifts) {
  const b = staff && staff.pay_basis;
  if (PAY_BASES.includes(b)) return b;
  const role = staff && staff.role;
  if (role === 'kitchen') return 'hourly';
  if (role === 'driver') return 'per_route';
  return hasShifts ? 'hourly' : null;
}

/**
 * Validate an hourly rate from the owner. Integer cents only, 0 < rate ≤ MAX_RATE_CENTS.
 * null / '' clears the rate (itself a logged money change). Returns { ok, value } | { error }.
 */
export function parseRateCents(v) {
  if (v === null || v === '') return { ok: true, value: null };
  let n;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string' && /^\d+$/.test(v.trim())) n = Number(v.trim());
  else return { error: 'Rate must be a whole number of cents.' };
  if (!Number.isInteger(n)) return { error: 'Rate must be a whole number of cents.' };
  if (n <= 0 || n > MAX_RATE_CENTS) return { error: `Rate must be more than 0 and at most ${MAX_RATE_CENTS} cents an hour.` };
  return { ok: true, value: n };
}

/** Whole minutes in a span of ms (never negative) — the same rounding clock-out has always used. */
export function wholeMinutes(ms) {
  return Math.max(0, Math.round(Number(ms) / MIN_MS));
}

/** Worked minutes = gross clock minutes − break minutes, floored at 0. */
export function workedMinutes(clockInAt, clockOutAt, breakMinutes) {
  return Math.max(0, wholeMinutes(Number(clockOutAt) - Number(clockInAt)) - (Number(breakMinutes) || 0));
}

/** minutes × cents/hour, as exact integer cents: one half-up rounding at the very end. */
export function hourlyPayCents(minutes, rateCents) {
  if (!Number.isInteger(minutes) || minutes < 0 || !Number.isInteger(rateCents) || rateCents <= 0) return null;
  return Math.floor((minutes * rateCents + 30) / 60);
}

/** Monday–Sunday (America/New_York) week containing `dateStr` (default: today ET), with [start_ms, end_ms). */
export function weekOf(dateStr) {
  const ymd = isYmd(dateStr) ? dateStr : today();
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();          // 0 = Sunday
  const monday = addEtDays(ymd, -((dow + 6) % 7));
  const nextMonday = addEtDays(monday, 7);
  return { week_start: monday, week_end: addEtDays(monday, 6), start_ms: etMidnightMs(monday), end_ms: etMidnightMs(nextMonday) };
}

/** Inclusive ET date range → [start_ms, end_ms). */
export function rangeOf(from, to) {
  return { start_ms: etMidnightMs(from), end_ms: etMidnightMs(addEtDays(to, 1)) };
}

export function breaksOf(shift) {
  const b = parseJson(shift && shift.breaks, []);
  return Array.isArray(b) ? b.filter((x) => x && typeof x === 'object').map((x) => ({ ...x })) : [];
}

/** The break in progress ({start, stop:null}), or null. */
export function openBreakOf(breaks) {
  return (breaks || []).find((b) => b && b.start && !b.stop) || null;
}

/**
 * Close a break in progress at `ts` (clock-out, or the owner closing a forgotten shift).
 * Returns { breaks, break_minutes, closed_minutes } — unchanged when no break is open.
 */
export function closeOpenBreak(breaks, breakMinutes, ts) {
  const list = (breaks || []).map((b) => ({ ...b }));
  const open = openBreakOf(list);
  let total = Number(breakMinutes) || 0;
  if (!open) return { breaks: list, break_minutes: total, closed_minutes: 0 };
  const stop = Math.max(Number(open.start), Number(ts));
  const mins = wholeMinutes(stop - Number(open.start));
  open.stop = stop;
  open.minutes = mins;
  total += mins;
  return { breaks: list, break_minutes: total, closed_minutes: mins };
}

// ---------------------------------------------------------------------------
// Break start/end — shared by /api/hub/kitchen/break and /api/hub/driver/break
// ---------------------------------------------------------------------------

/** POST { action: 'start' | 'end' } against the caller's own open shift. */
export async function handleBreak(request, env, roles) {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, roles);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this session.', 403);

  let b = {};
  try { b = await request.json(); } catch { /* validated below */ }
  const action = b && b.action;
  if (action !== 'start' && action !== 'end') return bad("action must be 'start' or 'end'.");

  const shift = await env.DB
    .prepare("SELECT * FROM shifts WHERE staff_id = ? AND status = 'open' ORDER BY clock_in_at DESC LIMIT 1")
    .bind(staff.id).first();
  if (!shift) return bad('Clock in first.', 409);

  const ts = now();
  const breaks = breaksOf(shift);
  let breakMinutes = Number(shift.break_minutes) || 0;
  let minutes = 0;

  if (action === 'start') {
    if (openBreakOf(breaks)) return bad('You are already on a break.', 409);
    breaks.push({ start: ts, stop: null, minutes: null });
  } else {
    if (!openBreakOf(breaks)) return bad('No break in progress.', 409);
    const closed = closeOpenBreak(breaks, breakMinutes, ts);
    breaks.splice(0, breaks.length, ...closed.breaks);
    breakMinutes = closed.break_minutes;
    minutes = closed.closed_minutes;
  }

  // Guarded on status so a break can never be written onto a shift that closed mid-request.
  const r = await env.DB
    .prepare("UPDATE shifts SET breaks = ?, break_minutes = ?, updated_at = ? WHERE id = ? AND status = 'open'")
    .bind(toJson(breaks), breakMinutes, ts, shift.id).run();
  if (!r || !r.meta || !r.meta.changes) return bad('That shift just closed.', 409);

  if (action === 'end') {
    await capture(env, {
      event: 'shift.break_logged',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { break_minutes: minutes, shift_id: shift.id, platform: 'pwa' },
    });
  }

  return json({ ok: true, action, on_break: action === 'start', shift_id: shift.id, break_minutes: breakMinutes, breaks });
}

// ---------------------------------------------------------------------------
// The timesheet
// ---------------------------------------------------------------------------

/**
 * Hours and estimated pay per person for an inclusive ET date range.
 *
 * A shift belongs to the range it STARTED in, so a shift is counted once, never in two weeks.
 * Shifts still open from before the range are listed too — a forgotten clock-out is exactly what
 * the owner must see — but an open shift adds no hours until it is closed.
 */
export async function buildTimesheet(env, { from, to, nowMs }) {
  const t = Number.isFinite(nowMs) ? nowMs : now();
  const { start_ms, end_ms } = rangeOf(from, to);

  const shiftRes = await env.DB.prepare(
    `SELECT sh.id, sh.staff_id, sh.team, sh.clock_in_at, sh.clock_out_at, sh.break_minutes, sh.breaks,
            sh.total_minutes, sh.status, sh.minutes_late,
            (SELECT COUNT(*) FROM shift_edits e WHERE e.shift_id = sh.id) AS edit_count
       FROM shifts sh
      WHERE (sh.clock_in_at >= ? AND sh.clock_in_at < ?)
         OR (sh.status = 'open' AND sh.clock_in_at < ?)
      ORDER BY sh.clock_in_at ASC`
  ).bind(start_ms, end_ms, end_ms).all();
  const shifts = (shiftRes && shiftRes.results) || [];

  // Route pay for the same dates, completed routes only (what Payouts treats as earned).
  let routeRows = [];
  try {
    const rr = await env.DB.prepare(
      `SELECT driver_id, COALESCE(SUM(pay_cents), 0) AS pay_cents, COUNT(*) AS route_count
         FROM routes
        WHERE status = 'completed' AND driver_id IS NOT NULL AND route_date >= ? AND route_date <= ?
        GROUP BY driver_id`
    ).bind(from, to).all();
    routeRows = (rr && rr.results) || [];
  } catch { routeRows = []; }
  const routeBy = new Map(routeRows.map((r) => [r.driver_id, r]));

  const staffRes = await env.DB.prepare(
    'SELECT id, name, role, team, employment_type, pay_rate_cents, pay_basis, active FROM staff ORDER BY name'
  ).all();
  const shiftsBy = new Map();
  for (const s of shifts) {
    if (!shiftsBy.has(s.staff_id)) shiftsBy.set(s.staff_id, []);
    shiftsBy.get(s.staff_id).push(s);
  }

  const people = [];
  const totals = {
    worked_minutes: 0, break_minutes: 0, shift_count: 0, hourly_pay_cents: 0, route_pay_cents: 0,
    est_total_pay_cents: 0, open_shifts: 0, forgotten_shifts: 0, rate_missing: 0, route_pay_not_counted: 0,
  };

  for (const st of (staffRes && staffRes.results) || []) {
    const mine = shiftsBy.get(st.id) || [];
    const route = routeBy.get(st.id) || null;
    const onHubRoster = st.active && (st.role === 'kitchen' || st.role === 'driver');
    if (!mine.length && !route && !onHubRoster) continue;

    const basis = effectivePayBasis(st, mine.length > 0);
    const rate = Number.isInteger(st.pay_rate_cents) && st.pay_rate_cents > 0 ? st.pay_rate_cents : null;
    const person = {
      staff_id: st.id, name: st.name || st.id, role: st.role || null, team: st.team || null,
      employment_type: st.employment_type || null, active: !!st.active,
      pay_basis: basis, pay_basis_set: PAY_BASES.includes(st.pay_basis), pay_rate_cents: rate,
      shifts: [], shift_count: 0, worked_minutes: 0, break_minutes: 0, open_shifts: 0, forgotten_shifts: 0,
      hourly_pay_cents: null, rate_missing: false,
      route_pay_cents: null, route_count: route ? route.route_count : 0, route_pay_not_counted_cents: null,
    };

    for (const s of mine) {
      const inRange = s.clock_in_at >= start_ms && s.clock_in_at < end_ms;
      const breaks = breaksOf(s);
      const open = s.status === 'open';
      const flags = [];
      let worked = null;
      let elapsed = null;
      if (open) {
        elapsed = wholeMinutes(t - s.clock_in_at);
        flags.push('open');
        if (elapsed >= FORGOTTEN_AFTER_MIN) flags.push('forgotten');
        if (openBreakOf(breaks)) flags.push('on_break');
        if (!inRange) flags.push('before_range');
        person.open_shifts += 1;
        if (flags.includes('forgotten')) person.forgotten_shifts += 1;
      } else {
        worked = Number.isInteger(s.total_minutes)
          ? s.total_minutes
          : (s.clock_out_at ? workedMinutes(s.clock_in_at, s.clock_out_at, s.break_minutes) : 0);
        if (worked > FORGOTTEN_AFTER_MIN) flags.push('long');
      }
      if (s.edit_count > 0) flags.push('edited');

      if (inRange && !open) {
        person.shift_count += 1;
        person.worked_minutes += worked;
        person.break_minutes += Number(s.break_minutes) || 0;
      }
      person.shifts.push({
        id: s.id, date: etDateOf(s.clock_in_at), clock_in_at: s.clock_in_at, clock_out_at: s.clock_out_at || null,
        status: s.status, break_minutes: Number(s.break_minutes) || 0, breaks, worked_minutes: worked,
        elapsed_minutes: elapsed, minutes_late: s.minutes_late == null ? null : s.minutes_late,
        in_range: inRange, edit_count: s.edit_count || 0, flags,
        // Per-shift estimate for reading only; the person's total is computed once from total minutes.
        est_pay_cents: basis === 'hourly' && rate && worked != null ? hourlyPayCents(worked, rate) : null,
      });
    }

    if (basis === 'hourly') {
      if (rate) person.hourly_pay_cents = hourlyPayCents(person.worked_minutes, rate);
      else person.rate_missing = person.worked_minutes > 0;
      // Hourly now, but routes in this range still carry route pay in Payouts — shown, never added.
      if (route && route.pay_cents > 0) person.route_pay_not_counted_cents = route.pay_cents;
    } else if (basis === 'per_route') {
      person.route_pay_cents = route ? route.pay_cents : 0;
    }

    totals.worked_minutes += person.worked_minutes;
    totals.break_minutes += person.break_minutes;
    totals.shift_count += person.shift_count;
    totals.hourly_pay_cents += person.hourly_pay_cents || 0;
    totals.route_pay_cents += person.route_pay_cents || 0;
    totals.open_shifts += person.open_shifts;
    totals.forgotten_shifts += person.forgotten_shifts;
    if (person.rate_missing) totals.rate_missing += 1;
    if (person.route_pay_not_counted_cents) totals.route_pay_not_counted += 1;
    people.push(person);
  }
  totals.est_total_pay_cents = totals.hourly_pay_cents + totals.route_pay_cents;

  return { from, to, start_ms, end_ms, staff: people, totals };
}

// ---------------------------------------------------------------------------
// Owner corrections
// ---------------------------------------------------------------------------

function timeField(body, msKey, etKey) {
  if (body[msKey] !== undefined && body[msKey] !== null && body[msKey] !== '') {
    const n = Number(body[msKey]);
    return Number.isInteger(n) ? { value: n } : { error: `${msKey} must be a whole epoch-ms value.` };
  }
  if (body[etKey] !== undefined && body[etKey] !== null && body[etKey] !== '') {
    const n = etWallClockMs(body[etKey]);
    return Number.isFinite(n) ? { value: n } : { error: `${etKey} must look like YYYY-MM-DDTHH:MM.` };
  }
  return { value: undefined };
}

const snapshot = (s) => ({
  clock_in_at: s.clock_in_at, clock_out_at: s.clock_out_at == null ? null : s.clock_out_at,
  break_minutes: Number(s.break_minutes) || 0, total_minutes: s.total_minutes == null ? null : s.total_minutes,
  status: s.status,
});

/**
 * Edit clock_in_at / clock_out_at / break_minutes of one shift, or close a forgotten open one.
 * body: { shift_id, reason (required), clock_in_at|clock_in_et?, clock_out_at|clock_out_et?, break_minutes? }
 * `op: 'close'` requires a clock-out and an open shift. Returns { ok, shift, edit } | { error, status }.
 */
export async function correctShift(env, { body, editorId, op, nowMs }) {
  const ts = Number.isFinite(nowMs) ? nowMs : now();
  const shiftId = body && body.shift_id;
  if (!shiftId) return { error: 'Missing shift_id.', status: 400 };
  const reason = String((body && body.reason) || '').trim();
  if (!reason) return { error: 'A reason is required for every correction.', status: 400 };
  if (reason.length > MAX_REASON) return { error: `Keep the reason under ${MAX_REASON} characters.`, status: 400 };

  const shift = await env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(shiftId).first();
  if (!shift) return { error: 'Shift not found.', status: 404 };
  const wasOpen = shift.status === 'open';

  const inF = timeField(body, 'clock_in_at', 'clock_in_et');
  if (inF.error) return { error: inF.error, status: 400 };
  const outF = timeField(body, 'clock_out_at', 'clock_out_et');
  if (outF.error) return { error: outF.error, status: 400 };

  let breakMinutes = Number(shift.break_minutes) || 0;
  const breakGiven = body.break_minutes !== undefined && body.break_minutes !== null && body.break_minutes !== '';
  if (breakGiven) {
    const n = Number(body.break_minutes);
    if (!Number.isInteger(n) || n < 0) return { error: 'break_minutes must be a whole number, 0 or more.', status: 400 };
    breakMinutes = n;
  }

  if (op === 'close' && !wasOpen) return { error: 'That shift is already closed.', status: 409 };
  if (op === 'close' && outF.value === undefined) return { error: 'Closing a shift needs the time they actually left.', status: 400 };
  if (!wasOpen && outF.value === null) return { error: 'A closed shift cannot be reopened.', status: 400 };

  const clockIn = inF.value !== undefined ? inF.value : Number(shift.clock_in_at);
  const clockOut = outF.value !== undefined ? outF.value : (shift.clock_out_at == null ? null : Number(shift.clock_out_at));
  const closing = wasOpen && clockOut != null;

  if (clockIn > ts + FUTURE_SKEW_MS) return { error: 'Clock-in cannot be in the future.', status: 400 };
  let breaks = breaksOf(shift);
  if (clockOut != null) {
    if (clockOut <= clockIn) return { error: 'Clock-out must be after clock-in.', status: 400 };
    if (clockOut > ts + FUTURE_SKEW_MS) return { error: 'Clock-out cannot be in the future.', status: 400 };
    if (wholeMinutes(clockOut - clockIn) > MAX_SHIFT_MIN) return { error: 'A shift cannot be longer than 24 hours — check the date.', status: 400 };
    if (closing) {
      // A break still running when the shift is closed ends when the shift ends.
      const closed = closeOpenBreak(breaks, Number(shift.break_minutes) || 0, clockOut);
      breaks = closed.breaks;
      if (!breakGiven) breakMinutes = closed.break_minutes;
    }
    if (breakMinutes > wholeMinutes(clockOut - clockIn)) return { error: 'Breaks cannot be longer than the shift.', status: 400 };
  }

  const status = clockOut != null ? 'closed' : 'open';
  const next = {
    clock_in_at: clockIn, clock_out_at: clockOut, break_minutes: breakMinutes,
    total_minutes: status === 'closed' ? workedMinutes(clockIn, clockOut, breakMinutes) : null, status,
  };
  const before = snapshot(shift);
  if (JSON.stringify(before) === JSON.stringify(next)) return { error: 'Nothing to change.', status: 400 };

  const action = closing ? 'close' : 'correct';
  const editId = id('sedit');
  // Audit first, then the change — both guarded on the row we read, in one transaction, so a
  // clock-out landing mid-edit makes BOTH do nothing rather than logging a change that never applied.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shift_edits (id, shift_id, staff_id, action, reason, old_values, new_values, edited_by, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM shifts WHERE id = ? AND updated_at = ?)`
    ).bind(editId, shift.id, shift.staff_id, action, reason, toJson(before), toJson(next), editorId || null, ts, shift.id, shift.updated_at),
    env.DB.prepare(
      `UPDATE shifts SET clock_in_at = ?, clock_out_at = ?, break_minutes = ?, breaks = ?, total_minutes = ?, status = ?, updated_at = ?
        WHERE id = ? AND updated_at = ?`
    ).bind(clockIn, clockOut, breakMinutes, toJson(breaks), next.total_minutes, status, ts, shift.id, shift.updated_at),
  ]);
  const changed = results && results[1] && results[1].meta && results[1].meta.changes;
  if (!changed) return { error: 'That shift changed while you were editing — reload and try again.', status: 409 };

  const updated = await env.DB.prepare('SELECT * FROM shifts WHERE id = ?').bind(shift.id).first();
  return { ok: true, shift: updated, edit: { id: editId, action, reason, old_values: before, new_values: next } };
}
