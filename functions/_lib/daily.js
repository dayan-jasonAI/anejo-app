// Añejo Daily — one featured lunch per day, sold from a per-date public allocation.
// Files under functions/_lib are NOT routed.
//
// Owner decisions this file encodes (2026-09-10):
//   · ONE featured meal per service date, at one of the approved price tiers ($10 / $15 by default,
//     owner-editable). Which dish is $10 or $15 is owner data, never a code guess.
//   · A PUBLIC allocation per date (default 10), owner-controlled and never raised automatically.
//   · Same-day ordering until a cutoff (default 11:00 AM ET, owner-editable per setting or per date).
//   · Institutional (DGP/clinic) headcount never consumes the public allocation. The two quantities
//     share one meal definition and nothing else.
//
// THE ONE PROPERTY THAT MATTERS MOST: two customers cannot buy the last portion. claimPortions() is
// a single INSERT … SELECT whose WHERE clause re-counts confirmed + unexpired held portions and only
// inserts while they still fit. D1 executes each statement atomically against the one primary, so
// there is no window between the check and the write. Expired holds stop counting by themselves —
// nothing has to "release" an abandoned checkout for its portion to come back.
import { id, now, addEtDays } from './hub.js';
import { etParts } from './ondemand.js';
import { isAvailable } from './menu.js';
import { resolveContractMeal, parseDeliveryDays } from './contract.js';

export const DAILY_KIND = 'daily';
export const DAILY_DEFAULTS = Object.freeze({
  cutoff_time: '11:00',
  default_allocation: 10,
  tiers: [1000, 1500],
  hold_minutes: 30,
  max_per_order: 1,   // the storefront offers one; the server must enforce the same rule
  horizon_days: 7,
});
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const intIn = (v, lo, hi, dflt) => {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : dflt;
};

export function parseTiers(raw) {
  const list = String(raw == null ? '' : raw).split(',').map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 100000);
  return [...new Set(list)].sort((a, b) => a - b);
}

/** Owner settings (app_settings daily.*), each falling back to its default on bad data. Never throws. */
export async function loadDailySettings(env) {
  const out = { ...DAILY_DEFAULTS, tiers: DAILY_DEFAULTS.tiers.slice() };
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'daily.%'").all();
    for (const row of (r && r.results) || []) {
      const k = String(row.key).slice(6);
      if (k === 'cutoff_time' && HHMM.test(String(row.value || ''))) out.cutoff_time = String(row.value);
      if (k === 'default_allocation') out.default_allocation = intIn(row.value, 0, 500, out.default_allocation);
      if (k === 'hold_minutes') out.hold_minutes = intIn(row.value, 5, 120, out.hold_minutes);
      if (k === 'max_per_order') out.max_per_order = intIn(row.value, 1, 50, out.max_per_order);
      if (k === 'horizon_days') out.horizon_days = intIn(row.value, 1, 14, out.horizon_days);
      if (k === 'tiers') { const t = parseTiers(row.value); if (t.length) out.tiers = t; }
    }
  } catch { /* defaults */ }
  return out;
}

