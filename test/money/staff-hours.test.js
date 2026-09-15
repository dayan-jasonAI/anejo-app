// Staff hours: breaks, the owner's weekly timesheet + corrections, and who is paid on which basis.
//
// Driven through the handlers the HUB pages call, against real SQLite with every migration applied
// (including 0110). The rates below are FIXTURES — deliberately fake repeating digits, not anyone's
// pay. The owner sets real rates per person in the HUB; none belong in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { weekOf, hourlyPayCents, effectivePayBasis, parseRateCents } from '../../functions/_lib/timesheet.js';
import { etWallClockMs, etDateOf } from '../../functions/_lib/hub.js';

const KITCHEN = 'anejo_sess=tok-kitchen';
const DRIVER = 'anejo_sess=tok-driver';
const MARKETING = 'anejo_sess=tok-marketing';
const FAKE_RATE_A = 1111;   // fixture: $11.11/hr
const FAKE_RATE_B = 2222;   // fixture: $22.22/hr
const MIN = 60000;

function env() {
  const e = ownerEnv();
  const t = Date.now();
  e.DB.sqlite.prepare("INSERT INTO staff (id, name, email, role, active, created_at, updated_at) VALUES ('stf_d','Wheels','d@test.example','driver',1,?,?)").run(t, t);
  e.SESSIONS.store.set('session:tok-driver', JSON.stringify({ type: 'staff', role: 'driver', uid: 'stf_d', email: 'd@test.example', la: t, created: t }));
  return e;
}

