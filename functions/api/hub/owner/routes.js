// /api/hub/owner/routes — owner route assignment.
//   GET  ?date=YYYY-MM-DD (default today)
//        → { drivers, unassigned (orders pending|paid for the date with no route_stops row),
//            routes (existing routes for the date w/ stop counts + driver name) }
//   POST { driver_id, route_date, order_ids:[…], ai_optimized? }
//        → creates a routes row + route_stops seq 1..n, fires route.assigned,
//          SMSes the driver (safe no-op without Twilio creds) and posts an in_app
//          thread message so the route shows up in their HUB inbox.
// Owner-only. Stop labels carry customer name + window — never a street address.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { today } from '../../../_lib/hub.js';
import { formatAddress } from '../../../_lib/geo.js';
import { assignRoute } from '../../../_lib/routing.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  let date = (url.searchParams.get('date') || '').trim();
  if (!DATE_RE.test(date)) date = today();

  let drivers = [];
  try {
    const res = await env.DB
      .prepare("SELECT id, name, phone, team, available, available_at FROM staff WHERE role='driver' AND active=1 ORDER BY available DESC, name")
      .all();
    drivers = ((res && res.results) || []).map((s) => ({ ...s, available: !!s.available }));
  } catch { drivers = []; }

  // Orders for the date that are payable/fulfillable and not yet on any route.
  let unassigned = [];
  try {
    const res = await env.DB
      .prepare(
        "SELECT o.id, o.customer_name, o.items, o.delivery_date, o.delivery_window, o.status, o.fulfillment_mode, o.total_estimate_cents, " +
        'o.delivery_street, o.delivery_unit, o.delivery_city, o.delivery_state, o.delivery_zip, o.delivery_notes, o.delivery_lat, o.delivery_lng ' +
        // Include prep/ready, not just paid — otherwise an order DROPS OUT of the assignable
        // list the moment the kitchen marks it ready (so it could never be dispatched).
        // PAYMENT GATE: 'pending' (unpaid checkout) is excluded — never route an unpaid order.
        "FROM orders o WHERE o.delivery_date=? AND o.status IN ('paid','prep','ready') " +
        'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ' +
        // On-demand orders that are READY need immediate dispatch — float them to the top.
        "ORDER BY (o.fulfillment_mode='on_demand' AND o.status='ready') DESC, o.delivery_window, o.created_at"
      )
      .bind(date)
      .all();
    unassigned = ((res && res.results) || []).map((o) => ({
      ...o,
      address: formatAddress(o) || null,
      geocoded: o.delivery_lat != null && o.delivery_lng != null,
      on_demand: o.fulfillment_mode === 'on_demand',
      needs_dispatch: o.fulfillment_mode === 'on_demand' && o.status === 'ready',
    }));
  } catch { unassigned = []; }

  let routes = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT r.id, r.driver_id, r.route_date, r.stop_count, r.stops_completed, r.stops_failed, r.status, r.offer_status, ' +
        'r.ai_optimized, r.created_at, r.eta_complete_at, r.total_minutes, r.total_miles_est, r.pay_cents, st.name AS driver_name, ' +
        '(SELECT COUNT(*) FROM route_stops rs WHERE rs.route_id = r.id) AS stops ' +
        'FROM routes r LEFT JOIN staff st ON st.id = r.driver_id WHERE r.route_date=? ORDER BY r.created_at ASC'
      )
      .bind(date)
      .all();
    routes = (res && res.results) || [];
  } catch { routes = []; }

  return json({ ok: true, date, drivers, unassigned, routes });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const driverId = (b && b.driver_id || '').toString().trim();
  let routeDate = (b && b.route_date || '').toString().trim();
  const orderIds = Array.isArray(b && b.order_ids) ? b.order_ids.map(String).filter(Boolean) : [];
  const aiOptimized = !!(b && b.ai_optimized);
  if (!driverId) return bad('Pick a driver.');
  if (!DATE_RE.test(routeDate)) routeDate = today();
  if (!orderIds.length) return bad('Pick at least one order.');
  if (orderIds.length > 50) return bad('Too many stops for one route.');

  const driver = await env.DB
    .prepare("SELECT id, name, phone, team, role FROM staff WHERE id=? AND role='driver' AND active=1")
    .bind(driverId)
    .first();
  if (!driver) return bad('That driver was not found or is inactive.', 404);

  const placeholders = orderIds.map(() => '?').join(',');
  const ordRes = await env.DB
    .prepare(
      'SELECT id, customer_name, delivery_window, status, delivery_street, delivery_unit, delivery_city, ' +
      'delivery_state, delivery_zip, delivery_notes, delivery_lat, delivery_lng FROM orders WHERE id IN (' + placeholders + ')'
    )
    .bind(...orderIds)
    .all();
  const orders = (ordRes && ordRes.results) || [];
  if (orders.length !== orderIds.length) return bad('One or more orders were not found.', 404);

  // Reject orders already on a route.
  const takenRes = await env.DB
    .prepare(`SELECT DISTINCT order_id FROM route_stops WHERE order_id IN (${placeholders})`)
    .bind(...orderIds)
    .all();
  const taken = ((takenRes && takenRes.results) || []).map((r) => r.order_id);
  if (taken.length) return bad('Some orders are already on a route.', 409);

  // Hand off to the shared route-creation core (geocode → optimize → miles → pay → insert →
  // stops → offer). Same logic as before; also used by automated dispatch (_lib/autodispatch).
  const r = await assignRoute(env, { orders, orderIds, routeDate, driverId, driver, aiOptimized, ctx });
  if (!r.ok) return bad(r.error || 'Could not assign the route.', 500);
  return json(r);
};