export async function saveDailySettings(env, input = {}, by) {
  const errors = [];
  const put = [];
  if ('cutoff_time' in input) {
    const v = String(input.cutoff_time || '').trim();
    if (!HHMM.test(v)) errors.push('Cutoff must be a time like 11:00 (24-hour, ET).');
    else put.push(['daily.cutoff_time', v]);
  }
  if ('default_allocation' in input) {
    const n = Number(input.default_allocation);
    if (!Number.isInteger(n) || n < 0 || n > 500) errors.push('Default allocation must be a whole number from 0 to 500.');
    else put.push(['daily.default_allocation', String(n)]);
  }
  if ('max_per_order' in input) {
    const n = Number(input.max_per_order);
    if (!Number.isInteger(n) || n < 1 || n > 50) errors.push('Portions per order must be a whole number from 1 to 50.');
    else put.push(['daily.max_per_order', String(n)]);
  }
  if ('tiers' in input) {
    const t = parseTiers(Array.isArray(input.tiers) ? input.tiers.join(',') : input.tiers);
    if (!t.length) errors.push('Enter at least one price tier in cents, e.g. 1000,1500.');
    else put.push(['daily.tiers', t.join(',')]);
  }
  if (errors.length) return { ok: false, errors };
  const t = now();
  for (const [k, v] of put) {
    await env.DB.prepare(
      `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(k, v, by || null, t).run();
  }
  return { ok: true, settings: await loadDailySettings(env) };
}

export const isTierPrice = (settings, cents) => (settings.tiers || []).includes(Number(cents));
export const dailyHoldMs = (settings) => (settings.hold_minutes || DAILY_DEFAULTS.hold_minutes) * 60000;
export const hhmmToMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
export function fmtCutoff(t) {
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export const effectiveCutoff = (settings, row) => (row && HHMM.test(String(row.cutoff_time || '')) ? row.cutoff_time : settings.cutoff_time);

/** Has ordering for `dateStr` closed at `nowDate`? Past dates always; future dates never; today at the cutoff. */
export function cutoffPassed(dateStr, cutoffTime, nowDate = new Date()) {
  const p = etParts(nowDate);
  if (dateStr < p.dateStr) return true;
  if (dateStr > p.dateStr) return false;
  return p.hour * 60 + p.minute >= hhmmToMin(cutoffTime);
}

export async function scheduleRow(env, dateStr) {
  try {
    return (await env.DB.prepare(
      `SELECT s.*, m.kind, m.name, m.name_es, m.description, m.description_es, m.image, m.price_cents,
              m.active, m.availability, m.unit_cost_cents
         FROM daily_schedule s LEFT JOIN menu_items m ON m.id = s.menu_item_id
        WHERE s.service_date = ?`
    ).bind(dateStr).first()) || null;
  } catch { return null; }
}

/** Confirmed (paid) and currently-held portions for a date. Expired holds count for nothing. */
export async function claimTotals(env, dateStr, nowMs = Date.now()) {
  try {
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'confirmed' THEN qty ELSE 0 END), 0) AS sold,
              COALESCE(SUM(CASE WHEN status = 'held' AND expires_at > ? THEN qty ELSE 0 END), 0) AS held
         FROM daily_claims WHERE service_date = ?`
    ).bind(nowMs, dateStr).first();
    return { sold: Number((r && r.sold) || 0), held: Number((r && r.held) || 0) };
  } catch { return { sold: 0, held: 0 }; }
}

/**
 * What a customer (or the owner) sees for one service date. null when nothing is scheduled.
 * status: open | sold_out | closed | unavailable.
 */
export async function dayView(env, dateStr, { settings, nowDate = new Date() } = {}) {
  const s = settings || await loadDailySettings(env);
  const row = await scheduleRow(env, dateStr);
  if (!row || row.status !== 'active' || !row.kind) return null;
  const totals = await claimTotals(env, dateStr, nowDate.getTime());
  const allocation = Math.max(0, Number(row.allocation) || 0);
  const remaining = Math.max(0, allocation - totals.sold - totals.held);
  const cutoff = effectiveCutoff(s, row);
  const sellable = row.kind === DAILY_KIND && Number(row.active) === 1 && isAvailable(row) && isTierPrice(s, row.price_cents);
  let status = 'open';
  if (!sellable) status = 'unavailable';
  else if (cutoffPassed(dateStr, cutoff, nowDate)) status = 'closed';
  else if (remaining <= 0) status = 'sold_out';
  return {
    date: dateStr,
    weekday: new Date(dateStr + 'T12:00:00Z').getUTCDay(),
    item: {
      id: row.menu_item_id, name: row.name, name_es: row.name_es || row.name,
      description: row.description || '', description_es: row.description_es || row.description || '',
      image: row.image || null, price_cents: row.price_cents,
    },
    allocation, sold: totals.sold, held: totals.held, remaining,
    cutoff_time: cutoff, cutoff_label: fmtCutoff(cutoff),
    status,
  };
}

