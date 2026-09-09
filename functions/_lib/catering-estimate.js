import { isAvailable, isOrderable } from './menu.js';
import { applyVolumeDiscount, nextDiscountTier } from './catering-pricing.js';

const FIT = new Set(['fuego', 'ligero', 'mar', 'raiz', 'coco', 'vida', 'congreen']);

// WHICH LIVE MENU SKUs A SELECTOR PRODUCT MAY BE BUILT FROM.
//
// One table, exported, because the price the customer is shown in the picker and the price the
// knapsack charges have to come from the same place. When this lived as a function body the
// picker had no way to read it, so the public form could only ever show a single lump subtotal —
// never a price per product, which is the first thing anyone asking for catering wants to see.
//
// Each entry is a base name plus the pack sizes published for it. `traditional_<base>` is the
// single unit; `catering_<base>-<n>` is the tray of n. Sizes not present in the live menu simply
// do not become packs, so listing a size here is an offer, never an assumption.
//
// NOT LISTED, DELIBERATELY (both boundaries inherited from the original mapping and left intact):
// the generic bocadito is not substituted for a Hawaiian roll with ham spread, and the live 5 oz
// flavoured tres leches is not substituted for the requested 3-4 oz cup. Neither equivalence was
// approved by Dayan. The flavoured cups are offered below under their OWN names instead, which is
// not a substitution - it is selling the item the menu actually has.
export const PRODUCT_PACKS = {
  lechon: { base: 'lechon', sizes: [10, 25] },
  congri: { base: 'congri', sizes: [10, 25] },
  tamales: { base: 'tamal', sizes: [10, 25] },
  salad: { base: 'fria', sizes: [10, 25] },
  // Priced by the menu all along and absent from the selector until 2026-09-09: Dayan's own
  // birthday order had to file yuca as "Other custom request", which is what made an otherwise
  // ordinary order unquotable.
  yuca: { base: 'yuca', sizes: [10, 25] },
  'salad-fresh': { base: 'verde', sizes: [10, 25] },
  skewer: { base: 'skewer', sizes: [25, 50] },
  'croqueta-dressed': { base: 'dressed', sizes: [25, 50] },
  bomba: { base: 'bomba', sizes: [25, 50] },
  'salami-bite': { base: 'salami', sizes: [25, 50] },
  'cup-fresa': { base: 'cup-fresa', sizes: [], packs: [['catering_cups-fresa', 12]] },
  'cup-chocolate': { base: 'cup-chocolate', sizes: [], packs: [['catering_cups-chocolate', 12]] },
  'cake-fresa': { base: 'cake-fresa', sizes: [] },
  'cake-chocolate': { base: 'cake-chocolate', sizes: [] },
  pizza: { base: 'pizza', sizes: [], packs: [['catering_pizza-3', 3]] },
};

// Sauces travel by the single cup or the 8-serving bulk tub. Kept apart from the food table
// because the picker offers them as add-ons rather than as a category you browse.
export const SAUCE_PACKS = {
  'dip-signature': { bulk: 'catering_dip-signature-bulk' },
  'dip-ajo': { bulk: 'catering_dip-ajo-bulk' },
  'dip-cilantro': { single: 'traditional_dip-cilantro', bulk: 'catering_dip-cilantro-bulk' },
  'dip-pineapple': { bulk: 'catering_dip-pineapple-bulk' },
  'dip-spicy': { single: 'traditional_dip-spicy', bulk: 'catering_dip-spicy-bulk' },
  'dip-spinach': { single: 'traditional_dip-spinach', bulk: 'catering_dip-spinach-bulk' },
  'dip-chimi': { bulk: 'catering_dip-chimi-bulk' },
  'dip-golden': { bulk: 'catering_dip-golden-bulk' },
  'dip-mango': { bulk: 'catering_dip-mango-bulk' },
  'dip-avocado': { bulk: 'catering_dip-avocado-bulk' },
  'dip-light': { bulk: 'catering_dip-light-bulk' },
  'dip-coconut': { bulk: 'catering_dip-coconut-bulk' },
};

