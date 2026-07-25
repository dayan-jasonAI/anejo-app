// Owner order actions (functions/api/hub/owner/order-actions.js) — the ONLY endpoint in this app
// that moves money OUT. It shipped with no tests at all.
//
// Three properties matter more than everything else here, and each one is a real way to lose money:
//   1. The refundable CEILING comes from Square's payment (total_money - refunded_money) and from
//      nowhere else. Not from the client's amount_cents, and not from orders.total_estimate_cents —
//      that column is an estimate written before Square ever saw the order, and trusting it would
//      let a $200 refund go out against a $40 capture.
//   2. The idempotency key is deterministic AND includes the already-refunded balance, so a
//      double-click replays the first refund while a deliberate second partial refund gets a new
//      key. Get that wrong in either direction and you either double-pay or can't refund twice.
//   3. money_known is not cosmetic. An unreachable Square must NOT render as "nothing captured",
//      or the owner tells a customer they weren't charged when they were.
//
// Square is NEVER called from these tests: refundState takes an injectable payment loader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANCELABLE, cancelBlockedReason, summarizePayment, validateRefundAmount,
  refundKey, moneyView, refundState, orderSideEffects,
} from '../../functions/api/hub/owner/order-actions.js';
import { makeD1 } from '../helpers/d1.js';

const SQUARE_ENV = { SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'loc' };
// A payment loader that cannot reach the network. Any test that needs Square uses one of these.
const payer = (payment) => async () => ({ payments: [payment] });
const failer = (error) => async () => ({ error });
const PAID = { id: 'pay_1', status: 'COMPLETED', captured_cents: 4000, refunded_cents: 0, refundable_cents: 4000 };
// total_estimate_cents is deliberately absurd everywhere below: nothing may ever read it.
const ORDER = { id: 'ord_abc', square_order_id: 'sq_1', status: 'paid', total_estimate_cents: 999999 };

// ---- the refundable ceiling: Square's number, nobody else's ----

test('the refundable amount is total_money minus refunded_money', () => {
  const p = summarizePayment({
    id: 'pay_1', status: 'COMPLETED',
    amount_money: { amount: 3500 }, tip_money: { amount: 500 },
    total_money: { amount: 4000 }, refunded_money: { amount: 1500 },
  });
  assert.equal(p.captured_cents, 4000, 'total_money is the capture, tip included');
  assert.equal(p.refunded_cents, 1500);
  assert.equal(p.refundable_cents, 2500);
});

test('when Square omits total_money the capture is amount + tip — the tip is refundable too', () => {
  const p = summarizePayment({ id: 'p', amount_money: { amount: 3000 }, tip_money: { amount: 600 } });
  assert.equal(p.captured_cents, 3600);
  assert.equal(p.refundable_cents, 3600);
});

test('an over-refunded or fully refunded payment floors at zero, never negative', () => {
  assert.equal(summarizePayment({ total_money: { amount: 4000 }, refunded_money: { amount: 4000 } }).refundable_cents, 0);
  assert.equal(summarizePayment({ total_money: { amount: 4000 }, refunded_money: { amount: 5000 } }).refundable_cents, 0);
});

test('a junk or empty payment object yields zeros, never NaN', () => {
  for (const junk of [{}, null, undefined, { amount_money: {}, total_money: { amount: 'x' } }]) {
    const p = summarizePayment(junk);
    assert.equal(p.captured_cents, 0);
    assert.equal(p.refundable_cents, 0);
    assert.equal(Number.isNaN(p.refundable_cents), false);
  }
});

test('THE ORDER TOTAL IS NOT A REFUND CEILING — only the payment is', () => {
  // orders.total_estimate_cents is written at checkout, before tip, adjustments or prior refunds.
  // If it ever leaked into this number, a $40 capture would accept a $9,999.99 refund.
  const p = summarizePayment({ id: 'p', total_money: { amount: 4000 }, total_estimate_cents: 999999 });
  assert.equal(p.refundable_cents, 4000);
  assert.equal(validateRefundAmount(999999, p.refundable_cents).error != null, true);
  assert.equal(validateRefundAmount(4001, p.refundable_cents).status, 409);
});

