// Measured prep time: what the kitchen ACTUALLY took, beside the estimate that was showing.
// Files under functions/_lib are NOT routed. Table + the reasoning: migrations/0113_prep_actuals.sql.
//
// Dayan, 2026-09-16: "ask the kitchen staff to record these processes and over time we just
// adjust." Nothing in here adjusts anything. It records, and the owner adopts a number by tapping
// "use this" in the menu editor (functions/api/hub/owner/menu.js, op adopt_prep_minutes). An
// estimate that moved on its own would be an estimate he could not reason about, and the point of
// the whole feature is that he can.
//
// Everything on the capture side is BEST-EFFORT. Marking an order ready is a service-critical
// transition; a measurement is a nice-to-have. Nothing here may throw into that path, and nothing
// here may slow it down enough to notice.
import { id, now } from './util.js';
import { parseJson } from './hub.js';
import { loadKitchenTiming, loadPrepMinutes, orderTiming } from './kitchen-timing.js';

// Below this, a median is noise: one slow Tuesday would set the estimate for the year. The owner
// sees the sample count and nothing else until the third measurement lands.
export const MIN_SAMPLES = 3;
const MAX_QTY = 9999;

/** Whole minutes between two stamps. Never negative — a clock that went backwards records 0. */
export const minutesBetween = (fromMs, toMs) => Math.max(0, Math.round((Number(toMs) - Number(fromMs)) / 60000));

