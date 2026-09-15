// Federal holidays, and the two promises the landing page makes about them.
//
// The calendar is the part that has to be right. A reminder that arrives on the wrong Monday is
// worse than no reminder, because the client stops trusting the ones that do arrive — including the
// one that says the kitchen is shut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { federalHolidays, upcomingHolidays, observedDate, daysUntil, HOLIDAY_KEYS } from '../../functions/_lib/holidays.js';

test('the observed date follows 5 U.S.C. §6103, including across a year boundary', () => {
  const on = (year, key) => federalHolidays(year).find((h) => h.key === key);

  // Falls midweek: observed on the day itself.
  assert.equal(on(2026, 'thanksgiving').observed, '2026-11-26');
  assert.equal(on(2026, 'memorial_day').observed, '2026-05-25');

  // Saturday shifts BACK to the Friday.
  assert.equal(on(2026, 'independence_day').date, '2026-07-04');
  assert.equal(on(2026, 'independence_day').observed, '2026-07-03', 'a Saturday holiday closes offices on the Friday');
  assert.equal(on(2027, 'christmas_day').observed, '2027-12-24');
  assert.equal(on(2027, 'juneteenth').observed, '2027-06-18');

  // Sunday shifts FORWARD to the Monday.
  assert.equal(observedDate(new Date(Date.UTC(2027, 6, 4, 12))).toISOString().slice(0, 10), '2027-07-05');

  // THE CRUEL ONE. 1 January 2028 is a Saturday, so it is observed on 31 December 2027 — in the
  // previous calendar year. Any scan that looks at one year misses it entirely.
  assert.equal(on(2028, 'new_years_day').observed, '2027-12-31');

  assert.equal(HOLIDAY_KEYS.length, 11, 'all eleven federal holidays');
});

test('a 30-day scan in late December spans the year boundary', () => {
  const keys = upcomingHolidays(Date.parse('2027-12-20T12:00:00Z'), 30).map((h) => `${h.key}@${h.observed}`);
  assert.deepEqual(keys, ['christmas_day@2027-12-24', 'new_years_day@2027-12-31', 'mlk_day@2028-01-17']);
  assert.equal(daysUntil('2027-12-24', Date.parse('2027-12-20T23:00:00Z')), 4, 'counted in whole days, not by clock time');
});

test('the seven-day closure floor cannot be lowered by a setting', async () => {
  const { loadHolidaySettings, MIN_CLOSURE_LEAD_DAYS } = await import('../../functions/_lib/holiday_notices.js');
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  const env = ownerEnv();
  const put = (k, v) => env.DB.sqlite.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,0)').run(k, v);

  put('holidays.closure_lead_days', '2');
  let s = await loadHolidaySettings(env);
  assert.equal(s.closure_lead_days, MIN_CLOSURE_LEAD_DAYS, 'the promise is in writing; a setting may not quietly break it');

  put('holidays.closure_lead_days', '21');
  s = await loadHolidaySettings(env);
  assert.equal(s.closure_lead_days, 21, 'raising it is the owner’s business');
});

test('which holidays the kitchen closes for is never guessed', async () => {
  const { loadHolidaySettings } = await import('../../functions/_lib/holiday_notices.js');
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  const env = ownerEnv();
  const put = (k, v) => env.DB.sqlite.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?,?,0)').run(k, v);

  let s = await loadHolidaySettings(env);
  assert.deepEqual(s.kitchen_closed, [], 'empty until the owner says otherwise — a closure nobody decided is a delivery nobody makes');

  // Garbage in the setting must not become a guessed list either.
  put('holidays.kitchen_closed', 'not json');
  s = await loadHolidaySettings(env);
  assert.deepEqual(s.kitchen_closed, []);

  put('holidays.kitchen_closed', '["thanksgiving","not_a_holiday"]');
  s = await loadHolidaySettings(env);
  assert.deepEqual(s.kitchen_closed, ['thanksgiving'], 'an unknown key is dropped, not passed through');
});