// Flavoured lines whose flavor picks the SKU.
//
// This listed three croqueta fillings and one empanada, on the belief that the rest had no
// published tray. That was true when it was written and stopped being true on 2026-09-08, when
// the live menu gained a full set. Verified against production D1 on 2026-09-09: every filling
// the selector offers now has both a single and two tray sizes, at exactly the same prices as the
// ones already mapped (croquetas $2.50 / $40 / $75; empanadas $3.50 / $75 / $145, ropa vieja
// $4.00 / $85 / $165).
//
// The cost of the gap was concrete: a 50-piece sausage croqueta line on a real customer order
// came back "quoted after review" and had to be hand-priced, while the kitchen had a published
// $75 tray for exactly that item.
//
// An unlisted flavor still has no published price and is still quoted by a person — that rule has
// not changed, the list of what qualifies has.
const FLAVOR_SKUS = {
  croqueta: {
    ham: 'croq-jamon', chicken: 'croq-pollo', beef: 'croq-res',
    chorizo: 'croq-chorizo', sausage: 'croq-sausage', tuna: 'croq-tuna',
  },
  empanada: {
    'guava-cheese': 'emp-guava', cheese: 'emp-cheese', ham: 'emp-ham', tuna: 'emp-tuna',
    chicken: 'emp-pollo', beef: 'emp-res', 'ham-cheese': 'emp-ham-cheese',
    guava: 'emp-guava-only', 'ropa-vieja': 'emp-ropa-vieja', 'pulled-pork': 'emp-pulled-pork',
  },
};

export function candidates(row) {
  if (row.id?.startsWith('fit-') && FIT.has(row.id.slice(4))) return [[row.id.slice(4), 1]];

  const entry = PRODUCT_PACKS[row.id];
  if (entry) {
    return [
      [`traditional_${entry.base}`, 1],
      ...(entry.sizes || []).map((n) => [`catering_${entry.base}-${n}`, n]),
      ...(entry.packs || []),
    ];
  }

  const sauce = SAUCE_PACKS[row.id];
  if (sauce) return [...(sauce.single ? [[sauce.single, 1]] : []), ...(sauce.bulk ? [[sauce.bulk, 8]] : [])];

  const pieces = FLAVOR_SKUS[row.id]?.[row.flavor];
  return pieces ? [[`traditional_${pieces}`, 1], [`catering_${pieces}-25`, 25], [`catering_${pieces}-50`, 50]] : [];
}

// Exact bounded knapsack: never round up a guest's pieces/servings. Binary stock chunks keep
// the algorithm bounded even at 5,000 portions. Linked immutable paths preserve reconstruction.
function cheapestExact(quantity, packs) {
  const dp = Array(quantity + 1).fill(null);
  dp[0] = { cost: 0, path: null };
  for (const pack of packs) {
    let remaining = Math.min(pack.stock, Math.floor(quantity / pack.size));
    for (let chunk = 1; remaining > 0; chunk *= 2) {
      const count = Math.min(chunk, remaining);
      remaining -= count;
      const size = count * pack.size;
      const cost = count * pack.price;
      for (let q = quantity; q >= size; q--) {
        const previous = dp[q - size];
        if (previous && (!dp[q] || previous.cost + cost < dp[q].cost)) {
          dp[q] = { cost: previous.cost + cost, path: { id: pack.id, qty: count, previous: previous.path } };
        }
      }
    }
  }
  if (!dp[quantity]) return null;
  const counts = new Map();
  for (let step = dp[quantity].path; step; step = step.previous) counts.set(step.id, (counts.get(step.id) || 0) + step.qty);
  return { cost: dp[quantity].cost, items: [...counts].map(([id, qty]) => ({ id, qty })) };
}

/** Pure estimate using ONLY loadMenu's authoritative D1 rows. No taxes, fees or reservations.
 * Callers must additionally validate scheduling/fulfillment/custom packaging and reprice at
 * checkout. `checkout_eligible` means this food selection is fully mapped, not payment approval.
 *
 * WHAT A LINE THAT "NEEDS REVIEW" DOES TO THE REST OF THE ORDER (changed 2026-09-09).
 *
 * It used to stop the whole thing: one custom line, one note, or any event-level design input and
 * `checkout_eligible` went false for everything. Dayan's own 2026-09-09 birthday order is what
 * that costs - seven lines, five of them priced straight off the menu, and because two were not
 * (a yuca line the selector had no product for, and a design attachment) the customer was shown no
 * price and no way to pay. He then priced it by hand in the Hub.
 *
 * Now the three cases are separated, because they are not the same risk:
 *
 *   - Event-level design / theme / printing (the `needsReview` option) does NOT block the food.
 *     Custom packaging is quoted by a person; the roast pork is not.
 *   - A line carrying NOTES is priced for the quote but never enters the checkout cart. Someone
 *     who wrote "change ingredients" is not asking for the standard item at the standard price,
 *     and charging them for one is the exact failure the original guard was protecting against.
 *     Excluding it from the cart is a stronger guarantee than refusing the whole order was.
 *   - A line with no price at all stays unpriced and is quoted by a person.
 *
 * So `items` is the SELLABLE CART and `subtotal_cents` is what that cart costs. Everything a human
 * still has to price is in `unpriced`, carrying `indicative_cents` where the menu does have a
 * number, so the Hub can suggest a total instead of showing an empty box.
 */
