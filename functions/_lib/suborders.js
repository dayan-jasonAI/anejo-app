// Turn a meal-plan subscription delivery into a kitchen order row (so the kitchen sees what
// to make for each weekly delivery). Itemizes from the member's saved bowl rotation when we
// have it, else a single "Weekly plan — N bowls" line. Files under _lib are not routed.
import { id, now } from './util.js';

function parseJson(s, f) { try { return JSON.parse(s); } catch { return f; } }

// Next upcoming Monday (YYYY-MM-DD) — the default weekly meal-prep delivery day.
export function nextWeeklyDeliveryDate(base) {
  const d = new Date(base || Date.now());
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 1);
  return d.toISOString().slice(0, 10);
}

// Create one kitchen order for a subscription delivery. Idempotent when orderId is supplied.
// o: { subscriptionId, orderId?, planBowlRotation?, tierLabel?, bowls?, weeklyCents?,
//      customerName?, customerEmail?, deliveryDate?, deliveryWindow? }
export async function createSubscriptionDelivery(env, o) {
  if (!env || !env.DB || !o || !o.subscriptionId) return null;
  let items;
  const rot = o.planBowlRotation ? parseJson(o.planBowlRotation, null) : null;
  if (rot && typeof rot === 'object') {
    items = Object.entries(rot).filter((e) => e[1] > 0)
      .map((e) => ({ id: 'bowl_' + String(e[0]).toLowerCase(), name: e[0] + ' Bowl', qty: e[1] }));
  }
  if (!items || !items.length) {
    items = [{ id: 'sub', name: o.tierLabel || ('Weekly plan' + (o.bowls ? ` — ${o.bowls} bowls` : '')), qty: 1 }];
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
