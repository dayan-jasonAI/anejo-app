import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCajitaDraft, proposedCajitaPolicy } from '../src/cajita/pricing.js';

const standard = () => ({ id: 'standard', quantity: 1, printing: 'signature', items: [
  { id: 'sandwich', flavor: 'ham-spread', quantity: 1 },
  { id: 'empanada', flavor: 'guava-cheese', quantity: 1 },
  { id: 'croqueta', flavor: 'ham', quantity: 1 },
  { id: 'salad', quantity: 1 }, { id: 'skewer', quantity: 1 },
  { id: 'tres-leches', quantity: 1 },
] });
test('draft complete standard is $17.50, never checkout eligible', () => {
  const result = calculateCajitaDraft([standard()]);
  assert.equal(result.subtotalCents, 1750);
  assert.equal(result.checkoutEligible, false);
  assert.ok(result.reviewReasons.includes('unapproved-price-policy'));
});
test('preset printing is charged per box', () => {
  assert.equal(calculateCajitaDraft([{ ...standard(), quantity: 25, printing: 'preset' }]).subtotalCents, 48750);
});
test('mixed versions preserve counts and removed dessert credit', () => {
  const noDessert = { ...standard(), id: 'no-dessert', quantity: 10 };
  noDessert.items.pop();
  const result = calculateCajitaDraft([{ ...standard(), quantity: 20 }, noDessert]);
  assert.equal(result.subtotalCents, 50500);
  assert.equal(result.lines[1].unitCents, 1550);
});
test('duplicate food adds cost; customer price fields are ignored', () => {
  const box = standard();
  box.items.push({ id: 'croqueta', flavor: 'ham', quantity: 2, cents: 0 });
  box.unitCents = 1;
  assert.equal(calculateCajitaDraft([box]).subtotalCents, 2100);
});
test('unknown item, flavor or print never produces a complete total', () => {
  for (const change of [
    (box) => box.items.push({ id: 'grazing', quantity: 1 }),
    (box) => { box.items[0].flavor = 'tuna-spread'; },
    (box) => { box.printing = 'bespoke'; },
  ]) {
    const box = standard(); change(box);
    assert.equal(calculateCajitaDraft([box]).subtotalCents, null);
  }
});
test('larger box requests remain review-only', () => {
  assert.ok(calculateCajitaDraft([{ ...standard(), packagingRequest: 'larger box' }]).reviewReasons.includes('packaging-review'));
});
test('approved schedule alone cannot authorize checkout', () => {
  assert.equal(calculateCajitaDraft([standard()], { ...proposedCajitaPolicy, status: 'approved' }).checkoutEligible, false);
});
test('reject invalid quantities, empty boxes and duplicate version IDs', () => {
  for (const value of [0, -1, 1.5, '2', Infinity, 5001]) {
    assert.throws(() => calculateCajitaDraft([{ ...standard(), quantity: value }]));
  }
  assert.throws(() => calculateCajitaDraft([{ ...standard(), items: [] }]));
  assert.throws(() => calculateCajitaDraft([standard(), standard()]));
  const box = standard(); box.items[0].quantity = -1;
  assert.throws(() => calculateCajitaDraft([box]));
});