// ---- amount validation ----

test('no amount means the whole remaining balance', () => {
  for (const raw of [null, undefined, '']) {
    assert.deepEqual(validateRefundAmount(raw, 2500), { amount_cents: 2500 });
  }
});

test('a non-positive or non-finite amount is refused', () => {
  for (const raw of [0, -1, -2500, 'abc', NaN, Infinity, -Infinity, {}, [], '  ']) {
    const r = validateRefundAmount(raw, 5000);
    assert.equal(r.amount_cents, undefined, `${JSON.stringify(raw)} must not become a refund`);
    assert.equal(r.error, 'Refund amount must be a positive number of cents.');
    assert.equal(r.status, 400);
  }
});

test('an amount above what Square still owes is refused, quoting the real ceiling', () => {
  const r = validateRefundAmount(5001, 5000);
  assert.equal(r.status, 409);
  assert.match(r.error, /\$50\.00 is still refundable/);
  assert.deepEqual(validateRefundAmount(5000, 5000), { amount_cents: 5000 }, 'exactly the balance is allowed');
});

test('nothing can be refunded against a payment with a zero balance', () => {
  assert.equal(validateRefundAmount(1, 0).status, 409);
  assert.equal(validateRefundAmount(1, null).status, 409);
});

test('fractional cents are rounded, not silently truncated to a different amount', () => {
  assert.equal(validateRefundAmount(1000.4, 5000).amount_cents, 1000);
  assert.equal(validateRefundAmount(1000.6, 5000).amount_cents, 1001);
  assert.equal(validateRefundAmount('2500', 5000).amount_cents, 2500, 'a numeric string from JSON still works');
});

// ---- idempotency key ----

test('the same refund asked twice produces the SAME key — a double-click replays, never doubles', async () => {
  const a = await refundKey('ord_abc123', 0, 2500);
  const b = await refundKey('ord_abc123', 0, 2500);
  assert.equal(a, b);
  assert.ok(a.length <= 45, 'Square caps idempotency_key at 45 chars');
  assert.match(a, /^rf_/);
});

test('a DIFFERENT amount, or the same amount after the balance moved, gets a NEW key', async () => {
  const first = await refundKey('ord_abc123', 0, 2500);
  const other = await refundKey('ord_abc123', 0, 1000);
  // The second deliberate partial refund sees 2500 already refunded — it must not collide with
  // the first, or Square would return the original refund and no money would move.
  const second = await refundKey('ord_abc123', 2500, 2500);
  assert.notEqual(first, other);
  assert.notEqual(first, second);
});

test('two different orders never share a key', async () => {
  assert.notEqual(await refundKey('ord_aaa', 0, 2500), await refundKey('ord_bbb', 0, 2500));
});

test('an over-long order id is HASHED, not truncated into a collision', async () => {
  const longA = 'ord_' + 'a'.repeat(60);
  const longB = 'ord_' + 'a'.repeat(59) + 'b';   // shares a 59-char prefix with longA
  const a = await refundKey(longA, 0, 2500);
  const b = await refundKey(longB, 0, 2500);
  assert.ok(a.length <= 45 && b.length <= 45);
  assert.notEqual(a, b, 'truncation would have made these identical — and refunded the wrong order');
  assert.equal(a, await refundKey(longA, 0, 2500), 'the hash is still deterministic');
});

// ---- what the owner may do: cancel gating ----

test('anything short of delivered is cancelable; fulfilled and canceled are not', () => {
  for (const s of ['pending', 'paid', 'prep', 'ready']) assert.equal(CANCELABLE.includes(s), true, s);
  for (const s of ['fulfilled', 'canceled', 'refunded', '', undefined]) {
    assert.equal(CANCELABLE.includes(s), false, `${s} must not be cancelable`);
  }
});

