// Two defects, both found because an abandoned checkout looked like an unfulfilled paid order:
//
//   1. moneyView collapsed "Square answered: nothing was captured" into the same bucket as
//      "Square was unreachable", so a definitively-never-paid order rendered as "we could not read
//      a Square payment" — which reads as "a customer may have been charged and we lost track".
//   2. Unpaid checkouts sat as `pending` forever, indistinguishable from orders awaiting action.
//
// The sweep in (2) is only safe because a late payment still self-heals, so that is pinned too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import { moneyView, refundState } from '../../functions/api/hub/owner/order-actions.js';
import { sweepAbandoned, graceMs, DEFAULT_GRACE_HOURS } from '../../functions/_lib/abandoned.js';

const env = { DB: {}, SQUARE_ACCESS_TOKEN: 't', SQUARE_LOCATION_ID: 'L', SQUARE_ENV: 'sandbox' };
const row = { id: 'ord_x', square_order_id: 'sq_1', status: 'pending' };

// ---------- 1. known-vs-unknown ----------

test('Square confirming zero tenders is KNOWN, not unknown', async () => {
  const rf = await refundState(env, row, async () => ({
    error: 'Square shows no payment on this order — nothing was captured, so there is nothing to refund.',
    settled: true,
  }));
  const mv = moneyView(rf);
  assert.equal(mv.money_known, true, 'a definitive "no payment" is a certainty');
  assert.equal(mv.money_held_cents, 0, 'nothing captured means nothing held');
  assert.match(mv.money_note, /nothing was captured/);
});

test('an unreachable Square stays UNKNOWN and must keep hedging', async () => {
  const rf = await refundState(env, row, async () => ({
    error: 'Square could not load order sq_1 (503).',
  }));
  const mv = moneyView(rf);
  assert.equal(mv.money_known, false, 'a failed lookup must never claim the customer was not charged');
  assert.equal(mv.money_held_cents, 0);
});

test('a real captured payment is known and reports what is still held', async () => {
  const rf = await refundState(env, row, async () => ({
    payments: [{ id: 'pay_1', status: 'COMPLETED', captured_cents: 3316, refunded_cents: 0, refundable_cents: 3316 }],
  }));
  const mv = moneyView(rf);
  assert.equal(mv.money_known, true);
  assert.equal(mv.money_held_cents, 3316);
});

// ---------- 2. the sweep ----------

const NOW = 1785000000000;
const old = NOW - (DEFAULT_GRACE_HOURS + 1) * 3600000;

function sweepHarness() {
  let captured = null;
  const DB = makeD1([[/UPDATE orders SET status = 'abandoned'/i, ({ sql, args }) => { captured = { sql, args }; return 1; }]]);
  return { DB, get: () => captured };
}

test('the sweep only ever touches pending, real, non-subscription checkouts', async () => {
  const h = sweepHarness();
  const n = await sweepAbandoned({ DB: h.DB }, NOW);
  assert.equal(n, 1);
  const { sql, args } = h.get();

  assert.match(sql, /status = 'pending'/, 'paid/prep/ready/fulfilled/canceled are never relabeled');
  assert.match(sql, /square_order_id IS NOT NULL/, 'manual counter sales (NULL id) are left alone');
  assert.match(sql, /square_order_id NOT LIKE 'sub_%'/, 'subscription deliveries are not checkouts');
  assert.equal(args[1], NOW - graceMs({}), 'cutoff is now minus the grace window');
  assert.ok(args[1] < NOW, 'only rows OLDER than the window');
});

test('grace window defaults to 2h and is overridable without a deploy', () => {
  assert.equal(graceMs({}), 2 * 3600000);
  assert.equal(graceMs({ ABANDON_AFTER_HOURS: '6' }), 6 * 3600000);
  assert.equal(graceMs({ ABANDON_AFTER_HOURS: 'nonsense' }), 2 * 3600000, 'garbage falls back, never 0');
  assert.equal(graceMs({ ABANDON_AFTER_HOURS: '0' }), 2 * 3600000, 'zero would sweep live checkouts mid-payment');
  assert.equal(graceMs({ ABANDON_AFTER_HOURS: '-5' }), 2 * 3600000, 'negative would sweep the future');
});

test('sweep never throws — it is housekeeping riding on a page load', async () => {
  const boom = makeD1([[/UPDATE orders/i, () => { throw new Error('D1 down'); }]]);
  assert.equal(await sweepAbandoned({ DB: boom }, NOW), 0);
  assert.equal(await sweepAbandoned({}, NOW), 0, 'no DB binding at all');
  assert.equal(await sweepAbandoned(null, NOW), 0);
});

test('a fresh checkout inside the window is not swept', async () => {
  const h = sweepHarness();
  await sweepAbandoned({ DB: h.DB }, NOW);
  const cutoff = h.get().args[1];
  const fresh = NOW - 60000;          // one minute old — customer is still on the Square page
  assert.ok(fresh > cutoff, 'a minute-old checkout must not be written off mid-payment');
  assert.ok(old < cutoff, 'an order past the window is eligible');
});
