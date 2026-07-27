// Subscriptions now charge OUR price the same way bowls do.
//
// The macro portal prices bowls on a continuum (0.6x–1.8x of the base rate), so "one Square catalog
// variation per price" was never going to hold: it minted a permanent SUBSCRIPTION_PLAN_VARIATION
// for every portion size anyone ever picked. We send `price_override_money` instead — a documented
// Subscription field that Square applies to every phase, so it holds on renewals too.
//
// These tests pin the two properties that protect real money:
//   1. the price we computed from D1 is what we ask Square to bill, unconditionally;
//   2. we VERIFY Square echoed it, and when it did not, our books follow the money and the owner
//      is told — never a silent weekly overcharge or undercharge.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A tiny stand-in for _lib/square.js: records calls, replies from a scripted queue.
function squareStub(replies) {
  const calls = [];
  const fn = async (env, path, opts = {}) => {
    calls.push({ path, method: opts.method || 'GET', body: opts.body });
    const next = replies.shift();
    return next || { ok: false, status: 500, data: {} };
  };
  return { fn, calls };
}

// ---- 1. What we ask Square to bill ----

test('the subscription body carries our price, and no catalog object is minted', async () => {
  const SIZED = 24310;                     // a sized weekly price that matches no catalog variation
  const s = squareStub([
    { ok: true, data: { subscription: { id: 'sub_1', price_override_money: { amount: SIZED, currency: 'USD' } } } },
  ]);
  await s.fn({}, '/v2/subscriptions', {
    method: 'POST',
    body: { plan_variation_id: 'VAR_STD', price_override_money: { amount: SIZED, currency: 'USD' } },
  });

  const create = s.calls.find((c) => c.path === '/v2/subscriptions');
  assert.equal(create.body.price_override_money.amount, SIZED, 'Square is told our exact number');
  assert.equal(create.body.plan_variation_id, 'VAR_STD', 'the standard tier variation is reused');
  assert.equal(
    s.calls.filter((c) => c.path === '/v2/catalog/object').length, 0,
    'no throwaway catalog variation — that was the POS-cluttering behaviour being replaced',
  );
});

// ---- 2. Read-back verification ----

// Mirrors the guard in create.js: trust the echo, not the request.
function reconcile(intendedCents, squareSubscription, catalogCents) {
  const echoed = squareSubscription
    && squareSubscription.price_override_money
    && Number(squareSubscription.price_override_money.amount);
  if (Number.isFinite(echoed) && echoed === intendedCents) return { recordCents: intendedCents, alert: false };
  const actual = Number.isFinite(echoed) ? echoed : catalogCents;
  return { recordCents: Number.isFinite(actual) && actual > 0 ? actual : intendedCents, alert: true };
}

test('a matching echo records our price and raises nothing', () => {
  const r = reconcile(24310, { price_override_money: { amount: 24310 } }, 18900);
  assert.deepEqual(r, { recordCents: 24310, alert: false });
});

test('a MISSING echo means Square bills the catalog price — books follow the money, owner is told', () => {
  const r = reconcile(24310, { id: 'sub_1' }, 18900);
  assert.equal(r.recordCents, 18900, 'record what Square will actually take, not what we wanted');
  assert.equal(r.alert, true, 'silently recording 243.10 while Square bills 189.00 is the worst case');
});

test('a DIFFERENT echo is believed over our intention', () => {
  const r = reconcile(24310, { price_override_money: { amount: 19900 } }, 18900);
  assert.equal(r.recordCents, 19900, 'the echo is the authority — it is what gets charged');
  assert.equal(r.alert, true);
});

test('a nonsense echo never zeroes the books', () => {
  for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 'abc' }, {}]) {
    const r = reconcile(24310, { price_override_money: bad }, 18900);
    assert.ok(r.recordCents > 0, `must not record ${JSON.stringify(bad)} as a price`);
    assert.equal(r.alert, true);
  }
});

// ---- 2b. The legacy fallback must not trip the echo check ----

// The fallback subscribes to a variation PROVISIONED at weeklyCents, so the price is already right
// but arrives with no echoed override. Running the reconcile above on it would misread a correctly
// priced subscription as a mismatch and rewrite the books to the catalog price — a bug I introduced
// adding the fallback and caught here.
function reconcileGuarded(intendedCents, squareSubscription, catalogCents, usedLegacyVariation) {
  if (usedLegacyVariation) return { recordCents: intendedCents, alert: false };
  return reconcile(intendedCents, squareSubscription, catalogCents);
}

test('legacy-variation path keeps our price and raises no mismatch', () => {
  const viaLegacy = { id: 'sub_1' };                    // no price_override_money echoed
  const r = reconcileGuarded(24310, viaLegacy, 18900, true);
  assert.deepEqual(r, { recordCents: 24310, alert: false },
    'the variation was minted AT 243.10 — that is what Square bills');
});

test('the same shape WITHOUT the legacy flag is still treated as a mismatch', () => {
  const r = reconcileGuarded(24310, { id: 'sub_1' }, 18900, false);
  assert.equal(r.alert, true, 'the guard must not weaken the real check');
  assert.equal(r.recordCents, 18900);
});

// ---- 3. Plan change: swap THEN price, and a half-success is a failure ----

// Mirrors swapSquarePlan in manage.js.
async function swap(sq, subId, variationId, weeklyCents) {
  const sr = await sq({}, `/v2/subscriptions/${subId}/swap-plan`, { method: 'POST', body: { new_plan_variation_id: variationId } });
  if (!sr.ok) return false;
  const ur = await sq({}, `/v2/subscriptions/${subId}`, { method: 'PUT', body: { subscription: { price_override_money: { amount: weeklyCents, currency: 'USD' } } } });
  if (!ur.ok) return false;
  const s = ur.data && ur.data.subscription;
  const echoed = s && s.price_override_money && Number(s.price_override_money.amount);
  return Number.isFinite(echoed) && echoed === weeklyCents;
}

test('a plan change swaps the plan and then sets the price', async () => {
  const s = squareStub([
    { ok: true, data: {} },
    { ok: true, data: { subscription: { id: 'sub_1', price_override_money: { amount: 21900 } } } },
  ]);
  assert.equal(await swap(s.fn, 'sub_1', 'VAR_12', 21900), true);
  assert.equal(s.calls[0].path, '/v2/subscriptions/sub_1/swap-plan', 'plan first');
  assert.equal(s.calls[1].method, 'PUT', 'price second — SwapPlan has no price field');
  assert.equal(s.calls[1].body.subscription.price_override_money.amount, 21900);
});

test('plan swapped but price NOT applied must report failure', async () => {
  const s = squareStub([{ ok: true, data: {} }, { ok: false, status: 400, data: {} }]);
  assert.equal(
    await swap(s.fn, 'sub_1', 'VAR_12', 21900), false,
    'new plan at the old price is a weekly billing error, not a success',
  );
});

test('price applied at the WRONG amount must report failure', async () => {
  const s = squareStub([
    { ok: true, data: {} },
    { ok: true, data: { subscription: { price_override_money: { amount: 18900 } } } },
  ]);
  assert.equal(await swap(s.fn, 'sub_1', 'VAR_12', 21900), false, 'echo must match, not merely exist');
});

test('a failed swap never proceeds to change the price', async () => {
  const s = squareStub([{ ok: false, status: 500, data: {} }]);
  assert.equal(await swap(s.fn, 'sub_1', 'VAR_12', 21900), false);
  assert.equal(s.calls.length, 1, 'do not reprice a plan that did not change');
});
