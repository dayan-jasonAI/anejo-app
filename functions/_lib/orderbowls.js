// Per-bowl kitchen production rows. Materializes one order_bowls row per physical bowl from
// an order's items JSON (idempotent via the unique order_id+seq index), and snapshots each
// bowl's customization for the kitchen view. Files under _lib are NOT routed. Never throws.
import { id, now, parseJson, toJson } from './hub.js';

// Guard against a runaway qty on one line. 500 is the largest headcount a contract site can
// submit (see submitHeadcount), so anything at or under it is a real order that must be built in
// full. This was 50, which silently clamped: a 60-lunch office would have had 50 bowls
// materialized and been billed for 60 — the same "kitchen and invoice disagree" failure this
// file's reconcile exists to prevent, just triggered by size instead of by an edit.
const MAX_PER_LINE = 500;

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

// What the order owes right now, as bowl_name → { qty, cust }. Lines that share a name are
// summed, because the checklist counts physical bowls, not order lines.
function desiredByName(order) {
  const items = parseJson(order && order.items, []) || [];
  const map = new Map();
  for (const it of items) {
    const qty = Math.min(MAX_PER_LINE, Math.max(1, Math.floor(Number(it && it.qty) || 1)));
    const name = (it && (it.name || it.id)) || 'Item';
    const cur = map.get(name);
    if (cur) cur.qty += qty;
    else map.set(name, { qty, cust: toJson(customizationFromItem(it || {})) });
  }
  return map;
}

// Bring the per-bowl rows in line with what the order currently owes.
//
// This used to return early the moment ANY row existed, which made the checklist a snapshot of
// the count at the instant prep started. When an office raised its headcount afterwards — 23
// lunches in Pompano, then two more — the order row, the invoice ledger and the receipt all moved
// to 25 while the kitchen's checklist, the readiness gate and the driver's pickup count stayed at
// 23. The office was billed for 25 and handed 23, and nothing in the Hub disagreed with itself
// loudly enough for anyone to catch it.
//
// Reconciling is deliberately asymmetric. Bowls the order GAINED are added as 'pending'. Bowls it
// gave up are removed ONLY while nobody has acted on them: a bowl a cook has checked off, or one a
// driver has counted at pickup, is a fact about the physical world and is never deleted to make a
// number match. Rows that survive keep their prep state, so raising a count never re-opens work
// that is already done.
async function syncBowls(env, order, { createIfMissing }) {
  const existing = await fetchOrderBowls(env, order.id);
  if (!existing.length && !createIfMissing) return { rows: [], added: 0, removed: 0 };

  const desired = desiredByName(order);
  // Nothing authoritative to reconcile against. An order whose items are missing or unparseable
  // tells us nothing about what it owes — and "owes nothing" is the one reading that would delete
  // a kitchen's whole checklist. Leave what is there and let a human see the mismatch.
  if (!desired.size && existing.length) return { rows: existing, added: 0, removed: 0 };

  const t = now();

  const byName = new Map();
  for (const b of existing) {
    const k = b.bowl_name || 'Item';
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(b);
  }

  let seq = existing.reduce((m, b) => Math.max(m, Number(b.seq) || 0), 0);
  let added = 0;
  let removed = 0;

  // Build every insert first, then send them in chunks. A 120-lunch office order is 120 rows;
  // awaiting them one at a time is 120 sequential round trips inside a Worker request, which is
  // how the first materialization of a large order times out and leaves a half-built checklist.
  const inserts = [];
  for (const [name, want] of desired) {
    const have = (byName.get(name) || []).length;
    for (let i = have; i < want.qty; i++) {
      seq += 1;
      inserts.push([id('obw'), order.id, seq, name, want.cust, t, t]);
    }
  }
  const INSERT_SQL = "INSERT OR IGNORE INTO order_bowls (id, order_id, seq, bowl_name, customization, prep_state, created_at, updated_at) VALUES (?,?,?,?,?,'pending',?,?)";
  for (let i = 0; i < inserts.length; i += 50) {
    const chunk = inserts.slice(i, i + 50);
    try {
      await env.DB.batch(chunk.map((args) => env.DB.prepare(INSERT_SQL).bind(...args)));
      added += chunk.length;
    } catch {
      // A chunk that will not go as one transaction still goes bowl by bowl: a partial checklist
      // is worse than a slow one.
      for (const args of chunk) {
        try {
          await env.DB.prepare(INSERT_SQL).bind(...args).run();
          added += 1;
        } catch { /* one bad row must not stop the rest */ }
      }
    }
  }

  for (const [name, rows] of byName) {
    let surplus = rows.length - (desired.has(name) ? desired.get(name).qty : 0);
    if (surplus <= 0) continue;
    // Newest first: the bowls added last are the ones the office just gave up.
    const removable = rows
      .filter((b) => (b.prep_state || 'pending') !== 'done' && !b.driver_confirmed_at)
      .sort((a, b) => (Number(b.seq) || 0) - (Number(a.seq) || 0));
    for (const b of removable) {
      if (surplus <= 0) break;
      try {
        const r = await env.DB.prepare(
          "DELETE FROM order_bowls WHERE id = ? AND COALESCE(prep_state,'pending') <> 'done' AND driver_confirmed_at IS NULL"
        ).bind(b.id).run();
        if (r && r.meta && r.meta.changes) { removed += 1; surplus -= 1; }
      } catch { /* leave it: a stale extra bowl is safer than a lost one */ }
    }
  }

  return { rows: await fetchOrderBowls(env, order.id), added, removed };
}

// Create the per-bowl rows for an order (one per physical bowl), and reconcile them against the
// order's current items on every later call. Idempotent; safe to call repeatedly. Returns the
// current rows ordered by seq.
export async function ensureOrderBowls(env, order) {
  if (!env || !env.DB || !order || !order.id) return [];
  const r = await syncBowls(env, order, { createIfMissing: true });
  return r.rows;
}

// Reconcile an order whose bowls were ALREADY materialized, and do nothing otherwise. Used when a
// count changes: an order the kitchen has not started yet has no checklist to correct, and must
// not be given one early — the board shows the items breakdown until a cook taps "start prep".
// Returns { rows, added, removed } so the caller can react to the checklist actually moving.
export async function reconcileOrderBowls(env, order) {
  if (!env || !env.DB || !order || !order.id) return { rows: [], added: 0, removed: 0 };
  return syncBowls(env, order, { createIfMissing: false });
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
