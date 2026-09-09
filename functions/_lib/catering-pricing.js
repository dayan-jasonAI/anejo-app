// Volume discount for catering food. ONE implementation, shared by the public instant quote
// (api/catering-estimate.js) and the Hub's quote builder — a discount that two surfaces compute
// separately is a discount that eventually disagrees with itself in front of a paying customer.
// Files under functions/_lib are NOT routed.
//
// MARGINAL SLICES, NOT WHOLE-ORDER STEPS (Dayan, 2026-09-09).
//
// The rule as first described was "5% on anything above $500, 10% off the total at $1,000, 20%
// off the total at $2,000", which is not monotonic: a $1,999 order would have netted $1,799.10
// and a $2,000 order $1,600.00 — the bigger order costs the customer LESS, and any customer who
// noticed would pad their order to cross the line. Each slice is now discounted at its own rate,
// so the total always rises with the order:
//
//   $0 – $500      0%
//   $500 – $1,000  5%
//   $1,000 – $2,000 10%
//   above $2,000   20%
//
// The discount rate on the LAST dollar is at most 20%, so total(x) = x − discount(x) is strictly
// increasing. That is the property worth protecting; the tests pin it directly rather than
// spot-checking a few amounts.
export const DISCOUNT_TIERS = [
  { from_cents: 0, to_cents: 50000, rate: 0 },
  { from_cents: 50000, to_cents: 100000, rate: 0.05 },
  { from_cents: 100000, to_cents: 200000, rate: 0.10 },
  { from_cents: 200000, to_cents: Infinity, rate: 0.20 },
];

const isCents = (n) => Number.isSafeInteger(n) && n >= 0;

/**
 * Apply the volume discount to a food subtotal, in integer cents.
 *
 * Returns the breakdown, not just a number, because the customer and the invoice both have to be
 * able to see WHY: a single "you saved $125" with no arithmetic behind it is the kind of number a
 * client questions six weeks later and nobody can reconstruct.
 *
 *   { subtotal_cents, discount_cents, total_cents, effective_rate, tiers: [...] }
 *
 * `tiers` carries only the slices that actually contributed, each with the amount it covered and
 * what it took off. Rounding is per slice (half-up) and the total is their exact sum, so the
 * printed lines always add up to the printed discount.
 */
export function applyVolumeDiscount(subtotalCents) {
  const subtotal = isCents(subtotalCents) ? subtotalCents : 0;
  const tiers = [];
  let discount = 0;

  for (const tier of DISCOUNT_TIERS) {
    // How much of the subtotal falls inside this slice.
    const amount = Math.max(0, Math.min(subtotal, tier.to_cents) - tier.from_cents);
    if (amount <= 0 || tier.rate <= 0) continue;
    const off = Math.round(amount * tier.rate);
    discount += off;
    tiers.push({ from_cents: tier.from_cents, to_cents: tier.to_cents, rate: tier.rate, amount_cents: amount, discount_cents: off });
  }

  // Belt and braces on a money path: rounding can never make the customer owe a negative amount,
  // and can never hand back more than was charged.
  discount = Math.min(discount, subtotal);
  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: subtotal - discount,
    effective_rate: subtotal > 0 ? discount / subtotal : 0,
    tiers,
  };
}

/**
 * What the customer would gain by spending a little more — the honest version.
 *
 * With marginal slices there is no cliff to warn anybody off, so this is not a nudge to cross a
 * line; it just answers "what happens if I add another tray". Returns null once the top tier is
 * reached (there is no next threshold to name) and null below the first threshold only if the
 * order is empty.
 *
 * `extra_cents` is the distance to the next threshold. `rate_after` is what the NEXT dollar earns
 * — deliberately not "you would save $X on the whole order", which is the claim the old
 * whole-order structure would have made and this one cannot.
 */
export function nextDiscountTier(subtotalCents) {
  const subtotal = isCents(subtotalCents) ? subtotalCents : 0;
  if (subtotal <= 0) return null;
  for (const tier of DISCOUNT_TIERS) {
    if (tier.rate > 0 && subtotal < tier.from_cents) {
      return { at_cents: tier.from_cents, extra_cents: tier.from_cents - subtotal, rate_after: tier.rate };
    }
  }
  return null;
}

/**
 * The customer-facing sentence, both languages, or null when nothing was discounted.
 * Kept here beside the arithmetic so the words and the maths cannot drift apart.
 */
export function describeDiscount(result, lang = 'en') {
  if (!result || !result.discount_cents) return null;
  const money = (c) => new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
  const pct = Math.round(result.effective_rate * 1000) / 10;
  return lang === 'es'
    ? `Descuento por volumen: −${money(result.discount_cents)} (${pct}% del subtotal)`
    : `Volume discount: −${money(result.discount_cents)} (${pct}% of subtotal)`;
}