async function call(e, path, method, { cookie = OWNER_COOKIE, body, query = '' } = {}) {
  const mod = await import(`../../functions/api/hub/${path}.js`);
  const init = { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new Request(`https://anejo.test/api/hub/${path}${query}`, init);
  const res = await (method === 'GET' ? mod.onRequestGet : mod.onRequestPost)({ request, env: e });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const shiftRow = (e, id) => e.DB.one('SELECT * FROM shifts WHERE id = ?', id);
const openShiftOf = (e, staffId) => e.DB.one("SELECT * FROM shifts WHERE staff_id = ? AND status = 'open'", staffId);

// The test's stand-in for waiting: move the clock-in (or the running break) back in time.
function rewindClockIn(e, shiftId, minutes) {
  e.DB.sqlite.prepare('UPDATE shifts SET clock_in_at = clock_in_at - ? WHERE id = ?').run(minutes * MIN, shiftId);
}
function rewindOpenBreak(e, shiftId, minutes) {
  const breaks = JSON.parse(shiftRow(e, shiftId).breaks);
  breaks.find((b) => b.start && !b.stop).start -= minutes * MIN;
  e.DB.sqlite.prepare('UPDATE shifts SET breaks = ? WHERE id = ?').run(JSON.stringify(breaks), shiftId);
}

function insertShift(e, { id, staffId, inAt, outAt = null, breakMinutes = 0, breaks = null, status = 'closed' }) {
  const total = status === 'closed' ? Math.round((outAt - inAt) / MIN) - breakMinutes : null;
  e.DB.sqlite.prepare(
    'INSERT INTO shifts (id, staff_id, team, clock_in_at, clock_out_at, break_minutes, breaks, total_minutes, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id, staffId, 'kitchen', inAt, outAt, breakMinutes, breaks, total, status, inAt, 1);
}

// ---------------------------------------------------------------------------
// Breaks
// ---------------------------------------------------------------------------

test('kitchen: clock in → break → clock out computes worked minutes, and clock-out ends a forgotten break', async () => {
  const e = env();
  let r = await call(e, 'kitchen/clock-in', 'POST', { cookie: KITCHEN, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const shift = openShiftOf(e, 'stf_k');
  rewindClockIn(e, shift.id, 180);

  r = await call(e, 'kitchen/break', 'POST', { cookie: KITCHEN, body: { action: 'end' } });
  assert.equal(r.status, 409, 'no break to end yet');

  r = await call(e, 'kitchen/break', 'POST', { cookie: KITCHEN, body: { action: 'start' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.on_break, true);
  r = await call(e, 'kitchen/break', 'POST', { cookie: KITCHEN, body: { action: 'start' } });
  assert.equal(r.status, 409, 'one break at a time');

  rewindOpenBreak(e, shift.id, 30);
  r = await call(e, 'kitchen/break', 'POST', { cookie: KITCHEN, body: { action: 'end' } });
  assert.equal(r.body.break_minutes, 30);

  // A second break that is never ended: clocking out ends it, so it is not counted as worked.
  await call(e, 'kitchen/break', 'POST', { cookie: KITCHEN, body: { action: 'start' } });
  rewindOpenBreak(e, shift.id, 10);
  r = await call(e, 'kitchen/clock-out', 'POST', { cookie: KITCHEN, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const done = shiftRow(e, shift.id);
  assert.equal(done.status, 'closed');
  assert.equal(done.break_minutes, 40);
  assert.equal(done.total_minutes, 140, '180 minutes on the clock − 40 on break');
  const breaks = JSON.parse(done.breaks);
  assert.equal(breaks.length, 2);
  assert.ok(breaks.every((b) => b.stop && Number.isInteger(b.minutes)), 'every break is closed with whole minutes');

  r = await call(e, 'kitchen/break', 'POST', { cookie: KITCHEN, body: { action: 'start' } });
  assert.equal(r.status, 409, 'no break without an open shift');
});

test('driver: the same break rules, on the driver endpoints, for the driver only', async () => {
  const e = env();
  let r = await call(e, 'driver/clock-in', 'POST', { cookie: DRIVER, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const shift = openShiftOf(e, 'stf_d');
  rewindClockIn(e, shift.id, 300);

  r = await call(e, 'driver/break', 'POST', { cookie: KITCHEN, body: { action: 'start' } });
  assert.equal(r.status, 403, 'the kitchen cannot put a driver on break');
  r = await call(e, 'driver/break', 'POST', { cookie: DRIVER, body: { action: 'nap' } });
  assert.equal(r.status, 400);

  r = await call(e, 'driver/break', 'POST', { cookie: DRIVER, body: { action: 'start' } });
  assert.equal(r.body.on_break, true);
  rewindOpenBreak(e, shift.id, 45);
  r = await call(e, 'driver/clock-out', 'POST', { cookie: DRIVER, body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.shift.break_minutes, 45);
  assert.equal(r.body.shift.total_minutes, 255, '300 − 45');
  assert.equal(shiftRow(e, shift.id).total_minutes, 255);
});

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

test('a correction requires a reason, and records who, why, and the old and new values', async () => {
  const e = env();
  const day = etDateOf(Date.now() - 3 * 86400000);
  const inAt = etWallClockMs(`${day}T08:00`);
  const outAt = etWallClockMs(`${day}T16:00`);
  insertShift(e, { id: 'sh_fix', staffId: 'stf_k', inAt, outAt, breakMinutes: 30 });
  const before = shiftRow(e, 'sh_fix');
  assert.equal(before.total_minutes, 450);

  for (const reason of [undefined, '', '   ']) {
    const r = await call(e, 'owner/timesheet', 'POST', { body: { op: 'correct', shift_id: 'sh_fix', clock_out_et: `${day}T17:00`, reason } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /reason/i);
  }
  assert.deepEqual(shiftRow(e, 'sh_fix'), before, 'nothing changes without a reason');
  assert.equal(e.DB.one('SELECT COUNT(*) AS n FROM shift_edits').n, 0, 'and nothing is logged');

  const denied = await call(e, 'owner/timesheet', 'POST', { cookie: KITCHEN, body: { op: 'correct', shift_id: 'sh_fix', clock_out_et: `${day}T17:00`, reason: 'x' } });
  assert.equal(denied.status, 403, 'staff cannot correct their own hours');

  const bad1 = await call(e, 'owner/timesheet', 'POST', { body: { op: 'correct', shift_id: 'sh_fix', clock_out_et: `${day}T07:00`, reason: 'typo' } });
  assert.equal(bad1.status, 400, 'clock-out before clock-in');
  const bad2 = await call(e, 'owner/timesheet', 'POST', { body: { op: 'correct', shift_id: 'sh_fix', break_minutes: 600, reason: 'typo' } });
  assert.equal(bad2.status, 400, 'a break longer than the shift');

  const r = await call(e, 'owner/timesheet', 'POST', {
    body: { op: 'correct', shift_id: 'sh_fix', clock_out_et: `${day}T17:00`, reason: 'Stayed late for a catering order' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = shiftRow(e, 'sh_fix');
  assert.equal(after.clock_out_at, etWallClockMs(`${day}T17:00`));
  assert.equal(after.clock_in_at, inAt, 'what was not edited stays put');
  assert.equal(after.total_minutes, 510, 'recomputed: 9h − 30m');

  const edits = e.DB.rows('SELECT * FROM shift_edits WHERE shift_id = ?', 'sh_fix');
  assert.equal(edits.length, 1);
  assert.equal(edits[0].action, 'correct');
  assert.equal(edits[0].edited_by, 'stf_owner');
  assert.equal(edits[0].reason, 'Stayed late for a catering order');
  const oldV = JSON.parse(edits[0].old_values);
  const newV = JSON.parse(edits[0].new_values);
  assert.equal(oldV.clock_out_at, outAt);
  assert.equal(oldV.total_minutes, 450);
  assert.equal(newV.clock_out_at, etWallClockMs(`${day}T17:00`));
  assert.equal(newV.total_minutes, 510);

  const hist = await call(e, 'owner/timesheet', 'GET', { query: '?edits=sh_fix' });
  assert.equal(hist.body.edits[0].old_values.total_minutes, 450);
  assert.equal(hist.body.edits[0].reason, 'Stayed late for a catering order');
});

test('the owner closes a forgotten open shift; a break left running ends with it', async () => {
  const e = env();
  const inAt = Date.now() - 20 * 60 * MIN;
  const breakStart = inAt + 7.5 * 60 * MIN;
  insertShift(e, { id: 'sh_open', staffId: 'stf_d', inAt, status: 'open', breaks: JSON.stringify([{ start: breakStart, stop: null, minutes: null }]) });

  const sheet = await call(e, 'owner/timesheet', 'GET', { query: `?week=${etDateOf(Date.now())}` });
  assert.equal(sheet.status, 200, JSON.stringify(sheet.body));
  const drv = sheet.body.staff.find((p) => p.staff_id === 'stf_d');
  const s = drv.shifts.find((x) => x.id === 'sh_open');
  assert.ok(s.flags.includes('open') && s.flags.includes('forgotten') && s.flags.includes('on_break'), JSON.stringify(s.flags));
  assert.equal(s.worked_minutes, null, 'an open shift adds no hours until it is closed');
  assert.ok(sheet.body.totals.forgotten_shifts >= 1);

  let r = await call(e, 'owner/timesheet', 'POST', { body: { op: 'close', shift_id: 'sh_open', reason: 'Forgot to clock out' } });
  assert.equal(r.status, 400, 'closing needs the time they left');

  r = await call(e, 'owner/timesheet', 'POST', { body: { op: 'close', shift_id: 'sh_open', clock_out_at: inAt + 8 * 60 * MIN, reason: 'Forgot to clock out after the dinner route' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = shiftRow(e, 'sh_open');
  assert.equal(row.status, 'closed');
  assert.equal(row.break_minutes, 30, 'the running break ended at the clock-out the owner entered');
  assert.equal(row.total_minutes, 450);
  assert.ok(JSON.parse(row.breaks).every((b) => b.stop));
  assert.equal(e.DB.one("SELECT action FROM shift_edits WHERE shift_id = 'sh_open'").action, 'close');

  r = await call(e, 'owner/timesheet', 'POST', { body: { op: 'close', shift_id: 'sh_open', clock_out_at: inAt + 9 * 60 * MIN, reason: 'again' } });
  assert.equal(r.status, 409);
});

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

test('only the owner can read or write pay rates, and every change is logged old → new', async () => {
  const e = env();
  for (const cookie of [KITCHEN, DRIVER, MARKETING]) {
    assert.equal((await call(e, 'owner/staff/index', 'GET', { cookie })).status, 403);
    assert.equal((await call(e, 'owner/staff/index', 'POST', { cookie, body: { op: 'update', id: 'stf_k', pay_rate_cents: FAKE_RATE_A } })).status, 403);
    assert.equal((await call(e, 'owner/timesheet', 'GET', { cookie })).status, 403);
    assert.equal((await call(e, 'owner/report', 'POST', { cookie, body: { report_type: 'payroll', format: 'json' } })).status, 403);
  }
  assert.equal(e.DB.one("SELECT pay_rate_cents FROM staff WHERE id = 'stf_k'").pay_rate_cents, null);

  for (const bad of [12.5, '12.50', 0, -100, 20001, 'abc', true]) {
    const r = await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', pay_rate_cents: bad } });
    assert.equal(r.status, 400, `rate ${JSON.stringify(bad)} must be refused`);
  }
  assert.equal((await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', pay_basis: 'weekly' } })).status, 400);
  assert.equal((await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', employment_type: 'intern' } })).status, 400);
  assert.equal(e.DB.one('SELECT COUNT(*) AS n FROM staff_pay_log').n, 0, 'a refused change writes nothing');

  let r = await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', pay_rate_cents: FAKE_RATE_A, pay_basis: 'hourly', employment_type: 'w2' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pay_changes, 3);
  r = await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', pay_rate_cents: String(FAKE_RATE_B) } });
  assert.equal(r.body.pay_changes, 1);
  r = await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', pay_rate_cents: FAKE_RATE_B } });
  assert.equal(r.body.unchanged, true, 'the same rate again is not a change');

  const rateLog = e.DB.rows("SELECT * FROM staff_pay_log WHERE staff_id = 'stf_k' AND field = 'pay_rate_cents' ORDER BY created_at, rowid");
  assert.deepEqual(rateLog.map((l) => [l.old_value, l.new_value]), [[null, String(FAKE_RATE_A)], [String(FAKE_RATE_A), String(FAKE_RATE_B)]]);
  assert.ok(rateLog.every((l) => l.changed_by === 'stf_owner' && Number.isInteger(l.created_at)));

  const g = await call(e, 'owner/staff/index', 'GET', {});
  const cook = g.body.staff.find((s) => s.id === 'stf_k');
  const drv = g.body.staff.find((s) => s.id === 'stf_d');
  assert.equal(cook.pay_rate_cents, FAKE_RATE_B);
  assert.equal(cook.pay_basis, 'hourly');
  assert.equal(cook.employment_type, 'w2');
  assert.equal(drv.pay_basis, null);
  assert.equal(drv.pay_basis_effective, 'per_route', 'a driver with no basis set stays on route pay');

  r = await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_k', pay_basis: '' } });
  assert.equal(r.body.pay_changes, 1);
  assert.equal(e.DB.one("SELECT new_value FROM staff_pay_log WHERE field = 'pay_basis' ORDER BY created_at DESC, rowid DESC LIMIT 1").new_value, null);

  // The staff member's own clock screen carries no pay data.
  await call(e, 'kitchen/clock-in', 'POST', { cookie: KITCHEN, body: {} });
  const own = await call(e, 'kitchen/clock-out', 'GET', { cookie: KITCHEN });
  assert.ok(!JSON.stringify(own.body).includes('pay_rate'), 'no rate leaks to the kitchen');
});

// ---------------------------------------------------------------------------
// Payroll: hourly vs per route
// ---------------------------------------------------------------------------

test('payroll: hourly staff get hourly pay; a per-route driver shows hours, no hourly pay, and is never counted twice', async () => {
  const e = env();
  const t = Date.now();
  // Kitchen: Tue 08:00–16:00 ET with a 30-minute break → 450 min. Driver: Wed 10:00–14:00 ET → 240 min.
  insertShift(e, { id: 'sh_k', staffId: 'stf_k', inAt: etWallClockMs('2026-09-15T08:00'), outAt: etWallClockMs('2026-09-15T16:00'), breakMinutes: 30 });
  insertShift(e, { id: 'sh_d', staffId: 'stf_d', inAt: etWallClockMs('2026-09-16T10:00'), outAt: etWallClockMs('2026-09-16T14:00') });
  // Both have a rate on file — a rate alone never makes someone hourly.
  e.DB.sqlite.prepare("UPDATE staff SET pay_rate_cents = ? WHERE id IN ('stf_k', 'stf_d')").run(FAKE_RATE_A);
  // The driver's completed route that week, paid the existing per-route way.
  e.DB.sqlite.prepare("INSERT INTO routes (id, driver_id, route_date, status, pay_cents, created_at, updated_at) VALUES ('rt_1','stf_d','2026-09-16','completed',3300,?,?)").run(t, t);

  const report = async () => (await call(e, 'owner/report', 'POST', { body: { report_type: 'payroll', format: 'json', week: '2026-09-17' } })).body;
  const sheet = async () => (await call(e, 'owner/timesheet', 'GET', { query: '?week=2026-09-14' })).body;

  let rep = await report();
  assert.equal(rep.from, '2026-09-14');
  assert.equal(rep.to, '2026-09-20');
  assert.deepEqual(rep.headers.slice(0, 6), ['name', 'role', 'shifts', 'total_hours', 'break_minutes', 'est_pay'], 'the existing columns stay where they were');
  const col = (name) => rep.headers.indexOf(name);
  const rowOf = (name) => rep.rows.find((row) => row[0] === name);

  let cook = rowOf('Cook');
  let drv = rowOf('Wheels');
  assert.equal(cook[3], '7.50');
  assert.equal(cook[5], '83.33', '450 min at the fixture rate is 8332.5 cents → one half-up rounding');
  assert.equal(cook[col('pay_basis')], 'hourly');
  assert.equal(drv[3], '4.00', 'the per-route driver still shows hours');
  assert.equal(drv[5], '', 'but no hourly pay');
  assert.equal(drv[col('pay_basis')], 'per_route');
  assert.equal(drv[col('hourly_rate')], '');
  assert.equal(drv[col('route_pay')], '33.00');

  let s = await sheet();
  assert.equal(s.totals.hourly_pay_cents, 8333);
  assert.equal(s.totals.route_pay_cents, 3300);
  assert.equal(s.totals.est_total_pay_cents, 11633);
  let sd = s.staff.find((p) => p.staff_id === 'stf_d');
  assert.equal(sd.worked_minutes, 240);
  assert.equal(sd.hourly_pay_cents, null);
  assert.equal(sd.shifts[0].est_pay_cents, null);

  // The owner switches the driver to hourly.
  const r = await call(e, 'owner/staff/index', 'POST', { body: { op: 'update', id: 'stf_d', pay_basis: 'hourly' } });
  assert.equal(r.status, 200);

  rep = await report();
  cook = rowOf('Cook');
  drv = rowOf('Wheels');
  assert.equal(drv[5], '44.44', '240 min at the fixture rate');
  assert.equal(drv[col('route_pay')], '', 'route pay is no longer counted for them');
  assert.match(drv[col('flags')], /hourly_but_routes_carry_pay/, 'and the routes still carrying pay are flagged, not added');

  s = await sheet();
  sd = s.staff.find((p) => p.staff_id === 'stf_d');
  assert.equal(s.totals.hourly_pay_cents, 8333 + 4444);
  assert.equal(s.totals.route_pay_cents, 0);
  assert.equal(s.totals.est_total_pay_cents, 8333 + 4444, 'never hourly AND route pay for the same person');
  assert.equal(sd.route_pay_not_counted_cents, 3300);
  assert.equal(s.totals.route_pay_not_counted, 1);
});

// ---------------------------------------------------------------------------
// Weeks and math
// ---------------------------------------------------------------------------

test('pay weeks run Monday–Sunday in Eastern time, including across a DST change', () => {
  const w = weekOf('2026-09-16');
  assert.equal(w.week_start, '2026-09-14');
  assert.equal(w.week_end, '2026-09-20');
  assert.equal(w.start_ms, Date.UTC(2026, 8, 14, 4, 0), 'Monday midnight EDT');
  assert.equal(w.end_ms, Date.UTC(2026, 8, 21, 4, 0));
  for (const d of ['2026-09-14', '2026-09-20']) assert.equal(weekOf(d).week_start, '2026-09-14', d);
  assert.equal(weekOf('2026-09-21').week_start, '2026-09-21');

  const dst = weekOf('2026-11-01'); // clocks fall back that Sunday
  assert.equal(dst.week_start, '2026-10-26');
  assert.equal(dst.start_ms, Date.UTC(2026, 9, 26, 4, 0));
  assert.equal(dst.end_ms, Date.UTC(2026, 10, 2, 5, 0), 'the next Monday is midnight EST');
  assert.equal(dst.end_ms - dst.start_ms, 7 * 24 * 60 * MIN + 60 * MIN, 'that week really is an hour longer');

  assert.equal(etWallClockMs('2026-09-20T23:30'), Date.UTC(2026, 8, 21, 3, 30));
  assert.equal(etWallClockMs('2026-12-01T09:00'), Date.UTC(2026, 11, 1, 14, 0));
  assert.ok(Number.isNaN(etWallClockMs('9/20 11:30pm')));
});

test('a late Sunday shift belongs to its own ET week, not the UTC Monday it spills into', async () => {
  const e = env();
  insertShift(e, { id: 'sh_sun', staffId: 'stf_k', inAt: etWallClockMs('2026-09-20T23:30'), outAt: etWallClockMs('2026-09-21T01:30') });
  insertShift(e, { id: 'sh_mon', staffId: 'stf_k', inAt: etWallClockMs('2026-09-14T00:15'), outAt: etWallClockMs('2026-09-14T04:15') });
  insertShift(e, { id: 'sh_prev', staffId: 'stf_k', inAt: etWallClockMs('2026-09-13T23:00'), outAt: etWallClockMs('2026-09-14T01:00') });
  const cookFor = async (wk) => (await call(e, 'owner/timesheet', 'GET', { query: `?week=${wk}` })).body.staff.find((p) => p.staff_id === 'stf_k');

  const week = await cookFor('2026-09-17');
  assert.deepEqual(week.shifts.map((x) => x.id).sort(), ['sh_mon', 'sh_sun']);
  assert.equal(week.worked_minutes, 360);
  assert.deepEqual((await cookFor('2026-09-21')).shifts, []);
  assert.deepEqual((await cookFor('2026-09-13')).shifts.map((x) => x.id), ['sh_prev']);

  const rep = (await call(e, 'owner/report', 'POST', { body: { report_type: 'payroll', format: 'json', week: '2026-09-14' } })).body;
  assert.equal(rep.rows.find((row) => row[0] === 'Cook')[3], '6.00', 'the CSV agrees with the screen');
});

test('the pay math is exact integers and the basis defaults follow the role', () => {
  assert.equal(hourlyPayCents(450, FAKE_RATE_A), 8333);
  assert.equal(hourlyPayCents(30, 1), 1, 'half a cent rounds up');
  assert.equal(hourlyPayCents(29, 1), 0);
  assert.equal(hourlyPayCents(60, null), null);
  assert.equal(hourlyPayCents(1.5, FAKE_RATE_A), null, 'minutes are whole');

  assert.equal(effectivePayBasis({ role: 'kitchen' }), 'hourly');
  assert.equal(effectivePayBasis({ role: 'driver' }), 'per_route');
  assert.equal(effectivePayBasis({ role: 'driver', pay_basis: 'hourly' }), 'hourly', 'the owner’s choice wins');
  assert.equal(effectivePayBasis({ role: 'marketing' }, false), null);
  assert.equal(effectivePayBasis({ role: 'marketing' }, true), 'hourly');

  assert.deepEqual(parseRateCents(null), { ok: true, value: null });
  assert.equal(parseRateCents(20000).value, 20000);
  assert.ok(parseRateCents(20001).error);
});
