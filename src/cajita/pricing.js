// Pure pricing prototype. Never accepts prices from a customer configuration.
// This module is intentionally NOT connected to checkout or the public builder.
export const proposedCajitaPolicy = {
  version: 'cajita-draft-2026-09-09',
  status: 'draft',
  currency: 'USD',
  assemblyCents: 300,
  printingCents: { signature: 0, preset: 200 },
  items: {
    sandwich: { cents: 225, flavors: ['ham-spread'] },
    empanada: { cents: 250, flavors: ['guava-cheese'] },
    croqueta: { cents: 175, flavors: ['ham'] },
    salad: { cents: 350 },
    skewer: { cents: 250 },
    'tres-leches': { cents: 200 },
  },
};

const cents = (value) => Number.isSafeInteger(value) && value >= 0;
const quantity = (value, max) => Number.isSafeInteger(value) && value > 0 && value <= max;

/** Calculate food/packaging subtotal only; tax, delivery, stock, fit and dates are NOT checked. */
export function calculateCajitaDraft(variants, policy = proposedCajitaPolicy) {
  if (!Array.isArray(variants) || !variants.length || variants.length > 50) {
    throw new Error('Invalid variants');
  }
  if (!cents(policy.assemblyCents) || !policy.items || !policy.printingCents) {
    throw new Error('Invalid pricing policy');
  }
  const reasons = new Set(policy.status === 'approved' ? [] : ['unapproved-price-policy']);
  const ids = new Set();
  const lines = variants.map((variant) => {
    if (!variant.id || ids.has(variant.id) || !quantity(variant.quantity, 5000) ||
        !Array.isArray(variant.items) || !variant.items.length || variant.items.length > 50) {
      throw new Error('Invalid variant');
    }
    ids.add(variant.id);
    let unitCents = policy.assemblyCents;
    let complete = true;
    const printing = policy.printingCents[variant.printing];
    if (!cents(printing)) {
      complete = false;
      reasons.add('unpriced-printing');
    } else unitCents += printing;
    if (variant.packagingRequest?.trim()) reasons.add('packaging-review');
    const components = variant.items.map((item) => {
      if (!quantity(item.quantity, 50)) throw new Error('Invalid item quantity');
      const rate = Object.hasOwn(policy.items, item.id) ? policy.items[item.id] : null;
      const supported = rate && cents(rate.cents) &&
        (rate.flavors ? rate.flavors.includes(item.flavor) : !item.flavor);
      if (!supported) {
        complete = false;
        reasons.add('unpriced-item-or-flavor');
      }
      const amount = supported ? rate.cents * item.quantity : null;
      if (amount !== null) unitCents += amount;
      return { id: item.id, flavor: item.flavor || null, quantity: item.quantity, cents: amount };
    });
    const total = unitCents * variant.quantity;
    if (!Number.isSafeInteger(total)) throw new Error('Price exceeds supported range');
    return { id: variant.id, quantity: variant.quantity, components,
      unitCents: complete ? unitCents : null, subtotalCents: complete ? total : null };
  });
  const subtotalCents = lines.every((line) => line.subtotalCents !== null)
    ? lines.reduce((sum, line) => sum + line.subtotalCents, 0) : null;
  if (subtotalCents !== null && !Number.isSafeInteger(subtotalCents)) throw new Error('Price exceeds supported range');
  return {
    policyVersion: policy.version, currency: policy.currency, lines, subtotalCents,
    reviewReasons: [...reasons],
    // Even an approved price schedule does not prove fulfillment eligibility.
    checkoutEligible: false,
    fulfillmentChecksRequired: ['box-fit', 'stock', 'notice', 'delivery', 'tax'],
  };
}
