// Meal-plan weekly pricing — loadPlanTiers() in functions/_lib/plans.js.
//
// This is the number a subscriber is billed EVERY WEEK until they cancel, so the D1 override has
// to be paranoid: a missing row, an unreachable database, or a typo'd value must all bill the
// last known-good constant rather than something nobody chose. The exact cents are asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_TIERS, loadPlanTiers, planPriceKey } from '../../functions/_lib/plans.js';
import { makeD1 } from '../helpers/d1.js';

const MODS = /FROM menu_modifier_prices/i;
const envWith = (rows) => ({ DB: makeD1([[MODS, () => rows]]) });

test('with no D1 binding the hardcoded weekly prices are used', async () => {
  const { tiers, source } = await loadPlanTiers({});
  assert.equal(source, 'fallback');
  assert.equal(tiers.plan_5.weeklyCents, 9900);
  assert.equal(tiers.plan_10.weeklyCents, 18900);
  assert.equal(tiers.plan_12.weeklyCents, 21900);
});

test('a D1 row overrides the constant', async () => {
  const { tiers, source } = await loadPlanTiers(envWith([{ key: planPriceKey('plan_12'), cents: 23900 }]));
  assert.equal(source, 'd1');
  assert.equal(tiers.plan_12.weeklyCents, 23900);
  assert.equal(tiers.plan_5.weeklyCents, 9900, 'a tier with no row keeps its constant');
});

test('a D1 failure bills the last known-good price instead of throwing', async () => {
  const env = { DB: makeD1([[MODS, () => { throw new Error('D1_ERROR: no such table'); }]]) };
  const { tiers, source } = await loadPlanTiers(env);
  assert.equal(source, 'fallback');
  assert.equal(tiers.plan_12.weeklyCents, 21900);
});

test('a price outside the sizing floor/cap is ignored, not clamped', async () => {
  // 219 = dollars entered where cents were meant; 99900 = a stray digit.
  for (const bad of [219, 99900, 0, -21900]) {
    const { tiers, source } = await loadPlanTiers(envWith([{ key: 'plan_12_weekly', cents: bad }]));
    assert.equal(tiers.plan_12.weeklyCents, 21900, `${bad}¢ must not become the weekly charge`);
    assert.equal(source, 'fallback');
  }
});

test('a non-integer or non-numeric price is ignored', async () => {
  for (const bad of [21900.5, '21900', null, true, undefined]) {
    const { tiers } = await loadPlanTiers(envWith([{ key: 'plan_12_weekly', cents: bad }]));
    assert.equal(tiers.plan_12.weeklyCents, 21900, `${String(bad)} must not become the weekly charge`);
  }
});

test('the à-la-carte modifier rows are not mistaken for plan prices', async () => {
  const { tiers, source } = await loadPlanTiers(envWith([
    { key: 'avocado_half', cents: 200 }, { key: 'extra_protein', cents: 450 },
  ]));
  assert.equal(source, 'fallback');
  assert.equal(tiers.plan_5.weeklyCents, 9900);
});

test('loadPlanTiers never mutates PLAN_TIERS', async () => {
  await loadPlanTiers(envWith([{ key: 'plan_5_weekly', cents: 10900 }]));
  assert.equal(PLAN_TIERS.plan_5.weeklyCents, 9900, 'the fallback constant must survive an override');
});

test('every tier still carries the fields the money path reads', async () => {
  const { tiers } = await loadPlanTiers({});
  for (const [k, t] of Object.entries(tiers)) {
    assert.ok(t.bowls > 0, `${k} bowls`);
    assert.ok(t.label, `${k} label`);
    assert.ok(t.variationId, `${k} variationId`);
    assert.equal(t.bowlsPerDay * t.days.length, t.bowls, `${k} schedule`);
  }
});
