// POST /api/hub/owner/route-plan  { date?, drivers?, driver_ids? }
//   Owner-only. PREVIEW (no DB writes to routes): groups the date's unassigned payable orders
//   into efficient geographic clusters (one per driver), optimizes each cluster's stop order,
//   and returns per-group stops + driven miles + estimated finish + driver pay. The owner then
//   assigns each group via POST /api/hub/owner/routes. Geocoding of missing coords is persisted
//   (harmless enrichment) so clustering works. Stop previews carry name/window only, no address.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { today } from '../../../_lib/hub.js';
import { geocode, optimizeRoute, formatAddress, stopServiceSeconds, kitchenOrigin, estimateRouteMiles, haversineMiles } from '../../../_lib/geo.js';
import { groupOrders } from '../../../_lib/batch.js';
import { getPayConfig, computeRoutePay } from '../../../_lib/pay.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function departMsFor(routeDate, orders) {
  const lunch = (orders || []).some((o) => (o.delivery_window || '') === 'lunch');
  const ms = Date.parse(routeDate + (lunch ? 'T14:30:00Z' : 'T20:00:00Z'));
  return Number.isFinite(ms) ? ms : Date.now();
}

// Plain-English "why this grouping" for the owner: the zone, how tight the cluster is, and how
// many miles the optimized stop order trims vs the orders' unsorted arrival order.
function buildRationale(cOrders, orderIds, byId, origin) {
  const geo = cOrders.filter((o) => o.delivery_lat != null && o.delivery_lng != null);
  const cities = cOrders.map((o) => (o.delivery_city || '').trim()).filter(Boolean);
  const zone = cities.sort((a, b) => cities.filter((c) => c === b).length - cities.filter((c) => c === a).length)[0] || null;

  if (!geo.length) {
    return { zone, spread_mi: null, saved_mi: null, text: `${cOrders.length} stop(s) without a mapped address — add addresses to include them in routing.` };
  }
  if (cOrders.length === 1) {
    return { zone, spread_mi: 0, saved_mi: 0, text: `Single stop${zone ? ' in ' + zone : ''}.` };
  }

  const centroid = { lat: geo.reduce((a, o) => a + o.delivery_lat, 0) / geo.length, lng: geo.reduce((a, o) => a + o.delivery_lng, 0) / geo.length };
  const spread = Math.round((geo.reduce((a, o) => a + haversineMiles({ lat: o.delivery_lat, lng: o.delivery_lng }, centroid), 0) / geo.length) * 10) / 10;

  let saved = null;
  if (origin) {
    const toPt = (o) => ({ lat: o.delivery_lat, lng: o.delivery_lng });
    const naiveGeo = cOrders.filter((o) => o.delivery_lat != null).map(toPt);
    const optGeo = orderIds.map((id) => byId.get(id)).filter((o) => o && o.delivery_lat != null).map(toPt);
    if (naiveGeo.length === optGeo.length && optGeo.length) {
      saved = Math.round(Math.max(0, estimateRouteMiles(origin, naiveGeo) - estimateRouteMiles(origin, optGeo)) * 10) / 10;
    }
  }

  const zoneTxt = zone ? `${zone} area` : `${cOrders.length}-stop cluster`;
  const tight = `${zoneTxt} — ${cOrders.length} stops within ~${spread} mi of each other`;
  const order = saved == null ? '' : (saved >= 0.3 ? `. Optimized order trims ~${saved} mi vs unsorted` : '. Already in an efficient order');
  return { zone, spread_mi: spread, saved_mi: saved, text: tight + order + '.' };
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b = {};
  try { b = await request.json(); } catch { /* allow empty body */ }
  let date = (b && b.date || '').toString().trim();
  if (!DATE_RE.test(date)) date = today();

  // Unassigned payable orders for the date (mirror of the routes GET).
  let orders = [];
  try {
    const res = await env.DB.prepare(
      'SELECT o.id, o.customer_name, o.delivery_window, o.delivery_street, o.delivery_unit, o.delivery_city, ' +
      'o.delivery_state, o.delivery_zip, o.delivery_lat, o.delivery_lng ' +
      "FROM orders o WHERE o.delivery_date=? AND o.status IN ('pending','paid','prep','ready') " +
      'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ORDER BY o.delivery_window, o.created_at'
    ).bind(date).all();
    orders = (res && res.results) || [];
  } catch { orders = []; }

  if (!orders.length) return json({ ok: true, date, groups: [], unassigned_count: 0, pay_config: await getPayConfig(env) });

  // Available drivers (for the default group count + the assign dropdown).
  let drivers = [];
  try {
    const res = await env.DB.prepare("SELECT id, name, available FROM staff WHERE role='driver' AND active=1 ORDER BY available DESC, name").all();
    drivers = ((res && res.results) || []).map((s) => ({ id: s.id, name: s.name, available: !!s.available }));
  } catch { drivers = []; }

  // How many groups? explicit driver_ids → that many; else `drivers` count; else # available (≥1).
  const explicitIds = Array.isArray(b && b.driver_ids) ? b.driver_ids.map(String).filter(Boolean) : [];
  let G = explicitIds.length || Number(b && b.drivers) || drivers.filter((d) => d.available).length || 1;
  G = Math.max(1, Math.min(Math.round(G), orders.length));

  // Geocode any missing coordinates so clustering + optimization can place them.
  const t = Date.now();
  for (const o of orders) {
    if ((o.delivery_lat == null || o.delivery_lng == null) && o.delivery_street) {
      const g = await geocode(env, formatAddress(o)).catch(() => null);
      if (g) {
        o.delivery_lat = g.lat; o.delivery_lng = g.lng;
        try { await env.DB.prepare('UPDATE orders SET delivery_lat=?, delivery_lng=?, geocoded_at=?, updated_at=? WHERE id=?').bind(g.lat, g.lng, t, t, o.id).run(); } catch { /* best-effort */ }
      }
    }
  }

  const payCfg = await getPayConfig(env);
  const origin = kitchenOrigin(env);
  const clusters = groupOrders(orders.map((o) => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, _o: o })), G);

  const groups = [];
  for (const cluster of clusters) {
    const cOrders = cluster.map((c) => c._o);
    const departAt = departMsFor(date, cOrders);
    const geoStops = cluster.filter((c) => c.lat != null && c.lng != null).map((c) => ({ id: c.id, lat: c.lat, lng: c.lng }));

    let orderIds = cOrders.map((o) => o.id);
    let etaCompleteAt = null, totalMinutes = null, miles = null, optimized = false;

    const opt = geoStops.length === cOrders.length && geoStops.length ? await optimizeRoute(env, geoStops, departAt) : null;
    if (opt && opt.order && opt.order.length === cOrders.length) {
      orderIds = opt.order;
      etaCompleteAt = opt.completeAtMs;
      totalMinutes = Math.round(opt.totalDriveSeconds / 60) + Math.round((stopServiceSeconds(env) * cOrders.length) / 60);
      miles = opt.totalMeters != null ? Math.round((opt.totalMeters / 1609.344) * 10) / 10 : null;
      optimized = true;
    } else {
      const stepMs = 15 * 60 * 1000;
      etaCompleteAt = departAt + cOrders.length * stepMs;
      totalMinutes = cOrders.length * 15;
    }
    if (miles == null && origin && geoStops.length) {
      const ordered = orderIds.map((oid) => geoStops.find((s) => s.id === oid)).filter(Boolean);
      if (ordered.length) miles = estimateRouteMiles(origin, ordered);
    }

    const pay = computeRoutePay(payCfg, { stops: cOrders.length, miles });
    const byId = new Map(cOrders.map((o) => [o.id, o]));
    const stops = orderIds.map((oid, i) => {
      const o = byId.get(oid);
      return { seq: i + 1, order_id: oid, name: (o && o.customer_name) || 'Customer', window: (o && o.delivery_window) || 'delivery', geocoded: !!(o && o.delivery_lat != null) };
    });

    groups.push({
      stop_count: cOrders.length, order_ids: orderIds, optimized,
      miles: pay.miles, total_minutes: totalMinutes, eta_complete_at: etaCompleteAt,
      pay_cents: pay.total_cents, pay_breakdown: pay, stops,
      rationale: buildRationale(cOrders, orderIds, byId, origin),
    });
  }

  // Largest groups first (most impactful to assign).
  groups.sort((a, b2) => b2.stop_count - a.stop_count);

  return json({
    ok: true, date, unassigned_count: orders.length, group_count: groups.length,
    drivers, groups, pay_config: payCfg,
    totals: {
      pay_cents: groups.reduce((s, g) => s + (g.pay_cents || 0), 0),
      miles: Math.round(groups.reduce((s, g) => s + (g.miles || 0), 0) * 10) / 10,
      stops: groups.reduce((s, g) => s + g.stop_count, 0),
    },
  });
};
