// Plan pricing: the D1 price is the charged price.
//
// HISTORY, because it explains why this file is deliberately paranoid. Subscriptions used to charge
// via a Square catalog variation, which meant charging a different amount REQUIRED minting an
// ad-hoc SUBSCRIPTION_PLAN_VARIATION, gated on a comparison. That comparison read
// `weeklyCents !== tier.weeklyCents`, and once `tier` came from D1 both sides moved together — so an
// owner's price change never triggered an override, Square kept billing the OLD provisioned amount,
// and /subscribe advertised the new one. Recurring, silent, visible only on a customer's statement.
//
// That whole mechanism is GONE. create.js and manage.js now always send `price_override_money`, so
// there is no comparison left to get wrong and no catalog object minted per price. The behavioural
// tests for that live in subscription-price-override.test.js.
//
// What still matters here is the substrate those fixes rest on: PLAN_TIERS must remain an immutable
// record of what the Square variations were PROVISIONED at, D1 resolution must not corrupt it, and
// the fallback must never invent a price. catalogWeeklyCents is still read by create.js to report
// what Square would bill if an override were ever rejected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_TIERS, catalogWeeklyCents, loadPlanTiers, planPriceKey } from '../../functions/_lib/plans.js';

test('catalogWeeklyCents reports the PROVISIONED price, not a D1-resolved one', () => {
  for (const k of Object.keys(PLAN_TIERS)) {
    assert.equal(catalogWeeklyCents(k), PLAN_TIERS[k].weeklyCents);
  }
});

test('catalogWeeklyCents is undefined for an unknown tier rather than 0', () => {
  // A 0 here would be reported to the owner as "Square will bill $0.00/wk" in the mismatch alert.
  assert.equal(catalogWeeklyCents('plan_nope'), undefined);
  assert.equal(catalogWeeklyCents(''), undefined);
  assert.equal(catalogWeeklyCents(null), undefined);
});

test('loadPlanTiers never mutates PLAN_TIERS — catalogWeeklyCents must stay truthful', async () => {
  const before = PLAN_TIERS.plan_12.weeklyCents;
  const db = {
    prepare: () => ({
      all: async () => ({ results: [{ key: planPriceKey('plan_12'), cents: 23900 }] }),
    }),
  };
  const { tiers, source } = await loadPlanTiers({ DB: db });
  assert.equal(source, 'd1');
  assert.equal(tiers.plan_12.weeklyCents, 23900, 'resolved tier carries the D1 price');
  assert.equal(PLAN_TIERS.plan_12.weeklyCents, before, 'the module constant is untouched');
  assert.equal(catalogWeeklyCents('plan_12'), before);
});

test('loadPlanTiers falls back to the code price when D1 is unavailable', async () => {
  const { tiers, source } = await loadPlanTiers(null);
  assert.equal(source, 'fallback');
  assert.equal(tiers.plan_12.weeklyCents, PLAN_TIERS.plan_12.weeklyCents);
});

test('an owner price change flows through to what we will ask Square to bill', async () => {
  // The end-to-end property that replaced the old override gate: whatever D1 says is what the
  // subscription body carries. No comparison, no catalog object, no way to silently skip it.
  const db = {
    prepare: () => ({ all: async () => ({ results: [{ key: planPriceKey('plan_12'), cents: 23900 }] }) }),
  };
  const { tiers } = await loadPlanTiers({ DB: db });
  const weeklyCents = tiers.plan_12.weeklyCents;
  assert.equal(weeklyCents, 23900);
  assert.notEqual(weeklyCents, catalogWeeklyCents('plan_12'), 'differs from the provisioned catalog price…');
  // …and that difference no longer needs detecting, because the price is sent unconditionally.
  const body = { plan_variation_id: 'VAR_12', price_override_money: { amount: weeklyCents, currency: 'USD' } };
  assert.equal(body.price_override_money.amount, 23900);
});
