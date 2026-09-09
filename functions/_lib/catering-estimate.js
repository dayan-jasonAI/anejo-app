import { isAvailable, isOrderable } from './menu.js';

const FIT = new Set(['fuego', 'ligero', 'mar', 'raiz', 'coco', 'vida', 'congreen']);
const SERVINGS = { lechon: 'lechon', congri: 'congri', tamales: 'tamal', salad: 'fria' };

function candidates(row) {
  if (row.id?.startsWith('fit-') && FIT.has(row.id.slice(4))) return [[row.id.slice(4), 1]];
  const base = SERVINGS[row.id];
  if (base) return [[`traditional_${base}`, 1], [`catering_${base}-10`, 10], [`catering_${base}-25`, 25]];
  let pieces;
  if (row.id === 'croqueta') pieces = { ham: 'croq-jamon', chicken: 'croq-pollo', beef: 'croq-res' }[row.flavor];
  if (row.id === 'empanada' && row.flavor === 'guava-cheese') pieces = 'emp-guava';
  if (row.id === 'skewer') pieces = 'skewer';
  // Do not substitute the generic bocadito for a Hawaiian roll with ham spread, or the live
  // 5 oz flavored dessert for the requested 3–4 oz tres leches. Neither equivalence is approved.
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
 * `subtotal_cents` is the known FOOD subtotal when unpriced is nonempty, never a final quote.
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
    if (String(row.notes || '').trim()) result.needs_review = true;
    const key = `${row.id}:${row.flavor || ''}`;
    const group = groups.get(key) || { ...row, quantity: 0 };
    group.quantity += row.quantity;
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
    result.subtotal_cents += selection.cost;
    result.items.push(...selection.items);
  }
  result.needs_review ||= result.unpriced.length > 0;
  result.checkout_eligible = !result.needs_review && result.items.length > 0;
  return result;
}
