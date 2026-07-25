// The subscription price-override decision — regression tests for a display-vs-charge landmine.
//
// Square subscription plan variations are STATIC and CreateSubscription has no price-override
// field, so charging an amount that differs from the provisioned variation REQUIRES minting an
// ad-hoc variation. subscriptions/create.js and manage.js gate that on a single comparison.
//
// The trap: that comparison used to read `weeklyCents !== tier.weeklyCents`. Once `tier` was
// resolved from D1, both sides moved together — so for a plain (unsized, no-avocado) plan they were
// always EQUAL, the override never fired, and Square kept billing the OLD provisioned amount while
// /subscribe advertised the owner's new price. Recurring, silent, and only visible on a statement.
//
// The fix compares against catalogWeeklyCents(tier) — what the variation was actually provisioned
// at — so an owner price change behaves exactly like a sized bowl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_TIERS, catalogWeeklyCents, loadPlanTiers, planPriceKey } from '../../functions/_lib/plans.js';

// The decision exactly as create.js/manage.js make it.
const needsAdHocVariation = (weeklyCents, tierKey) => weeklyCents !== catalogWeeklyCents(tierKey);

test('catalogWeeklyCents reports the PROVISIONED price, not a D1-resolved one', () => {
  for (const k of Object.keys(PLAN_TIERS)) {
    assert.equal(catalogWeeklyCents(k), PLAN_TIERS[k].weeklyCents);
  }
});

test('an owner price change in D1 forces an ad-hoc variation (the landmine)', () => {
  // Owner raises plan_12 from the provisioned $219 to $239.
  const weeklyCents = 23900;
  assert.equal(catalogWeeklyCents('plan_12'), 21900, 'catalog price must stay the code constant');
  assert.equal(needsAdHocVariation(weeklyCents, 'plan_12'), true,
    'without this, Square keeps charging $219 while /subscribe shows $239');
});

test('the OLD comparison would have missed it — this is what regressed', () => {
  // Reproduce the old logic against a D1-resolved tier: both sides move together.
  const d1ResolvedTier = { ...PLAN_TIERS.plan_12, weeklyCents: 23900 };
  const weeklyCents = d1ResolvedTier.weeklyCents;
  assert.equal(weeklyCents !== d1ResolvedTier.weeklyCents, false,
    'the old guard silently declines to override on exactly the change that needs it');
  // The new guard catches the same case.
  assert.equal(needsAdHocVariation(weeklyCents, 'plan_12'), true);
});

test('an unchanged price still rides the standard variation (no needless catalog objects)', () => {
  assert.equal(needsAdHocVariation(PLAN_TIERS.plan_12.weeklyCents, 'plan_12'), false);
  assert.equal(needsAdHocVariation(PLAN_TIERS.plan_5.weeklyCents, 'plan_5'), false);
});

test('sized bowls and the avocado add-on still force a variation', () => {
  assert.equal(needsAdHocVariation(PLAN_TIERS.plan_12.weeklyCents + 2400, 'plan_12'), true);
  assert.equal(needsAdHocVariation(PLAN_TIERS.plan_5.weeklyCents - 500, 'plan_5'), true);
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
