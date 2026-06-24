// Shared route-creation core used by BOTH manual assignment (owner/routes POST) and automated
// dispatch (_lib/autodispatch). Given a set of order rows + the desired order, it geocodes any
// missing coords, optimizes the stop order, computes ETAs + driven miles + driver pay, writes the
// route + stops, then OFFERS the route — to a specific driver (manual) or, when driverId is null,
// to the best available driver via the auto-roll dispatcher. Files under _lib are NOT routed.
import { id, now } from './util.js';
import { bit } from './hub.js';
import { capture } from './track.js';
import { sendOffer, offerToNext } from './dispatch.js';
import { geocode, optimizeRoute, formatAddress, stopServiceSeconds, kitchenOrigin, estimateRouteMiles } from './geo.js';
import { getPayConfig, computeRoutePay } from './pay.js';

// Planned departure (ms epoch) for a window — leave ~30 min before it opens so the first drop
// lands at the start of the window. Windows (temporary): lunch 11 AM–1 PM, dinner 5–7 PM ET.
// lunch → 10:30 AM ET (14:30Z EDT); dinner → 4:30 PM ET (20:30Z EDT).
export function departForWindow(routeDate, window) {
  const ms = Date.parse(routeDate + (window === 'lunch' ? 'T14:30:00Z' : 'T20:30:00Z'));
  return Number.isFinite(ms) ? ms : Date.now();
}
export function departMsFor(routeDate, orders) {
  const lunch = (orders || []).some((o) => (o.delivery_window || '') === 'lunch');
  const ms = departForWindow(routeDate, lunch ? 'lunch' : 'dinner');
  return Number.isFinite(ms) ? ms : Date.now();
}