/** Today's Daily and the next scheduled one inside the horizon — the public payload. */
export async function publicDaily(env, { settings, nowDate = new Date() } = {}) {
  const s = settings || await loadDailySettings(env);
  const today = etParts(nowDate).dateStr;
  const todayView = await dayView(env, today, { settings: s, nowDate });
  let nextView = null;
  try {
    const r = await env.DB.prepare(
      "SELECT service_date FROM daily_schedule WHERE status = 'active' AND service_date > ? AND service_date <= ? ORDER BY service_date LIMIT 1"
    ).bind(today, addEtDays(today, s.horizon_days)).first();
    if (r) nextView = await dayView(env, r.service_date, { settings: s, nowDate });
  } catch { nextView = null; }
  // Strip the held/sold split: what is LEFT is a promise to the customer, how it got there is not
  // their business. `allocation` stays — the Marketing Team is allowed to know the day's size (the
  // owner's section 11) and reads this function. The public HTTP endpoint drops it again before it
  // leaves the building; see functions/api/daily.js.
  const pub = (v) => (v ? { date: v.date, weekday: v.weekday, item: v.item, allocation: v.allocation, remaining: v.remaining, cutoff_time: v.cutoff_time, cutoff_label: v.cutoff_label, status: v.status } : null);
  return { today: pub(todayView), next: pub(nextView), cutoff_label: fmtCutoff(s.cutoff_time) };
}

// ---------------------------------------------------------------- claims

export async function findClaimByKey(env, key) {
  if (!key) return null;
  try { return (await env.DB.prepare('SELECT * FROM daily_claims WHERE checkout_key = ?').bind(key).first()) || null; } catch { return null; }
}

// The capacity test, shared by the insert and the re-claim so they cannot disagree.
const FITS = `(SELECT COALESCE(SUM(c.qty), 0) FROM daily_claims c
                WHERE c.service_date = s.service_date AND c.id <> ?
                  AND (c.status = 'confirmed' OR (c.status = 'held' AND c.expires_at > ?))) + ? <= s.allocation`;

/**
 * Reserve `qty` public portions of `mealId` on `dateStr`. Atomic: succeeds only while they fit.
 *   → { ok:true, claim_id, expires_at, reclaimed? }
 *   → { ok:false, code:'sold_out', remaining } | { ok:false, code:'duplicate', existing } |
 *     { ok:false, code:'already_paid' } | { ok:false, code:'stale_key' } | { ok:false, code:'error' }
 * A checkout_key that was used before and RELEASED (Square failed, or the hold lapsed) may be
 * re-claimed by the same key — still through the same capacity test.
 */
export async function claimPortions(env, { dateStr, mealId, qty, checkoutKey, buyerHash = null, orderId, nowMs = Date.now(), holdMs = DAILY_DEFAULTS.hold_minutes * 60000 }) {
  const n = Math.floor(Number(qty));
  if (!Number.isInteger(n) || n < 1) return { ok: false, code: 'error' };
  const exp = nowMs + holdMs;
  const remainingNow = async () => {
    const row = await scheduleRow(env, dateStr);
    const t = await claimTotals(env, dateStr, nowMs);
    return Math.max(0, (Number(row && row.allocation) || 0) - t.sold - t.held);
  };

  const existing = checkoutKey ? await findClaimByKey(env, checkoutKey) : null;
  if (existing) {
    if (existing.status === 'confirmed') return { ok: false, code: 'already_paid' };
    if (existing.service_date !== dateStr || existing.menu_item_id !== mealId) return { ok: false, code: 'stale_key' };
    const live = existing.status === 'held' && Number(existing.expires_at) > nowMs;
    // A Square link was minted for this key and never released, so the customer may still be
    // holding it open. Hand THAT link back — never a second one, and never a new order id over
    // the top of it: whichever link they pay, the webhook must find this claim by that order.
    if (live || existing.payment_url) return { ok: false, code: 'duplicate', existing };
    // Never got a link (Square failed, or the attempt was abandoned before one was returned):
    // take it back up through the SAME capacity test.
    const r = await env.DB.prepare(
      `UPDATE daily_claims SET status = 'held', qty = ?, buyer_hash = ?, order_id = ?, payment_url = NULL, expires_at = ?, updated_at = ?
        WHERE id = ? AND (status = 'released' OR (status = 'held' AND expires_at <= ?))
          AND EXISTS (SELECT 1 FROM daily_schedule s WHERE s.service_date = daily_claims.service_date AND s.status = 'active'
                        AND s.menu_item_id = ? AND ${FITS})`
    ).bind(n, buyerHash, orderId || null, exp, nowMs, existing.id, nowMs, mealId, existing.id, nowMs, n).run();
    if (r.meta && r.meta.changes === 1) return { ok: true, claim_id: existing.id, expires_at: exp, reclaimed: true };
    return { ok: false, code: 'sold_out', remaining: await remainingNow() };
  }

  const cid = id('dcl');
  try {
    const r = await env.DB.prepare(
      `INSERT INTO daily_claims (id, service_date, menu_item_id, qty, checkout_key, buyer_hash, order_id, status, expires_at, created_at, updated_at)
       SELECT ?, s.service_date, s.menu_item_id, ?, ?, ?, ?, 'held', ?, ?, ?
         FROM daily_schedule s
        WHERE s.service_date = ? AND s.status = 'active' AND s.menu_item_id = ? AND ${FITS}`
    ).bind(cid, n, checkoutKey || null, buyerHash, orderId || null, exp, nowMs, nowMs, dateStr, mealId, cid, nowMs, n).run();
    if (r.meta && r.meta.changes === 1) return { ok: true, claim_id: cid, expires_at: exp };
  } catch {
    // UNIQUE(checkout_key): a concurrent duplicate of this very checkout won the race.
    const dup = checkoutKey ? await findClaimByKey(env, checkoutKey) : null;
    if (dup) return { ok: false, code: 'duplicate', existing: dup };
    return { ok: false, code: 'error' };
  }
  return { ok: false, code: 'sold_out', remaining: await remainingNow() };
}

