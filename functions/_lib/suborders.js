// Turn a meal-plan subscription delivery into a kitchen order row (so the kitchen sees what
// to make for each weekly delivery). Itemizes from the member's saved bowl rotation when we
// have it, else a single "Weekly plan — N bowls" line. Files under _lib are not routed.
import { id, now } from './util.js';
import { kitchenBowlLine } from './bowlspec.js';
import { PLAN_TIERS } from './plans.js';

function parseJson(s, f) { try { return JSON.parse(s); } catch { return f; } }

// Next upcoming Monday (YYYY-MM-DD) — the default weekly meal-prep delivery day.
export function nextWeeklyDeliveryDate(base) {
  const d = new Date(base || Date.now());
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// DAILY fresh-prep model (rolling 7-day). A subscription yields one kitchen order
// per chosen window (lunch/dinner) for each delivery day Mon–Sat it's active, one
// rotating bowl each, scaled to the client's macros. Deterministic order ids make
// the daily tick idempotent. Plans start the upcoming Monday.
// ---------------------------------------------------------------------------

// Default delivery weekdays (Mon–Sat) for legacy subscriptions with no stored tier. Per-tier
// schedules (e.g. 10/5-bowl skip Saturday) come from PLAN_TIERS[sub.tier].days.
const DELIVERY_DOW = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }; // Mon(1)..Sat(6) deliver; Sun(0) off
const WIN_ORDER = { lunch: 0, dinner: 1 };

// YYYY-MM-DD in America/New_York for a ms timestamp (kitchen days are ET).
function etDate(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
// Day-of-week 0=Sun..6=Sat for a YYYY-MM-DD (noon-UTC avoids TZ rollover).
function dowOf(dateStr) { return new Date(dateStr + 'T12:00:00Z').getUTCDay(); }
// Integer day index for a YYYY-MM-DD (UTC midnights), for stable date math.
function dayNum(dateStr) { return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000); }
function addDays(dateStr, n) { return new Date((dayNum(dateStr) + n) * 86400000).toISOString().slice(0, 10); }
// First Monday on or after dateStr (a subscription's "day 1" is the upcoming Monday).
function nextMondayOnOrAfter(dateStr) {
  let d = dateStr;
  for (let i = 0; i < 7; i++) { if (dowOf(d) === 1) return d; d = addDays(d, 1); }
  return dateStr;
}
// Expand a bowl_rotation {NAME: count} into an ordered sequence, INTERLEAVED so the same bowl
// never lands on adjacent slots when avoidable. Because lunch + dinner of a day take adjacent
// slots, this makes the two meals on a day different whenever ≥2 distinct bowls are allowed
// (e.g. {FUEGO:2,LIGERO:4,RAÍZ:6} → RAÍZ/LIGERO, RAÍZ/LIGERO, …, RAÍZ/FUEGO — never RAÍZ/RAÍZ).
// Greedy: each step place the most-plentiful remaining bowl that isn't the one just placed. This
// achieves zero adjacent repeats iff no single bowl exceeds ceil(total/2); otherwise it minimizes
// them (only the over-represented bowl can ever repeat, which is unavoidable).
function rotationSequence(rotationJson) {
  const rot = rotationJson ? parseJson(rotationJson, null) : null;
  if (!rot || typeof rot !== 'object') return [];
  const pool = Object.entries(rot)
    .map(([name, n]) => ({ name, count: Math.max(0, Math.floor(Number(n) || 0)) }))
    .filter((e) => e.count > 0);
  const total = pool.reduce((s, e) => s + e.count, 0);
  const seq = [];
  let prev = null;
  for (let i = 0; i < total; i++) {
    pool.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1)); // most-left first, stable by name
    let pick = pool.find((e) => e.count > 0 && e.name !== prev);
    if (!pick) pick = pool.find((e) => e.count > 0); // only the dominant bowl left → must repeat
    if (!pick) break;
    seq.push(pick.name); pick.count--; prev = pick.name;
  }
  return seq;
}

