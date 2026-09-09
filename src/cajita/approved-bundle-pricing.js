// Dayan approved these complete-bundle prices in-session on 2026-09-09.
// Component substitutions, removal credits and bespoke printing are not priced here.
export const approvedCajitaBundles = Object.freeze({
  version: 'cajita-bundles-2026-09-09',
  currency: 'USD',
  signature: Object.freeze({ unitCents: 1800, minimumNoticeHours: 48 }),
  preset: Object.freeze({ unitCents: 2000, minimumNoticeHours: 72 }),
});

const standard = new Map([
  ['sandwich', 'ham-spread'], ['empanada', 'guava-cheese'], ['croqueta', 'ham'],
  ['salad', null], ['skewer', null], ['tres-leches', null],
]);

/** Pure bundle subtotal, NOT fulfillment approval. Printing must be classified by the server. */
export function priceApprovedCajitaBundle({ items, quantity, printing, packagingRequest = '' }) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 5000) {
    throw new Error('Invalid quantity');
  }
  const rate = Object.hasOwn(approvedCajitaBundles, printing) &&
    ['signature', 'preset'].includes(printing) ? approvedCajitaBundles[printing] : null;
  const seen = new Set();
  const complete = Array.isArray(items) && items.length === standard.size && items.every((item) => {
    if (!item || seen.has(item.id) || !standard.has(item.id) || item.quantity !== 1 ||
        (item.flavor || null) !== standard.get(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const reviewReasons = [];
  if (!complete) reviewReasons.push('custom-food-pricing-required');
  if (!rate) reviewReasons.push('custom-printing-pricing-required');
  if (typeof packagingRequest !== 'string' || packagingRequest.trim()) reviewReasons.push('packaging-review');
  const priced = reviewReasons.length === 0;
  return {
    policyVersion: approvedCajitaBundles.version,
    currency: 'USD', quantity,
    unitCents: priced ? rate.unitCents : null,
    subtotalCents: priced ? rate.unitCents * quantity : null,
    minimumNoticeHours: rate?.minimumNoticeHours ?? null,
    reviewReasons,
    checkoutEligible: false,
    fulfillmentChecksRequired: ['box-fit', 'stock', 'notice', 'delivery', 'tax'],
  };
}