// Create + offer a route. orders: full order rows (coords may be filled in here). orderIds: the
// desired stop order (optimizer may reorder). driverId null → auto-offer to next available driver.
// Returns a summary { ok, id, stop_count, optimized, eta_complete_at, total_minutes, miles,
// pay_cents, pay_breakdown, offer_status, offer_sent, offered_to }.
export async function assignRoute(env, { orders, orderIds, routeDate, driverId = null, driver = null, aiOptimized = false, auto = false, ctx = null } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  orderIds = (orderIds && orderIds.length ? orderIds : (orders || []).map((o) => o.id)).map(String);
  if (!orderIds.length) return { ok: false, error: 'No orders to route.' };

  const t = now();
  const routeId = id('route');
  const byId = new Map((orders || []).map((o) => [o.id, o]));

  // Geocode any orders that still lack coordinates (best-effort; no-ops without a maps key).
  for (const o of (orders || [])) {
    if ((o.delivery_lat == null || o.delivery_lng == null) && o.delivery_street) {
      const g = await geocode(env, formatAddress(o)).catch(() => null);
      if (g) {
        o.delivery_lat = g.lat; o.delivery_lng = g.lng;
        try { await env.DB.prepare('UPDATE orders SET delivery_lat=?, delivery_lng=?, geocoded_at=?, updated_at=? WHERE id=?').bind(g.lat, g.lng, t, t, o.id).run(); } catch { /* best-effort */ }
      }
    }
  }

  const departAt = departMsFor(routeDate, orders);
  const geoStops = orderIds.map((oid) => byId.get(oid)).filter((o) => o && o.delivery_lat != null && o.delivery_lng != null).map((o) => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng }));

  let seqIds = orderIds.slice();
  const etaById = {};
  let optimized = false, etaCompleteAt = null, totalMinutes = null, totalMeters = null;

  const opt = geoStops.length === orderIds.length ? await optimizeRoute(env, geoStops, departAt) : null;
  if (opt && opt.order && opt.order.length === orderIds.length) {
    seqIds = opt.order;
    Object.assign(etaById, opt.arrivalMs);
    etaCompleteAt = opt.completeAtMs;
    totalMinutes = Math.round(opt.totalDriveSeconds / 60) + Math.round((stopServiceSeconds(env) * orderIds.length) / 60);
    totalMeters = opt.totalMeters || null;
    optimized = true;
  } else {
    const stepMs = 15 * 60 * 1000;
    seqIds.forEach((oid, i) => { etaById[oid] = departAt + (i + 1) * stepMs; });
    etaCompleteAt = departAt + seqIds.length * stepMs;
    totalMinutes = seqIds.length * 15;
  }

  let miles = totalMeters != null ? Math.round((totalMeters / 1609.344) * 10) / 10 : null;
  if (miles == null) {
    const orderedGeo = seqIds.map((oid) => byId.get(oid)).filter((o) => o && o.delivery_lat != null && o.delivery_lng != null).map((o) => ({ lat: o.delivery_lat, lng: o.delivery_lng }));
    const origin = kitchenOrigin(env);
    if (origin && orderedGeo.length) miles = estimateRouteMiles(origin, orderedGeo);
  }

  const pay = computeRoutePay(await getPayConfig(env), { stops: orderIds.length, miles });
  const milesEst = pay.miles;

  await env.DB.prepare(
    'INSERT INTO routes (id, driver_id, route_date, stop_count, ai_optimized, status, depart_at, eta_complete_at, total_minutes, total_meters, total_miles_est, pay_cents, created_at, updated_at) ' +
    "VALUES (?,?,?,?,?,'assigned',?,?,?,?,?,?,?,?)"
  ).bind(routeId, driverId, routeDate, orderIds.length, bit(aiOptimized || optimized), departAt, etaCompleteAt, totalMinutes, totalMeters, milesEst, pay.total_cents, t, t).run();

  const stmt = env.DB.prepare(
    "INSERT INTO route_stops (id, route_id, order_id, seq, label, address, geo, eta_at, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'pending',?,?)"
  );
  await env.DB.batch(seqIds.map((oid, i) => {
    const o = byId.get(oid);
    const label = `${(o && o.customer_name) || 'Customer'} — ${(o && o.delivery_window) || 'delivery'}`;
    const geo = (o && o.delivery_lat != null && o.delivery_lng != null) ? JSON.stringify({ lat: o.delivery_lat, lng: o.delivery_lng }) : null;
    return stmt.bind(id('stop'), routeId, oid, i + 1, label, formatAddress(o) || null, geo, etaById[oid] || null, t, t);
  }));

  if (ctx) {
    try { await capture(env, { event: 'route.assigned', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team, properties: { route_id: routeId, driver_id: driverId, stop_count: orderIds.length, ai_optimized: aiOptimized, auto } }); } catch { /* best-effort */ }
  }

  // Offer it. Manual → the chosen driver; auto → the dispatcher picks the next available driver
  // (and marks 'unfilled' + alerts the owner if none accept). Never fails the assignment.
  let offer = { ok: false };
  const routeForOffer = { id: routeId, stop_count: orderIds.length, route_date: routeDate, pay_cents: pay.total_cents, eta_complete_at: etaCompleteAt, total_miles_est: milesEst };
  try {
    if (driverId) {
      let drv = driver;
      if (!drv) drv = await env.DB.prepare("SELECT id, name, phone FROM staff WHERE id=? AND role='driver' AND active=1").bind(driverId).first().catch(() => null);
      if (drv) offer = await sendOffer(env, routeForOffer, drv);
      else offer = await offerToNext(env, routeId);
    } else {
      offer = await offerToNext(env, routeId);
    }
  } catch { /* offer best-effort */ }

  return {
    ok: true, id: routeId, stop_count: orderIds.length, optimized,
    eta_complete_at: etaCompleteAt, total_minutes: totalMinutes, miles: milesEst,
    pay_cents: pay.total_cents, pay_breakdown: pay,
    offer_status: offer && offer.unfilled ? 'unfilled' : 'pending',
    offer_sent: !!(offer && (offer.ok || offer.offered_to)),
    offered_to: (offer && offer.offered_to) || driverId || null,
  };
}