test('the block reason names the status, and says "already" for a canceled order', () => {
  assert.equal(cancelBlockedReason('canceled'), 'This order is already canceled.');
  assert.match(cancelBlockedReason('fulfilled'), /not been delivered .* "fulfilled"/);
});

// ---- refund availability (Square injected, never called) ----

test('a hand-entered order has no Square payment to refund', async () => {
  const rf = await refundState(SQUARE_ENV, { id: 'o1', square_order_id: null }, payer(PAID));
  assert.equal(rf.available, false);
  assert.match(rf.reason, /entered by hand/);
});

test('a subscription delivery is refused — the charge lives on the weekly invoice', async () => {
  const rf = await refundState(SQUARE_ENV, { id: 'o1', square_order_id: 'sub_123' }, payer(PAID));
  assert.equal(rf.available, false);
  assert.match(rf.reason, /subscription/);
});

test('with Square unconfigured nothing is offered — we refuse rather than guess', async () => {
  const rf = await refundState({}, ORDER, payer(PAID));
  assert.equal(rf.available, false);
  assert.equal(rf.payment, undefined);
});

test('when Square cannot be read the refund is refused and the reason is passed through', async () => {
  const rf = await refundState(SQUARE_ENV, ORDER, failer('Square could not load order sq_1 (500).'));
  assert.equal(rf.available, false);
  assert.equal(rf.reason, 'Square could not load order sq_1 (500).');
  assert.equal(rf.payment, undefined, 'no payment means no money numbers may be shown');
});

test('an uncaptured payment offers no refund', async () => {
  const rf = await refundState(SQUARE_ENV, ORDER, payer({ ...PAID, status: 'APPROVED' }));
  assert.equal(rf.available, false);
  assert.match(rf.reason, /APPROVED/);
});

test('an already fully refunded payment offers no second refund', async () => {
  const rf = await refundState(SQUARE_ENV, ORDER, payer({ ...PAID, refunded_cents: 4000, refundable_cents: 0 }));
  assert.equal(rf.available, false);
  assert.match(rf.reason, /already fully refunded/);
});

test('a captured payment is refundable UP TO SQUARE\'S balance, ignoring the order estimate', async () => {
  const rf = await refundState(SQUARE_ENV, ORDER, payer({ ...PAID, refunded_cents: 1000, refundable_cents: 3000 }));
  assert.equal(rf.available, true);
  assert.equal(rf.payment.refundable_cents, 3000);
  assert.notEqual(rf.payment.refundable_cents, ORDER.total_estimate_cents);
});

// ---- money_known ----

test('MONEY UNKNOWN IS NOT MONEY ZERO — an unreachable Square says so', () => {
  const mv = moneyView({ available: false, reason: 'Square could not load the payment for this order (503).' });
  assert.equal(mv.money_known, false, 'the UI must not claim the customer was never charged');
  assert.equal(mv.money_held_cents, 0);
  assert.match(mv.money_note, /could not load/);
});

test('a known payment reports the held balance and no note', () => {
  const mv = moneyView({ available: true, payment: { ...PAID, refunded_cents: 1000, refundable_cents: 3000 } });
  assert.deepEqual(mv, { money_known: true, money_held_cents: 3000, money_note: null });
});

test('a fully refunded payment is KNOWN to hold nothing — different from unknown', () => {
  const mv = moneyView({ available: false, reason: 'This payment is already fully refunded.', payment: { ...PAID, refundable_cents: 0 } });
  assert.equal(mv.money_known, true);
  assert.equal(mv.money_held_cents, 0);
});

// ---- side effects a refund does NOT reverse ----

function sideEnv({ stop = null, points = null, revshare = null } = {}) {
  return {
    DB: makeD1([
      [/FROM route_stops rs JOIN routes r/, () => stop],
      [/FROM points_ledger WHERE order_id = \? AND reason = 'earn'/, () => points],
      [/FROM rev_share_events WHERE order_id = \?/, () => revshare],
    ]),
  };
}
const has = (warnings, re) => warnings.some((w) => re.test(w));