export async function attachClaim(env, claimId, { orderId, paymentUrl } = {}) {
  try {
    await env.DB.prepare('UPDATE daily_claims SET order_id = COALESCE(?, order_id), payment_url = ?, updated_at = ? WHERE id = ?')
      .bind(orderId || null, paymentUrl || null, now(), claimId).run();
  } catch { /* the hold still expires on its own */ }
}

/** Give a held claim back (Square failed). Idempotent; never touches a confirmed claim. */
export async function releaseClaim(env, claimId) {
  try {
    // payment_url goes with it: release happens only when Square never gave us a usable link, so
    // there is nothing for the customer to pay and nothing to protect from a later re-claim.
    const r = await env.DB.prepare("UPDATE daily_claims SET status = 'released', payment_url = NULL, updated_at = ? WHERE id = ? AND status = 'held'").bind(now(), claimId).run();
    return !!(r.meta && r.meta.changes === 1);
  } catch { return false; }
}

/**
 * Payment landed (Square webhook): the order's claims become confirmed — including one whose hold
 * had lapsed or been released, because the money moved and the food is owed. If that pushes a date
 * past its allocation, say so: the owner decides whether to make one more or refund.
 */
export async function confirmClaimsForOrder(env, orderId) {
  if (!orderId) return { confirmed: 0, oversold: [] };
  try {
    const r = await env.DB.prepare("UPDATE daily_claims SET status = 'confirmed', updated_at = ? WHERE order_id = ? AND status IN ('held','released')")
      .bind(now(), orderId).run();
    const confirmed = (r.meta && r.meta.changes) || 0;
    const oversold = [];
    if (confirmed) {
      const dates = await env.DB.prepare('SELECT DISTINCT service_date FROM daily_claims WHERE order_id = ?').bind(orderId).all();
      for (const d of (dates && dates.results) || []) {
        const row = await scheduleRow(env, d.service_date);
        const t = await claimTotals(env, d.service_date);
        if (row && t.sold > Number(row.allocation || 0)) oversold.push({ date: d.service_date, sold: t.sold, allocation: Number(row.allocation || 0) });
      }
    }
    return { confirmed, oversold };
  } catch { return { confirmed: 0, oversold: [] }; }
}

// ---------------------------------------------------------------- owner schedule

