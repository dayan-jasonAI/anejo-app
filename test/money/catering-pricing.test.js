// The catering volume discount.
//
// The rule was first described as "5% on anything above $500, 10% off the total at $1,000, 20%
// off the entire order at $2,000". Mixing a marginal tier with two whole-order tiers is not
// monotonic: $1,999 would net $1,799.10 and $2,000 would net $1,600.00, so a customer who added
// one more dollar of food would pay $199 LESS. Dayan chose marginal slices instead (2026-09-09).
//
// The monotonicity test below is the one that matters. The worked examples are here so a human
// can check the arithmetic by hand; the property test is what stops a future rate change from
// quietly reintroducing a cliff at some amount nobody thought to spot-check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVolumeDiscount, nextDiscountTier, describeDiscount, DISCOUNT_TIERS } from '../../functions/_lib/catering-pricing.js';

const at = (dollars) => applyVolumeDiscount(Math.round(dollars * 100));
const dollars = (cents) => cents / 100;

// ---------------------------------------------------------------- the worked examples

test('below $500 there is no discount at all', () => {
  assert.equal(at(0).discount_cents, 0);
  assert.equal(at(1).discount_cents, 0);
  assert.equal(at(499.99).discount_cents, 0);
  assert.equal(at(500).discount_cents, 0, '$500 is the START of the 5% slice, not a jump');
  assert.equal(at(500).total_cents, 50000);
});

test('the 5% slice applies only to the part above $500', () => {
  assert.equal(dollars(at(600).discount_cents), 5, '$100 of the order sits in the 5% slice');
  assert.equal(dollars(at(600).total_cents), 595);
  assert.equal(dollars(at(1000).discount_cents), 25, 'the whole $500 slice, at 5%');
  assert.equal(dollars(at(1000).total_cents), 975);
});

test('the 10% slice stacks on top of the 5% one rather than replacing it', () => {
  // $25 from the 5% slice, plus $500 of the 10% slice.
  assert.equal(dollars(at(1500).discount_cents), 75);
  assert.equal(dollars(at(1500).total_cents), 1425);
  // The full 5% and 10% slices: $25 + $100.
  assert.equal(dollars(at(2000).discount_cents), 125);
  assert.equal(dollars(at(2000).total_cents), 1875);
});

test('above $2,000 only the excess earns 20%', () => {
  // $25 + $100 + 20% of the $500 above the threshold.
  assert.equal(dollars(at(2500).discount_cents), 225);
  assert.equal(dollars(at(2500).total_cents), 2275);
  // $25 + $100 + 20% of $3,000.
  assert.equal(dollars(at(5000).discount_cents), 725);
  assert.equal(dollars(at(5000).total_cents), 4275);
});

test("Dayan's own $1,200 birthday order", () => {
  const r = at(1200);
  assert.equal(dollars(r.discount_cents), 45, '$25 of 5% slice + $20 of the 10% slice');
  assert.equal(dollars(r.total_cents), 1155);
});

// ---------------------------------------------------------------- the property that matters

test('spending more never costs less — swept across every threshold, dollar by dollar', () => {
  let previous = -1;
  for (let cents = 0; cents <= 400000; cents += 100) {
    const total = applyVolumeDiscount(cents).total_cents;
    assert.ok(total > previous || cents === 0, `total went backwards at ${dollars(cents)}`);
    previous = total;
  }
});

test('the discount never exceeds the order and never goes negative', () => {
  for (const cents of [0, 1, 49999, 50000, 99999, 100000, 199999, 200000, 10000000]) {
    const r = applyVolumeDiscount(cents);
    assert.ok(r.discount_cents >= 0 && r.discount_cents <= cents, `bad discount at ${cents}`);
    assert.equal(r.total_cents, cents - r.discount_cents);
    assert.ok(r.total_cents >= 0);
  }
});

test('the printed tier lines always add up to the printed discount', () => {
  for (const cents of [60000, 123456, 200001, 777777, 5000000]) {
    const r = applyVolumeDiscount(cents);
    const summed = r.tiers.reduce((n, t) => n + t.discount_cents, 0);
    assert.equal(summed, r.discount_cents, `tier lines disagree with the total at ${cents}`);
    const covered = r.tiers.reduce((n, t) => n + t.amount_cents, 0);
    assert.ok(covered <= cents, 'a tier cannot cover more money than the order contains');
  }
});

test('a fractional cent is rounded, never dropped or invented', () => {
  // $500.01 → one cent in the 5% slice → rounds to zero, and the customer is not charged
  // a negative or fractional amount.
  const r = applyVolumeDiscount(50001);
  assert.equal(r.discount_cents, 0);
  assert.equal(r.total_cents, 50001);
  // $500.10 → 10c at 5% = 0.5c → half-up to 1c.
  assert.equal(applyVolumeDiscount(50010).discount_cents, 1);
});

// ---------------------------------------------------------------- garbage in

test('nonsense input prices as zero rather than throwing on a money path', () => {
  for (const bad of [null, undefined, NaN, -1, -50000, 1.5, '1000', {}, Infinity]) {
    const r = applyVolumeDiscount(bad);
    assert.equal(r.subtotal_cents, 0);
    assert.equal(r.discount_cents, 0);
    assert.equal(r.total_cents, 0);
    assert.deepEqual(r.tiers, []);
  }
});

// ---------------------------------------------------------------- the next-tier hint

test('the hint names the distance to the next threshold and the rate the next dollar earns', () => {
  assert.deepEqual(nextDiscountTier(30000), { at_cents: 50000, extra_cents: 20000, rate_after: 0.05 });
  assert.deepEqual(nextDiscountTier(70000), { at_cents: 100000, extra_cents: 30000, rate_after: 0.10 });
  assert.deepEqual(nextDiscountTier(150000), { at_cents: 200000, extra_cents: 50000, rate_after: 0.20 });
});

test('there is no hint at the top tier, or with nothing in the cart', () => {
  assert.equal(nextDiscountTier(200000), null, 'already earning the top rate');
  assert.equal(nextDiscountTier(999999), null);
  assert.equal(nextDiscountTier(0), null, 'an empty cart is not shown a savings pitch');
  assert.equal(nextDiscountTier(-5), null);
});

// ---------------------------------------------------------------- the words beside the maths

test('the customer sentence is bilingual and quotes the real effective rate', () => {
  const r = at(2500);
  assert.match(describeDiscount(r, 'en'), /\$225\.00/);
  assert.match(describeDiscount(r, 'en'), /9% of subtotal/);
  assert.match(describeDiscount(r, 'es'), /Descuento por volumen/);
  assert.match(describeDiscount(r, 'es'), /9% del subtotal/);
});

test('no discount means no sentence — never "you saved $0.00"', () => {
  assert.equal(describeDiscount(at(400), 'en'), null);
  assert.equal(describeDiscount(at(0), 'es'), null);
  assert.equal(describeDiscount(null), null);
});

test('the published tiers are contiguous, ascending and start at zero', () => {
  assert.equal(DISCOUNT_TIERS[0].from_cents, 0);
  for (let i = 1; i < DISCOUNT_TIERS.length; i++) {
    assert.equal(DISCOUNT_TIERS[i].from_cents, DISCOUNT_TIERS[i - 1].to_cents, 'a gap or overlap between tiers loses money silently');
    assert.ok(DISCOUNT_TIERS[i].rate > DISCOUNT_TIERS[i - 1].rate, 'rates must climb');
  }
  assert.ok(DISCOUNT_TIERS.at(-1).rate < 1, 'a rate at or above 100% would invert the total');
});
