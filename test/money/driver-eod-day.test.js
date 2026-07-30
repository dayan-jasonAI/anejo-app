// The end-of-day report, and the day it belongs to.
//
// Anejo House Delivery clocked in 1:08 PM ET on the 29th and out 12:38 AM on the 30th, then filed
// their report at 12:37 AM. Every field came back empty: shift duration, route status, temperature
// logs. Three separate defects stacked up, and each one is pinned below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etDayBounds, etDateOf, addEtDays } from '../../functions/_lib/hub.js';

const EOD = readFileSync(new URL('../../functions/api/hub/driver/eod/submit.js', import.meta.url), 'utf8');

// ---------- 1. the day was bounded in UTC while the date was ET ----------

test('an ET day starts at ET midnight, not UTC midnight', () => {
  // `new Date('2026-07-30T00:00:00')` has NO ZONE, so on a Worker it is midnight UTC — 8 PM the
  // previous evening in ET. Evening work fell outside its own day; the previous evening's fell in.
  const { start, end } = etDayBounds('2026-07-30');
  assert.equal(new Date(start).toISOString(), '2026-07-30T04:00:00.000Z', 'EDT is UTC-4');
  assert.equal(new Date(end).toISOString(), '2026-07-31T04:00:00.000Z');
});

test('it follows daylight saving instead of hardcoding an offset', () => {
  assert.equal(new Date(etDayBounds('2026-01-15').start).toISOString(), '2026-01-15T05:00:00.000Z', 'EST is UTC-5');
});

test("the real shift now falls inside the day it was worked", () => {
  // clock_in 1785344927195 = 2026-07-29 13:08 ET. Under the old UTC bounds for report_date
  // 2026-07-30 this was BEFORE dayStart and the shift vanished.
  const clockIn = 1785344927195;
  assert.equal(etDateOf(clockIn), '2026-07-29');
  const d29 = etDayBounds('2026-07-29');
  assert.ok(clockIn >= d29.start && clockIn < d29.end, 'inside the 29th');
  const d30 = etDayBounds('2026-07-30');
  assert.ok(clockIn < d30.start, 'and outside the 30th, which is why it had to be re-dated');
});

test('the zone-less parse is gone from the report entirely', () => {
  assert.ok(!/new Date\(`\$\{date\}T00:00:00`\)/.test(EOD), 'no un-zoned date parsing left');
  assert.match(EOD, /const \{ start: dayStart, end: dayEnd \} = etDayBounds\(date\)/);
});

// ---------- 2. a shift crossing midnight ----------

test('a report filed after midnight belongs to the shift, not the clock', () => {
  // Filing at 12:37 AM stamped TOMORROW, which has no shift, no route and no deliveries on it.
  assert.match(EOD, /async function reportDateFor\(env, staffId, etToday\)/);
  assert.match(EOD, /if \(shiftDate === etToday\) return etToday;/);
  assert.match(EOD, /return stillRelevant \? shiftDate : etToday;/);
});

test('it only looks back one day, and only at a shift being wrapped up', () => {
  // Otherwise a driver filing a genuinely new day's report at 6 AM gets dragged backwards.
  assert.match(EOD, /const prev = addEtDays\(etToday, -1\)/);
  assert.match(EOD, /now\(\) - ended\) < 6 \* 60 \* 60 \* 1000/);
  assert.equal(addEtDays('2026-07-30', -1), '2026-07-29');
  assert.equal(addEtDays('2026-03-09', -1), '2026-03-08', 'and across a DST switch');
});

test('GET and POST resolve the report date the same way', () => {
  // Two different answers means the form shows one day and saves another.
  const hits = EOD.match(/await reportDateFor\(env, staff\.id, today\(\)\)/g) || [];
  assert.equal(hits.length, 2, 'the draft view and the save both use it');
});

// ---------- 3. duration was null on every report ever filed ----------

test('shift duration is reported while the shift is still open', () => {
  // total_minutes is only written at clock-out, and a driver writes the EOD BEFORE going home —
  // so shift_minutes was null on every report in the table, not just the midnight one.
  assert.match(EOD, /shiftMinutes = Math\.max\(0, Math\.round\(\(now\(\) - Number\(shift\.clock_in_at\)\) \/ 60000\)\)/);
  assert.match(EOD, /shift_still_open: shiftOpen/);
});

test('an open shift is labelled as running, not presented as a finished total', () => {
  assert.match(EOD, /so far/);
});

// ---------- the geocoding diagnostic must not confidently mislead ----------

test('the geo hint reads Google\'s MESSAGE, not just the status code', () => {
  // Google returns REQUEST_DENIED for billing, for a referrer-restricted key, AND for an API that
  // is not enabled — three different fixes behind one code. Keying advice off the status alone
  // pointed at the wrong one, which is worse than no advice: it sends someone to change a setting
  // that was never the problem. It did exactly that on the first real run.
  const GEO = readFileSync(new URL('../../functions/_lib/geo.js', import.meta.url), 'utf8');
  assert.match(GEO, /const msg = String\(f\.message \|\| ''\)\.toLowerCase\(\)/);
  assert.match(GEO, /if \(msg\.includes\('billing'\)\)/);
  assert.ok(GEO.indexOf("msg.includes('billing')") < GEO.indexOf("f.status === 'REQUEST_DENIED'"),
    'the message is checked BEFORE falling back to the bare status');
});