export async function setDay(env, { date, menu_item_id, allocation, cutoff_time, note, by, nowDate = new Date() } = {}) {
  if (!YMD.test(String(date || ''))) return { ok: false, error: 'Pick a service date.' };
  if (date < etParts(nowDate).dateStr) return { ok: false, error: 'That date has passed.' };
  const s = await loadDailySettings(env);
  const item = await env.DB.prepare('SELECT id, kind, active, price_cents, name FROM menu_items WHERE id = ?').bind(String(menu_item_id || '')).first().catch(() => null);
  if (!item || item.kind !== DAILY_KIND) return { ok: false, error: 'Choose an Añejo Daily meal (a menu item of type "Añejo Daily").' };
  if (!Number(item.active)) return { ok: false, error: `${item.name} is switched off in the menu.` };
  if (!isTierPrice(s, item.price_cents)) return { ok: false, error: `${item.name} is priced at $${(item.price_cents / 100).toFixed(2)}, which is not one of the Daily tiers (${s.tiers.map((c) => '$' + (c / 100).toFixed(2)).join(' / ')}).` };
  const alloc = allocation === '' || allocation == null ? s.default_allocation : Number(allocation);
  if (!Number.isInteger(alloc) || alloc < 0 || alloc > 500) return { ok: false, error: 'Allocation must be a whole number from 0 to 500.' };
  const cut = cutoff_time == null || cutoff_time === '' ? null : String(cutoff_time).trim();
  if (cut && !HHMM.test(cut)) return { ok: false, error: 'Cutoff must be a time like 11:00, or blank for the default.' };

  const existing = await scheduleRow(env, date);
  const t = await claimTotals(env, date);
  const taken = t.sold + t.held;
  if (existing && existing.status === 'active' && existing.menu_item_id !== item.id && taken > 0) {
    return { ok: false, error: `${date} already has ${taken} portion(s) sold or in checkout for ${existing.name}. The dish cannot change after orders — lower the allocation instead, or cancel the day once it has none.` };
  }
  if (alloc < taken) return { ok: false, error: `${taken} portion(s) are already sold or in checkout for ${date}; the allocation cannot go below that.` };
  const ts = now();
  // Wrapped, like every other write on this desk: before migration 0104 is applied there is no
  // daily_schedule table, and an unhandled throw here is a blank 500 with nothing to act on.
  try {
  await env.DB.prepare(
    `INSERT INTO daily_schedule (service_date, menu_item_id, allocation, cutoff_time, status, note, updated_by, created_at, updated_at)
     VALUES (?,?,?,?, 'active', ?,?,?,?)
     ON CONFLICT(service_date) DO UPDATE SET menu_item_id=excluded.menu_item_id, allocation=excluded.allocation,
       cutoff_time=excluded.cutoff_time, status='active', note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(date, item.id, alloc, cut, note ? String(note).slice(0, 200) : null, by || null, ts, ts).run();
  } catch { return { ok: false, error: 'Añejo Daily needs database migration 0104, which has not been applied yet.' }; }
  return { ok: true, date, view: await dayView(env, date, { settings: s, nowDate }) };
}

export async function cancelDay(env, { date, by } = {}) {
  if (!YMD.test(String(date || ''))) return { ok: false, error: 'Pick a service date.' };
  const t = await claimTotals(env, date);
  if (t.sold + t.held > 0) return { ok: false, error: `${date} has ${t.sold + t.held} portion(s) sold or in checkout — it cannot be canceled. Set the allocation to what is sold instead.` };
  try {
    await env.DB.prepare("UPDATE daily_schedule SET status = 'canceled', updated_by = ?, updated_at = ? WHERE service_date = ?").bind(by || null, now(), date).run();
  } catch { return { ok: false, error: 'Añejo Daily needs database migration 0104, which has not been applied yet.' }; }
  return { ok: true, date };
}

/**
 * Release every UNPAID hold on a date — the owner's way out of a day that has been tied up.
 *
 * A held claim counts against the allocation for 30 minutes and blocks both lowering the allocation
 * and cancelling the day. Usually that is right (someone is at the Square page). But abandoned
 * checkouts — or someone hammering the endpoint — can leave a day reading SOLD OUT with nothing
 * sold, and the owner had no way to take it back.
 *
 * CONFIRMED CLAIMS ARE NEVER TOUCHED. This releases holds, which is to say reservations nobody has
 * paid for. If one of those people pays afterwards, the webhook still confirms their portion (a
 * released claim is confirmable) and raises the oversold alert if the day no longer has room.
 */
export async function releaseHolds(env, { date, by } = {}) {
  if (!YMD.test(String(date || ''))) return { ok: false, error: 'Pick a service date.' };
  try {
    const r = await env.DB.prepare(
      "UPDATE daily_claims SET status = 'released', payment_url = NULL, updated_at = ? WHERE service_date = ? AND status = 'held'"
    ).bind(now(), date).run();
    return { ok: true, date, released: (r.meta && r.meta.changes) || 0, by: by || null };
  } catch { return { ok: false, error: 'Could not release those holds.' }; }
}

// ---------------------------------------------------------------- production (kitchen / owner)

/**
 * Demand for one date, grouped by MEAL, without merging any orders:
 *   institutional_committed — headcounts on contract orders already in (paid/prep/ready/fulfilled)
 *   institutional_pending_sites — sites scheduled that day whose count is not in yet (count unknown)
 *   public_sold — paid Añejo Daily portions; public_held — in checkout right now
 *   public_unsold — allocation not yet sold (OPTIONAL buffer — never added to required_now)
 *   required_now — institutional_committed + public_sold
 * Internal only: this names no account to a public surface, and the public Daily endpoint never calls it.
 */
export async function productionFor(env, dateStr, { nowMs = Date.now() } = {}) {
  const groups = new Map();
  const g = (mealId, name) => {
    const key = mealId ? 'm:' + mealId : 'n:' + String(name || 'Contract lunch');
    if (!groups.has(key)) {
      groups.set(key, {
        meal_id: mealId || null, name: name || 'Contract lunch',
        institutional_committed: 0, institutional_sites: 0, institutional_pending_sites: 0,
        public_allocation: 0, public_sold: 0, public_held: 0, public_unsold: 0,
      });
    }
    return groups.get(key);
  };

  // Institutional counts already submitted.
  const sitesWithOrder = new Set();
  try {
    const r = await env.DB.prepare(
      "SELECT items, headcount, contract_site_id FROM orders WHERE delivery_date = ? AND contract_site_id IS NOT NULL AND status NOT IN ('canceled','pending')"
    ).bind(dateStr).all();
    for (const o of (r && r.results) || []) {
      sitesWithOrder.add(o.contract_site_id);
      let items = [];
      try { items = JSON.parse(o.items) || []; } catch { items = []; }
      const line = items[0] || {};
      const row = g(line.meal_id || null, line.name);
      row.institutional_committed += Number(o.headcount) || Number(line.qty) || 0;
      row.institutional_sites += 1;
    }
  } catch { /* no contract data */ }

  // Sites due that weekday whose count is not in yet — the dish is known, the number is not.
  try {
    const dow = ((new Date(dateStr + 'T12:00:00Z').getUTCDay() + 6) % 7);   // 0 = Mon
    const dowKey = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][dow];
    const r = await env.DB.prepare(
      "SELECT s.id, s.delivery_days, a.id AS account_id, a.name AS account_name FROM contract_sites s JOIN contract_accounts a ON a.id = s.account_id WHERE s.active = 1 AND a.status = 'active'"
    ).all();
    for (const s of (r && r.results) || []) {
      if (sitesWithOrder.has(s.id)) continue;
      if (!parseDeliveryDays(s.delivery_days).includes(dowKey)) continue;
      const meal = await resolveContractMeal(env, { id: s.account_id, name: s.account_name }, dateStr);
      g(meal.meal_id, meal.name).institutional_pending_sites += 1;
    }
  } catch { /* no contract data */ }

  // Public Añejo Daily.
  const row = await scheduleRow(env, dateStr);
  if (row && row.status === 'active') {
    const t = await claimTotals(env, dateStr, nowMs);
    const p = g(row.menu_item_id, row.name);
    p.public_allocation = Number(row.allocation) || 0;
    p.public_sold = t.sold;
    p.public_held = t.held;
    p.public_unsold = Math.max(0, p.public_allocation - t.sold - t.held);
  }

  return [...groups.values()].map((x) => ({ ...x, required_now: x.institutional_committed + x.public_sold }));
}