export function estimateCateringProducts(rows, menu, { needsReview = false } = {}) {
  const result = { subtotal_cents: 0, items: [], unpriced: [], needs_review: Boolean(needsReview), checkout_eligible: false };
  if (!Array.isArray(rows) || !rows.length || rows.length > 50) {
    result.unpriced.push({ id: null, quantity: null, reason: 'invalid_selection' });
    result.needs_review = true;
    return result;
  }
  const groups = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 5000) {
      result.unpriced.push({ id: row?.id || null, quantity: row?.quantity ?? null, reason: 'invalid_quantity' });
      continue;
    }
    const noted = Boolean(String(row.notes || '').trim());
    if (noted) result.needs_review = true;
    // Notes are grouped with the line, not just counted globally: two croqueta lines where only
    // one says "no onions" must not sell BOTH at the standard price, and must not refuse the one
    // that was ordered plainly. The key already separates them by flavor; a noted line keys apart
    // from a clean one so they are priced as the two different things they are.
    const key = `${row.id}:${row.flavor || ''}:${noted ? 'noted' : ''}`;
    const group = groups.get(key) || { ...row, quantity: 0, noted };
    group.quantity += row.quantity;
    if (noted) group.notes = row.notes;
    groups.set(key, group);
  }
  const live = new Map((menu?.source === 'd1' ? menu.items || [] : []).map((row) => [row.id, row]));
  for (const row of groups.values()) {
    const mapping = candidates(row);
    const fail = (reason) => result.unpriced.push({ id: row.id, quantity: row.quantity, flavor: row.flavor || null, reason });
    if (row.quantity > 5000) { fail('quantity_limit'); continue; }
    if (!mapping.length) { fail('needs_custom_price'); continue; }
    if (menu?.source !== 'd1') { fail('live_menu_unavailable'); continue; }
    const packs = mapping.flatMap(([id, size]) => {
      const item = live.get(id);
      if (!item || item.active === 0 || item.active === false || !isAvailable(item) || !isOrderable(item)
        || (menu.availability?.[id] && menu.availability[id] !== 'available')
        || !Number.isSafeInteger(item.price_cents) || item.price_cents <= 0) return [];
      const raw = menu.stock?.[id] ?? item.stock_count;
      const stock = raw == null || raw === '' ? 5000 : Number(raw);
      if (!Number.isInteger(stock) || stock < 0) return [];
      return [{ id, size, price: item.price_cents, stock }];
    });
    const selection = cheapestExact(row.quantity, packs);
    if (!selection) { fail('unavailable_exact_quantity'); continue; }
    // A line the customer wrote instructions on is priced so the Hub has a number to start from,
    // but it does NOT join the cart: they asked for something other than the standard item.
    if (row.noted) {
      result.unpriced.push({
        id: row.id, quantity: row.quantity, flavor: row.flavor || null,
        reason: 'custom_request', indicative_cents: selection.cost,
      });
      continue;
    }
    result.subtotal_cents += selection.cost;
    result.items.push(...selection.items);
  }
  result.needs_review ||= result.unpriced.length > 0;

  // The volume discount rides on the sellable food only. Lines a person still has to price are
  // not in this number, so the discount cannot be computed off money nobody has agreed to yet.
  Object.assign(result, applyVolumeDiscount(result.subtotal_cents));
  result.next_tier = nextDiscountTier(result.subtotal_cents);

  // Sellable means "there is priced, in-stock, exactly-matched food in the cart" - no longer
  // "nothing anywhere in this request needs a human". See the note on this function.
  result.checkout_eligible = result.items.length > 0;
  return result;
}
