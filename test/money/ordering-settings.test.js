// Two owner-facing controls that used to require a developer.
//
// 1. Ordering mode lived only in environment variables, so "scheduled-ahead only this week" meant
//    a secret change and a redeploy. That is an operating decision, not a deployment.
// 2. The contract cutoff check: two DGP sites must send a headcount before 09:15, five days a
//    week. Missing it makes the order a rush. The owner previously found out AFTER the fact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onDemandConfig, windowState } from '../../functions/_lib/ondemand.js';

const noon = new Date('2026-07-28T16:00:00Z');   // 12:00 ET — inside the default 10:00–19:30 window

test('with no overrides, env/deploy defaults still apply', () => {
  const w = windowState({}, noon);
  assert.equal(w.open, true, 'midday is open by default');
  assert.equal(w.scheduledOnly, false);
});

test('scheduled_only closes same-day ordering regardless of the clock', () => {
  const w = windowState({}, noon, { scheduled_only: '1' });
  assert.equal(w.open, false, 'this is the whole feature');
  assert.equal(w.scheduledOnly, true);
  // /order already falls back to the scheduled flow whenever availability reports closed, so this
  // reuses a proven path instead of adding a second way to be shut.
});

test('turning it back off restores the normal window', () => {
  assert.equal(windowState({}, noon, { scheduled_only: '0' }).open, true);
});

test('a D1 override beats the environment variable', () => {
  const env = { ONDEMAND_OPEN_HOUR: '10', ONDEMAND_CLOSE_HOUR: '19', ONDEMAND_BOWL_LIMIT: '10' };
  const cfg = onDemandConfig(env, { open_hour: '7', close_hour: '11', bowl_limit: '40' });
  assert.equal(cfg.openHour, 7);
  assert.equal(cfg.closeHour, 11);
  assert.equal(cfg.limit, 40);
});

test('an empty or absent override falls back rather than zeroing the setting', () => {
  // A blank field in the HUB must not silently become "closes at midnight" or "cap of 0".
  const env = { ONDEMAND_CLOSE_HOUR: '19', ONDEMAND_BOWL_LIMIT: '10' };
  const cfg = onDemandConfig(env, { close_hour: '', bowl_limit: undefined });
  assert.equal(cfg.closeHour, 19);
  assert.equal(cfg.limit, 10);
});

test('a cap of zero is respected — it is a real choice, not a missing value', () => {
  assert.equal(onDemandConfig({}, { bowl_limit: '0' }).limit, 0);
});

test('out-of-range hours fall back instead of breaking the storefront', () => {
  const cfg = onDemandConfig({}, { open_hour: '99', close_hour: '-4' });
  assert.equal(cfg.openHour, 10, 'default');
  assert.equal(cfg.closeHour, 19, 'default');
});

// ---- the cutoff check's schedule ----

function fieldMatch(f, v) { return f === '*' ? true : f.split(',').some((p) => Number(p) === v); }
function cronMatches(expr, d) {
  const f = expr.split(/\s+/);
  return fieldMatch(f[0], d.getUTCMinutes()) && fieldMatch(f[1], d.getUTCHours()) &&
    fieldMatch(f[2], d.getUTCDate()) && fieldMatch(f[3], d.getUTCMonth() + 1) && fieldMatch(f[4], d.getUTCDay());
}
const etClock = (d) => new Intl.DateTimeFormat('en-US',
  { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(d);

test('the check lands before the 09:15 cutoff in BOTH daylight-saving states', () => {
  // A deadline job that drifts an hour twice a year is worse than no job at all.
  const summer = new Date('2026-07-28T13:03:00Z');
  const winter = new Date('2026-01-13T14:03:00Z');
  assert.equal(etClock(summer), '09:03', 'EDT');
  assert.equal(etClock(winter), '09:03', 'EST');
  assert.ok(cronMatches('3 13 * * 1,2,3,4,5', summer));
  assert.ok(cronMatches('3 14 * * 1,2,3,4,5', winter));
});

test('it does not run at weekends', () => {
  const sat = new Date('2026-08-01T13:03:00Z');
  assert.equal(cronMatches('3 13 * * 1,2,3,4,5', sat), false);
});

test('the redundant hour fires the cron but is harmless', () => {
  // 14:03Z in summer is 10:03 ET — past the cutoff, so the endpoint's own ET window check no-ops.
  const summerLate = new Date('2026-07-28T14:03:00Z');
  assert.ok(cronMatches('3 14 * * 1,2,3,4,5', summerLate), 'cron fires');
  assert.equal(etClock(summerLate), '10:03', 'but it is past 09:15, so the endpoint does nothing');
});
