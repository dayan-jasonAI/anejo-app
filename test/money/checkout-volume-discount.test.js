// The volume discount has to survive the trip to the card reader.
//
// /catering shows a customer a discounted total and sends them to /order to pay. Checkout re-prices
// the cart from the live menu — correctly, and deliberately — but until 2026-09-09 it applied only
// Añejo Rewards points and promo codes. A cart quoted at $543.70 was charged $546.00. A published
// discount the checkout does not honour is worse than no discount: it is a number the customer can
// screenshot.
//
// SCOPE OF THIS FILE, STATED PLAINLY. The discount arithmetic is exhaustively covered in
// catering-pricing.test.js against the shared function. What is checked HERE is the WIRING inside
// functions/api/checkout.js — that it uses that shared function, that it is scoped to catering
// SKUs, that it reaches Square's own discount list, and that it cannot over-discount an order.
// These are structural assertions over the source, not an end-to-end run of the checkout endpoint:
// standing that path up needs Square, D1, KV, promo tables and a full valid address body, and a
// half-stubbed version of it would pass while proving nothing. The gap is real and named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyVolumeDiscount } from '../../functions/_lib/catering-pricing.js';

const SRC = readFileSync(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');

test('checkout uses the shared discount function, never its own copy of the tiers', () => {
  assert.match(SRC, /import \{ applyVolumeDiscount \} from '\.\.\/_lib\/catering-pricing\.js'/);
  assert.match(SRC, /applyVolumeDiscount\(cateringSubtotalCents\)/);
  // A second set of thresholds living in checkout is the failure mode this guards: two places
  // that both "know" the tiers will disagree the first time one of them changes.
  for (const literal of [/\b50000\b.*0\.05/, /\b100000\b.*0\.10/, /\b200000\b.*0\.20/]) {
    assert.ok(!literal.test(SRC), 'checkout must not carry its own discount ladder');
  }
});

test('the discount is scoped to catering SKUs so a bowl order is never touched', () => {
  assert.match(SRC, /let cateringSubtotalCents = 0;/);
  // Accumulated only under the established catering-SKU predicate, on the non-bowl branch.
  assert.match(SRC, /if \(\/\^\(catering_\|traditional_\)\/\.test\(it\.id\)\) cateringSubtotalCents \+= cents \* qty;/);
  // The bowl branch adds to subtotalCents alone.
  const bowlBranch = SRC.slice(SRC.indexOf('subtotalCents += pr.unitCents * qty;'), SRC.indexOf('const lineName = pr.label'));
  assert.ok(!bowlBranch.includes('cateringSubtotalCents'), 'a customized bowl must never earn a catering discount');
});

test('it combines with points and promo codes without ever exceeding the subtotal', () => {
  assert.match(SRC, /Math\.min\(subtotalCents, discountCents \+ promoDiscountCents \+ volumeDiscountCents\)/);
  // And the no-promo path must include it too — the bug would be applying it only when a promo
  // code happens to be present, which is the branch almost nobody exercises by hand.
  assert.match(SRC, /promo \? totalDiscountCents : Math\.min\(subtotalCents, discountCents \+ volumeDiscountCents\)/);
});

test('the customer sees it itemised on the Square order, not folded into a mystery number', () => {
  assert.match(SRC, /uid: 'anejo-catering-volume'/);
  assert.match(SRC, /name: 'Catering volume discount'/);
  assert.match(SRC, /amount: volumeDiscountCents/);
});

test('the amount checkout will take off is the amount the quote builder showed', () => {
  // Both sides call the same function, so this pins the contract rather than a duplicated sum:
  // the cart quoted at $546 of catering food is discounted by $2.30 in both places.
  assert.equal(applyVolumeDiscount(54600).discount_cents, 230);
  assert.equal(applyVolumeDiscount(54600).total_cents, 54370);
  // And a cart with no catering food earns nothing, which is what scoping to zero must produce.
  assert.equal(applyVolumeDiscount(0).discount_cents, 0);
});