/** Middle value of a sorted-by-value list; the mean of the two middles when the count is even. */
function medianOf(values) {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * What a set of measurements says, in the shape the owner's desk renders.
 *   count            always reported — "2 so far" is information, and it is honest
 *   median_minutes   null until MIN_SAMPLES. The MEDIAN, not the mean: one order that sat while a
 *                    delivery was signed for must not drag the number the owner adopts.
 *   per_unit         minutes ÷ qty, taken per row and then medianed. A RATE, not a duration, so
 *                    it keeps one decimal — 20 bowls in 10 minutes is 0.5, not "0 minutes".
 *   median_single    THE ONLY NUMBER SAFE TO ADOPT, and null until MIN_SAMPLES of them. menu_items
 *                    .prep_minutes means ONE of that item, so only measurements of one unit can set
 *                    it. Neither other number can: the total of "croquetas ×200 = 90 min" would make
 *                    a single croqueta 90 minutes, and its rate (0.45) would make it one — a batch
 *                    measures THROUGHPUT, which is worth knowing and is not this field.
 *   count_single     how many single-unit measurements there are, so the desk can say what is missing
 *   last_at          when the most recent one was measured
 */
export function summarize(rows) {
  const list = (rows || []).filter((r) => Number.isFinite(Number(r.minutes)));
  const enough = list.length >= MIN_SAMPLES;
  const perUnit = list.filter((r) => Number(r.qty) > 0).map((r) => Number(r.minutes) / Number(r.qty));
  const pu = enough && perUnit.length >= MIN_SAMPLES ? medianOf(perUnit) : null;
  // A row with no qty recorded is one thing made once — that is what an unquantified timing means.
  const single = list.filter((r) => r.qty === null || r.qty === undefined || Number(r.qty) <= 1);
  return {
    count: list.length,
    median_minutes: enough ? Math.round(medianOf(list.map((r) => Number(r.minutes)))) : null,
    median_per_unit: pu === null ? null : Math.round(pu * 10) / 10,
    count_single: single.length,
    median_single: single.length >= MIN_SAMPLES ? Math.round(medianOf(single.map((r) => Number(r.minutes)))) : null,
    last_at: list.reduce((m, r) => Math.max(m, Number(r.ended_at) || 0), 0) || null,
  };
}

/** The measurements behind one menu item's median. Finished rows only. */
export async function itemActuals(env, menuItemId) {
  const res = await env.DB.prepare(
    `SELECT minutes, qty, ended_at FROM prep_actuals
      WHERE menu_item_id = ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 200`
  ).bind(menuItemId).all();
  return (res && res.results) || [];
}

/**
 * When this order's prep really began. orders.prep_started_at is the stamp Start prep writes; the
 * prep_start row in kitchen_audit covers orders started before that column existed. Deliberately
 * NOT falling back to updated_at or created_at the way the response's own prep_minutes does: those
 * move on any later write (an office raising its lunch count, for one) and would record a duration
 * that never happened. No known start → no row.
 */
export async function orderStartedAt(env, order) {
  const stamped = Number(order && order.prep_started_at) || 0;
  if (stamped > 0) return stamped;
  try {
    const row = await env.DB.prepare(
      "SELECT created_at FROM kitchen_audit WHERE order_id = ? AND action = 'prep_start' ORDER BY created_at ASC LIMIT 1"
    ).bind(order.id).first();
    return Number(row && row.created_at) || null;
  } catch { return null; }
}

/** The items as [{id, name, qty}] — what was made, at what quantity, in the cook's own order. */
function itemSummary(order) {
  const items = parseJson(order && order.items, []) || [];
  if (!Array.isArray(items)) return [];
  return items.map((it) => ({
    id: (it && it.id != null) ? String(it.id) : null,
    name: (it && (it.name || it.id)) ? String(it.name || it.id) : 'Item',
    qty: Number(it && it.qty) || 1,
  }));
}

/**
 * The one menu item a whole-order measurement can honestly be ABOUT: an order made of a single
 * distinct menu item. Five of the same bowl took these minutes — that is a real measurement of
 * that bowl at that quantity, and it is exactly what prep_minutes is supposed to predict.
 * A mixed order returns null: its minutes belong to the order, not to any one of its items.
 * Contract orders are excluded outright — their estimate is kitchen.office_prep_minutes, which is
 * not a menu item at all.
 */
function soleMenuItemId(order, items) {
  if (order && order.contract_site_id) return null;
  const ids = [...new Set(items.map((it) => it.id).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

/** What the board was predicting for this order when it was marked ready, or null if nothing. */
async function estimateFor(env, order, items) {
  try {
    const [timing, prepById] = await Promise.all([loadKitchenTiming(env), loadPrepMinutes(env)]);
    // siteLabel only shifts ready-by, never the estimate, so the board's per-site window lookup
    // is not worth a third query on the ready path.
    const t = orderTiming({ order, items, prepById, siteLabel: null, timing, atMs: now() });
    return Number.isInteger(t.estimate_minutes) ? t.estimate_minutes : null;
  } catch { return null; }
}

/**
 * Record one 'order' measurement. Called after an order is really marked ready.
 * BEST-EFFORT: returns null on anything unexpected and never throws. Marking food ready must not
 * fail, or be delayed, because a measurement could not be saved.
 */
export async function recordOrderActual(env, { order, endedAt, staff = null } = {}) {
  try {
    if (!env || !env.DB || !order || !order.id) return null;
    const startedAt = await orderStartedAt(env, order);
    if (!startedAt) return null;                      // unknown start: record nothing, not a guess
    const ended = Number(endedAt) || now();
    const items = itemSummary(order);
    const qty = items.reduce((n, it) => n + it.qty, 0) || null;
    const estimate = await estimateFor(env, order, items);
    const rowId = id('pra');
    await env.DB.prepare(
      `INSERT INTO prep_actuals (id, kind, order_id, menu_item_id, label, qty, started_at, ended_at,
         minutes, estimate_minutes, items, staff_id, staff_name, note, created_at)
       VALUES (?, 'order', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
    ).bind(
      rowId, order.id, soleMenuItemId(order, items), qty, startedAt, ended,
      minutesBetween(startedAt, ended), estimate, JSON.stringify(items),
      (staff && staff.id) || null, (staff && staff.name) || null, ended,
    ).run();
    return rowId;
  } catch { return null; }                            // measurement lost, order still ready
}

/** The batch this cook has running right now, or null. */
export async function openBatch(env, staffId) {
  if (!env || !env.DB || !staffId) return null;
  try {
    return await env.DB.prepare(
      "SELECT * FROM prep_actuals WHERE kind = 'batch' AND staff_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
    ).bind(staffId).first();
  } catch { return null; }
}

/**
 * Close whatever this cook has running, honestly — the row is stamped with the time it really ran
 * for, not discarded. Called on Done, when a second Start arrives, and at clock-out: a cook who
 * forgets to tap Done still leaves a true measurement behind, and never a second running clock.
 * `note` says which of those closed it, because a clock-out close is weaker evidence than a Done.
 */
export async function closeOpenBatch(env, staffId, atMs, note = null) {
  try {
    const row = await openBatch(env, staffId);
    if (!row) return null;
    const ended = Number(atMs) || now();
    const minutes = minutesBetween(row.started_at, ended);
    await env.DB.prepare(
      'UPDATE prep_actuals SET ended_at = ?, minutes = ?, note = COALESCE(note, ?) WHERE id = ? AND ended_at IS NULL'
    ).bind(ended, minutes, note, row.id).run();
    return { ...row, ended_at: ended, minutes, note: row.note || note };
  } catch { return null; }
}

/**
 * Every menu item's measurement, for the owner's desk: id → summarize(). One query for the whole
 * menu. A missing table (migration 0113 not applied yet) reads as "nothing measured", not an error
 * on the page that prices the food.
 */
export async function measuredByItem(env) {
  const out = new Map();
  try {
    const res = await env.DB.prepare(
      `SELECT menu_item_id, minutes, qty, ended_at FROM prep_actuals
        WHERE menu_item_id IS NOT NULL AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 5000`
    ).all();
    const rows = (res && res.results) || [];
    for (const r of rows) {
      const k = String(r.menu_item_id);
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(r);
    }
    for (const [k, list] of out) out.set(k, summarize(list));
  } catch { /* not migrated yet: nothing measured */ }
  return out;
}

/**
 * The office lunch, measured — contract orders only, against kitchen.office_prep_minutes. Joined
 * to orders rather than flagged on the row: contract_site_id already says which orders are office
 * lunches, and a second copy of that fact could disagree with it.
 */
export async function measuredOffice(env) {
  try {
    const res = await env.DB.prepare(
      `SELECT a.minutes, a.qty, a.ended_at FROM prep_actuals a JOIN orders o ON o.id = a.order_id
        WHERE a.kind = 'order' AND a.ended_at IS NOT NULL AND o.contract_site_id IS NOT NULL
        ORDER BY a.ended_at DESC LIMIT 500`
    ).all();
    return summarize((res && res.results) || []);
  } catch { return summarize([]); }
}

/** The recent measurements themselves, newest first — the owner's batch log. */
export async function prepLog(env, limit = 60) {
  try {
    const res = await env.DB.prepare(
      `SELECT a.id, a.kind, a.order_id, a.menu_item_id, a.label, a.qty, a.started_at, a.ended_at,
              a.minutes, a.estimate_minutes, a.staff_name, a.note, m.name AS item_name
         FROM prep_actuals a LEFT JOIN menu_items m ON m.id = a.menu_item_id
        WHERE a.ended_at IS NOT NULL ORDER BY a.ended_at DESC LIMIT ?`
    ).bind(limit).all();
    return (res && res.results) || [];
  } catch { return []; }
}

/** Validate a quantity. Blank is refused: "how many" is the half of the data the model lacks. */
export function parseQty(raw) {
  if (raw === '' || raw == null) return { error: 'Enter how many you are making. / Escribe cuántos vas a hacer.' };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QTY) {
    return { error: `Quantity must be a whole number, 1–${MAX_QTY}. / La cantidad debe ser un número entero, 1–${MAX_QTY}.` };
  }
  return { qty: n };
}