// Materialize the rolling prep window for one subscription row (already joined to plan+client).
// Returns the number of orders created. Best-effort; never throws.
async function prepOneSubscription(env, sub, plan, client, todayStr, horizonDays) {
  let created = 0;
  const windows = String(sub.windows || 'lunch,dinner').split(',')
    .map((w) => w.trim().toLowerCase()).filter((w) => w === 'lunch' || w === 'dinner')
    .sort((a, b) => WIN_ORDER[a] - WIN_ORDER[b]);
  if (!windows.length) return 0;

  // Delivery weekdays come from the subscription's TIER (12=Mon–Sat, 10/5=Mon–Fri). Falls back
  // to Mon–Sat for legacy rows with no tier stored. windows.length already sets bowls/day.
  const tierCfg = PLAN_TIERS[sub.tier];
  const allowedDow = new Set(tierCfg ? tierCfg.days : Object.keys(DELIVERY_DOW).map(Number));

  const seq = rotationSequence(plan && plan.bowl_rotation);
  const sizeFactor = plan && plan.bowl_size_factor != null ? Number(plan.bowl_size_factor) : 1;
  const avocado = sub.avocado === 1 || sub.avocado === true;

  const startMonday = nextMondayOnOrAfter(etDate(Number(sub.started_at) || Date.now()));
  const rangeStart = dayNum(startMonday) > dayNum(todayStr) ? startMonday : todayStr;
  // Extend the window to the END of its delivery week (Saturday) so we never stop mid-week — a
  // plan_12 (Mon–Sat) materializes all 12 up front instead of 10 when "today" is mid-week.
  let rangeEnd = addDays(todayStr, horizonDays);
  for (let i = 0; i < 7 && dowOf(rangeEnd) !== 6; i++) rangeEnd = addDays(rangeEnd, 1);

  // Client's saved default delivery address (defensive: columns may be absent on older rows).
  const a = {
    street: client && client.delivery_street, unit: client && client.delivery_unit,
    city: client && client.delivery_city, state: client && client.delivery_state,
    zip: client && client.delivery_zip, notes: client && client.delivery_notes,
    lat: client && client.delivery_lat, lng: client && client.delivery_lng,
  };
  const custName = (client && client.name) || sub.customer_name || 'Member';
  const custEmail = (client && client.email) || null;
  const t = now();

  for (let d = rangeStart; dayNum(d) <= dayNum(rangeEnd); d = addDays(d, 1)) {
    const dow = dowOf(d);
    if (!allowedDow.has(dow)) continue;            // off days per tier (Sun always; Sat for 10/5)
    if (dayNum(d) < dayNum(startMonday)) continue; // never before the plan's first Monday
    // Gap-free delivery-day index for the bowl rotation: full weeks × (this tier's delivery
    // days/week) + the day's position within that tier's delivery days. Keeps the rotation
    // even on Mon–Fri tiers (no phantom Saturday slot).
    const dows = tierCfg ? tierCfg.days : Object.keys(DELIVERY_DOW).map(Number);
    const D = Math.floor((dayNum(d) - dayNum(startMonday)) / 7) * dows.length + Math.max(0, dows.indexOf(dow));
    for (const win of windows) {
      const slot = D * windows.length + WIN_ORDER[win];
      const bowlName = seq.length ? seq[slot % seq.length] : null;
      const line = bowlName ? (kitchenBowlLine(bowlName, 1, sizeFactor, avocado)
        || { id: 'bowl_' + String(bowlName).toLowerCase(), name: bowlName + ' Bowl', qty: 1, avocado })
        : { id: 'sub', name: 'Plan bowl', qty: 1, avocado };
      const oid = `osub_${sub.id}_${d}_${win}`; // deterministic ⇒ idempotent
      const res = await env.DB.prepare(
        `INSERT OR IGNORE INTO orders
           (id, square_order_id, subscription_id, items, delivery_date, delivery_window,
            subtotal_cents, fee_cents, tax_pct, total_estimate_cents,
            delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
            delivery_lat, delivery_lng, geocoded_at,
            status, fulfillment_mode, customer_name, customer_email, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'paid','scheduled', ?, ?, ?, ?)`
      ).bind(
        oid, 'sub_' + sub.id, sub.id, JSON.stringify([line]), d, win,
        0, 0, 0, 0,
        a.street || null, a.unit || null, a.city || null, a.state || null, a.zip || null, a.notes || null,
        a.lat != null ? a.lat : null, a.lng != null ? a.lng : null, a.lat != null ? t : null,
        custName, custEmail, t, t
      ).run();
      if (res && res.meta && res.meta.changes) created += res.meta.changes;
    }
  }

  try {
    await env.DB.prepare('UPDATE subscriptions SET prep_through_date = ?, updated_at = ? WHERE id = ?')
      .bind(rangeEnd, t, sub.id).run();
  } catch { /* bookkeeping only */ }
  return created;
}

