// The delivery-fee tax rule — orders.total_estimate_cents (functions/api/checkout.js).
//
// The rule: Florida does not tax the delivery fee, so the fee is sent to Square as
// `taxable: false` — and the number we store MUST mirror what Square actually charges:
//
//     total = round(discountedSubtotal × (1 + tax)) + fee
//
// Taxing the fee too overstates every order by fee × tax. That is not a display bug: this
// column feeds lifetime spend (and therefore rewards tiers), the P&L, and the COGS snapshots.
//
// The formula is REPLICATED here rather than imported — it is an inline expression inside the
// 440-line onRequestPost handler, and extracting it would mean restructuring checkout.js. The
// last test in this file is the guard against that replication silently drifting: it reads
// checkout.js and asserts the real expression still has `+ feeCents` OUTSIDE the tax multiply.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Verbatim replica of the expression in checkout.js's INSERT INTO orders.
const totalEstimateCents = (subtotalCents, discountCents, taxPct, feeCents) =>
  Math.round(Math.max(0, subtotalCents - discountCents) * (1 + Number(taxPct) / 100)) + feeCents;

test('THE DELIVERY FEE IS NOT TAXED', () => {
  // $100 of food, 7% FL + Palm Beach County, $5 delivery.
  assert.equal(totalEstimateCents(10000, 0, 7, 500), 11200);
  // Taxing the fee would give 11235 — $0.35 of tax the customer was never charged.
  assert.notEqual(totalEstimateCents(10000, 0, 7, 500), Math.round((10000 + 500) * 1.07));
});

test('tax applies to the DISCOUNTED subtotal, not the list price', () => {
  // $100 food − $15 promo = $85 taxable, + $5 untaxed fee.
  assert.equal(totalEstimateCents(10000, 1500, 7, 500), Math.round(8500 * 1.07) + 500);
  assert.equal(totalEstimateCents(10000, 1500, 7, 500), 9595);
});

test('the identity holds across a spread of real carts', () => {
  const carts = [
    [2500, 0, 7, 500], [4999, 250, 7, 500], [12345, 1234, 7, 0],
    [8000, 0, 6, 599], [3300, 3300, 7, 500], [19999, 500, 7.5, 750],
  ];
  for (const [sub, disc, tax, fee] of carts) {
    const taxable = Math.max(0, sub - disc);
    assert.equal(
      totalEstimateCents(sub, disc, tax, fee),
      Math.round(taxable * (1 + tax / 100)) + fee,
      `cart ${JSON.stringify([sub, disc, tax, fee])}`
    );
  }
});

test('the fee passes through the total unchanged, whatever the tax rate', () => {
  // The clean statement of the rule: raising the fee by $1 raises the total by exactly $1.
  for (const taxPct of [0, 6, 7, 7.5, 9]) {
    const withFee = totalEstimateCents(10000, 0, taxPct, 500);
    const noFee = totalEstimateCents(10000, 0, taxPct, 0);
    assert.equal(withFee - noFee, 500, `at ${taxPct}% the fee must pass through untaxed`);
  }
});

test('a free-delivery tier perk simply removes the fee, and nothing else moves', () => {
  assert.equal(totalEstimateCents(10000, 0, 7, 0), 10700);
});

test('a discount larger than the cart floors the food at zero, and the fee still stands', () => {
  // Points + promo can combine past the subtotal; the total must never go negative, and the
  // customer still owes the delivery fee.
  assert.equal(totalEstimateCents(5000, 9999, 7, 500), 500);
});

test('the stored total is a whole number of cents', () => {
  for (const sub of [3333, 4999, 12345, 7777, 10101]) {
    const t = totalEstimateCents(sub, 0, 7, 500);
    assert.equal(t, Math.trunc(t), `${sub} produced a fractional total`);
  }
});

// ---- drift guards against the real source ----

test('checkout.js still adds the fee OUTSIDE the tax multiplication', async () => {
  const src = await readFile(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');
  assert.match(
    src,
    /Math\.round\(\s*Math\.max\(0,\s*subtotalCents\s*-\s*finalDiscountCents\)\s*\*\s*\(1\s*\+\s*Number\(taxPct\)\s*\/\s*100\)\s*\)\s*\+\s*feeCents/,
    'total_estimate_cents must stay round(discountedSubtotal × (1+tax)) + fee — see the header note'
  );
});

test('the delivery fee is still sent to Square as taxable:false', async () => {
  const src = await readFile(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');
  assert.match(src, /uid:\s*'delivery-fee'/, 'the delivery fee service charge must exist');
  assert.match(
    src,
    /calculation_phase:\s*'SUBTOTAL_PHASE',\s*taxable:\s*false/,
    'if Square starts taxing the fee, the stored total stops matching the card charge'
  );
});
