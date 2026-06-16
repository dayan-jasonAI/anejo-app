// Per-bowl kitchen production rows. Materializes one order_bowls row per physical bowl from
// an order's items JSON (idempotent via the unique order_id+seq index), and snapshots each
// bowl's customization for the kitchen view. Files under _lib are NOT routed. Never throws.
import { id, now, parseJson, toJson } from './hub.js';

const MAX_PER_LINE = 50; // guard against a runaway qty on one line

// Normalize an order line item into a customization snapshot. Renders whatever the order
// actually carries (subscription bowls are rich; à-la-carte may only have notes) so the
// kitchen view degrades gracefully as the public order builder adds fields.
export function customizationFromItem(it) {
  const i = it || {};
  const arr = (a, b) => (Array.isArray(a) ? a : (Array.isArray(b) ? b : null));
  return {
    size_oz: i.size_oz != null ? i.size_oz : null,
    size_pct: i.size_pct != null ? i.size_pct : null,
    macros: i.macros || null,
    build: Array.isArray(i.build) ? i.build : null,
    ingredients: Array.isArray(i.ingredients) ? i.ingredients : null,
    removals: arr(i.removals, i.exceptions),       // ingredient exceptions / removals
    addons: arr(i.addons, i.add_ons),              // ingredient add-ons
    notes: i.notes ? String(i.notes).slice(0, 500) : null,
    avocado: !!i.avocado,
  };
}

// Create the per-bowl rows for an order (one per physical bowl). Idempotent; safe to call
// repeatedly. Returns the current rows ordered by seq.
export async function ensureOrderBowls(env, order) {
  if (!env || !env.DB || !order || !order.id) return [];
  let rows = await fetchOrderBowls(env, order.id);
  if (rows.length) return rows;

  const items = parseJson(order.items, []) || [];
  const t = now();
  let seq = 0;
  for (const it of items) {
    const qty = Math.min(MAX_PER_LINE, Math.max(1, Math.floor(Number(it && it.qty) || 1)));
    const name = (it && (it.name || it.id)) || 'Item';
    const cust = toJson(customizationFromItem(it || {}));
    for (let i = 0; i < qty; i++) {
      seq += 1;
      try {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO order_bowls (id, order_id, seq, bowl_name, customization, prep_state, created_at, updated_at) VALUES (?,?,?,?,?,'pending',?,?)"
        ).bind(id('obw'), order.id, seq, name, cust, t, t).run();
      } catch { /* one bad line must not stop the rest */ }
    }
  }
  rows = await fetchOrderBowls(env, order.id);
  return rows;
}

// Fetch the per-bowl rows for one order (with the check-off actor's name), customization parsed.
export async function fetchOrderBowls(env, orderId) {
  try {
    const r = await env.DB.prepare(
      'SELECT ob.*, st.name AS prep_by_name FROM order_bowls ob LEFT JOIN staff st ON st.id = ob.prep_by WHERE ob.order_id=? ORDER BY ob.seq ASC'
    ).bind(orderId).all();
    return ((r && r.results) || []).map((b) => ({ ...b, customization: parseJson(b.customization, null) }));
  } catch {
    return [];
  }
}

// Fetch per-bowl rows for many orders at once → Map(order_id → rows[]). One query. Includes the
// PIN-matched check-off actor's name (prep_by_name) for the kitchen audit display.
export async function fetchBowlsForOrders(env, orderIds) {
  const map = new Map();
  const ids = (orderIds || []).filter(Boolean);
  if (!ids.length) return map;
  try {
    const ph = ids.map(() => '?').join(',');
    const r = await env.DB.prepare(`SELECT ob.*, st.name AS prep_by_name FROM order_bowls ob LEFT JOIN staff st ON st.id = ob.prep_by WHERE ob.order_id IN (${ph}) ORDER BY ob.seq ASC`).bind(...ids).all();
    for (const b of (r && r.results) || []) {
      const row = { ...b, customization: parseJson(b.customization, null) };
      if (!map.has(b.order_id)) map.set(b.order_id, []);
      map.get(b.order_id).push(row);
    }
  } catch { /* return what we have */ }
  return map;
}