test('a REFUND reports the points it did not reverse, and where to fix them', async () => {
  const env = sideEnv({ points: { delta: 60 } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 4000, captured_cents: 4000 });
  assert.equal(has(w, /60 rewards points/), true);
  assert.equal(has(w, /NOT reversed/), true);
  assert.equal(has(w, /HUB → Rewards/), true, 'a warning without a destination is not actionable');
});

test('a REFUND reports affiliate commission that is still on the partner ledger', async () => {
  const env = sideEnv({ revshare: { trainer_id: 'trn_jen', share_cents: 400, payout_status: 'pending' } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 4000, captured_cents: 4000 });
  assert.equal(has(w, /\$4\.00 affiliate commission/), true);
  assert.equal(has(w, /trn_jen/), true);
  assert.equal(has(w, /HUB → Partners/), true);
});

test('commission ALREADY PAID OUT is called out separately — that money is gone', async () => {
  const env = sideEnv({ revshare: { trainer_id: 'trn_jen', share_cents: 400, payout_status: 'paid' } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 4000, captured_cents: 4000 });
  assert.equal(has(w, /ALREADY been marked paid out/), true);
});

test('a PARTIAL refund states the pro-rata share, so the owner is not guessing', async () => {
  const env = sideEnv({ points: { delta: 60 }, revshare: { trainer_id: 'trn_jen', share_cents: 400, payout_status: 'pending' } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 1000, captured_cents: 4000 });
  assert.equal(w.every((x) => /25% of the \$40\.00 captured/.test(x)), true, 'every ledger warning carries the fraction');
});

test('a FULL refund carries no pro-rata sentence — there is nothing to apportion', async () => {
  const env = sideEnv({ points: { delta: 60 } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 4000, captured_cents: 4000 });
  assert.equal(has(w, /pro-rata/), false);
});

test('a refund warns that the order is STILL ROUTED — refunding does not stop the driver', async () => {
  const env = sideEnv({ stop: { route_id: 'rt_9' } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 4000, captured_cents: 4000 });
  assert.equal(has(w, /rt_9/), true);
  assert.equal(has(w, /NOT canceled/), true);
});

test('CANCEL keeps its original wording and still reports both ledgers', async () => {
  const env = sideEnv({ stop: { route_id: 'rt_9' }, points: { delta: 60 }, revshare: { trainer_id: 'trn_jen', share_cents: 400, payout_status: 'pending' } });
  const w = await orderSideEffects(env, { id: 'ord_abc' }, { action: 'cancel' });
  assert.equal(has(w, /Pull it from Deliveries/), true);
  assert.equal(has(w, /not reversed automatically/), true);
  assert.equal(has(w, /affiliate commission/), true);
  assert.equal(has(w, /pro-rata|%/), false, 'a cancel moves no money, so nothing is apportioned');
});

test('an order with no points, no commission and no route produces NO noise', async () => {
  const w = await orderSideEffects(sideEnv(), { id: 'ord_abc' }, { action: 'refund', amount_cents: 4000, captured_cents: 4000 });
  assert.deepEqual(w, [], 'an empty array is the owner\'s "nothing left to do" signal');
});

test('a zero-value commission row is not reported as money owed', async () => {
  const env = sideEnv({ revshare: { trainer_id: 'trn_jen', share_cents: 0, payout_status: 'pending' } });
  assert.deepEqual(await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund' }), []);
});

test('missing rewards/routing/affiliate tables degrade to no warnings, never an exception', async () => {
  // makeD1 throws on an unrouted query — the same shape as an early environment without the table.
  const env = { DB: makeD1([]) };
  assert.deepEqual(await orderSideEffects(env, { id: 'ord_abc' }, { action: 'refund', amount_cents: 100, captured_cents: 4000 }), []);
  assert.deepEqual(await orderSideEffects(env, { id: 'ord_abc' }, { action: 'cancel' }), []);
});
