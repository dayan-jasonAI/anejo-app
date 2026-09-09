import test from 'node:test';
import assert from 'node:assert/strict';
import { priceApprovedCajitaBundle } from '../src/cajita/approved-bundle-pricing.js';

const box = () => ({ quantity: 25, printing: 'signature', items: [
  { id: 'sandwich', quantity: 1, flavor: 'ham-spread' },
  { id: 'empanada', quantity: 1, flavor: 'guava-cheese' },
  { id: 'croqueta', quantity: 1, flavor: 'ham' },
  ...['salad', 'skewer', 'tres-leches'].map(id => ({ id, quantity: 1 })),
] });
test('approved complete bundles cost $18/$20 with 48/72 hour minimums', () => {
  for (const [printing, total, hours] of [['signature', 45000, 48], ['preset', 50000, 72]]) {
    const result = priceApprovedCajitaBundle({ ...box(), printing, unitCents: 1 });
    assert.equal(result.subtotalCents, total);
    assert.equal(result.minimumNoticeHours, hours);
    assert.equal(result.checkoutEligible, false);
    assert.deepEqual(result.reviewReasons, []);
  }
});
test('removals, duplicates, substitutions and bespoke packaging are not silently priced', () => {
  for (const change of [
    b => b.items.pop(),
    b => { b.items[0] = b.items[1]; },
    b => { b.items[0].flavor = 'tuna-spread'; },
    b => { b.items[0].quantity = 2; },
    b => { b.printing = 'custom'; },
    b => { b.packagingRequest = 'larger'; },
    b => { b.printing = '__proto__'; },
  ]) {
    const b = box(); change(b);
    assert.equal(priceApprovedCajitaBundle(b).subtotalCents, null);
  }
});
test('invalid customer quantities rejected', () => {
  for (const quantity of [0, -1, 1.5, '25', 5001, Infinity]) {
    assert.throws(() => priceApprovedCajitaBundle({ ...box(), quantity }));
  }
});