// Roll the prep window forward for every active subscription (or one, when subscriptionId given).
// Called by the daily cron tick and right after a new subscription starts. Never throws.
export async function materializeSubscriptionPrep(env, { nowMs, horizonDays = 7, subscriptionId = null } = {}) {
  if (!env || !env.DB) return { ok: false, created: 0, subs: 0, reason: 'no_db' };
  const ms = typeof nowMs === 'number' ? nowMs : now();
  const todayStr = etDate(ms);
  let created = 0;
  let count = 0;
  try {
    const where = subscriptionId ? 'WHERE s.id = ?' : "WHERE s.status = 'active'";
    const binds = subscriptionId ? [subscriptionId] : [];
    const { results } = await env.DB.prepare(`SELECT * FROM subscriptions s ${where}`).bind(...binds).all();
    for (const sub of results || []) {
      if (subscriptionId && sub.status !== 'active') continue;
      let plan = null;
      let client = null;
      try { if (sub.plan_id) plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(sub.plan_id).first(); } catch { /* tolerate */ }
      try { if (sub.client_id) client = await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(sub.client_id).first(); } catch { /* tolerate */ }
      try { created += await prepOneSubscription(env, sub, plan, client, todayStr, horizonDays); count++; }
      catch { /* one bad sub must not stop the rest */ }
    }
  } catch (e) {
    return { ok: false, created, subs: count, reason: (e && e.message) || 'error' };
  }
  return { ok: true, created, subs: count, through: addDays(todayStr, horizonDays) };
}

// Create one kitchen order for a subscription delivery. Idempotent when orderId is supplied.
// o: { subscriptionId, orderId?, planBowlRotation?, tierLabel?, bowls?, weeklyCents?,
//      customerName?, customerEmail?, deliveryDate?, deliveryWindow? }
export async function createSubscriptionDelivery(env, o) {
  if (!env || !env.DB || !o || !o.subscriptionId) return null;
  let items;
  const rot = o.planBowlRotation ? parseJson(o.planBowlRotation, null) : null;
  if (rot && typeof rot === 'object') {
    // Itemize WITH each bowl scaled to the client's size factor: per-bowl macros + ingredient list +
    // portion (oz/%) + avocado flag, so the kitchen preps exact weights and we can plan stock.
    items = Object.entries(rot).filter((e) => e[1] > 0)
      .map((e) => kitchenBowlLine(e[0], e[1], o.sizeFactor, o.avocado)
        || { id: 'bowl_' + String(e[0]).toLowerCase(), name: e[0] + ' Bowl', qty: e[1], avocado: !!o.avocado });
  }
  if (!items || !items.length) {
    items = [{ id: 'sub', name: o.tierLabel || ('Weekly plan' + (o.bowls ? ` — ${o.bowls} bowls` : '')), qty: 1, avocado: !!o.avocado }];
  }
  const oid = o.orderId || id('ord');
  const t = now();
  // Delivery address (the subscriber's saved default) so each weekly order is routable.
  const a = o.address || {};
  await env.DB.prepare(
    `INSERT OR IGNORE INTO orders
       (id, square_order_id, payment_link_id, items, delivery_date, delivery_window,
        subtotal_cents, fee_cents, tax_pct, total_estimate_cents,
        delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
        delivery_lat, delivery_lng, geocoded_at,
        status, customer_name, customer_email, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'paid', ?, ?, ?, ?)`
  ).bind(
    oid, 'sub_' + o.subscriptionId, null, JSON.stringify(items),
    o.deliveryDate || nextWeeklyDeliveryDate(), o.deliveryWindow || 'lunch',
    o.weeklyCents || 0, 0, 0, o.weeklyCents || 0,
    a.street || null, a.unit || null, a.city || null, a.state || null, a.zip || null, a.notes || null,
    a.lat != null ? a.lat : null, a.lng != null ? a.lng : null, a.lat != null ? t : null,
    o.customerName || null, o.customerEmail || null, t, t
  ).run();
  return oid;
}
