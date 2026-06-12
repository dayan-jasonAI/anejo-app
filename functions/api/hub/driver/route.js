// GET  /api/hub/driver/route       — today's assigned route + ordered stops for the driver.
// POST /api/hub/driver/route       — { action:'start'|'complete' } to mark the route started/completed.
//   start    → routes.status='started', started_at set; fires route.started
//   complete → routes.status='completed', completed_at + totals; fires route.completed
// Guarded for driver/owner. Labels only — never a public street address in code.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, today, parseJson } from '../../../_lib/hub.js';
import { notifyRouteOutForDelivery } from '../../../_lib/notify.js';
import { formatAddress, directionsUrl, fullRouteUrl, clockET } from '../../../_lib/geo.js';

// Find the driver's most relevant route for today (started first, else assigned).
async function todaysRoute(env, driverId) {
  const date = today();
  return env.DB
    .prepare(
      "SELECT * FROM routes WHERE driver_id=? AND route_date=? AND status IN ('assigned','started') ORDER BY CASE status WHEN 'started' THEN 0 ELSE 1 END, created_at DESC LIMIT 1"
    )
    .bind(driverId, date)
    .first();
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  const route = await todaysRoute(env, staff.id);
  if (!route) return json({ route: null, stops: [] });

  // Join each stop to its order so the driver app has the name, bowls, address, and live ETA.
  const { results } = await env.DB
    .prepare(
      `SELECT rs.id AS stop_id, rs.seq, rs.status, rs.eta_at, rs.picked_count,
              rs.nav_started_at, rs.arriving_at, rs.delivered_at,
              o.id AS order_id, o.customer_name, o.items,
              o.delivery_street, o.delivery_unit, o.delivery_city, o.delivery_state, o.delivery_zip,
              o.delivery_notes, o.delivery_lat, o.delivery_lng
         FROM route_stops rs JOIN orders o ON o.id = rs.order_id
        WHERE rs.route_id=? ORDER BY rs.seq ASC, rs.created_at ASC`
    )
    .bind(route.id)
    .all();

  const stops = (results || []).map((s) => {
    const items = parseJson(s.items, []) || [];
    const addrLine = formatAddress(s);
    const hasGeo = Number.isFinite(s.delivery_lat) && Number.isFinite(s.delivery_lng);
    return {
      stop_id: s.stop_id, seq: s.seq, status: s.status, order_id: s.order_id,
      first_name: (s.customer_name || '').split(' ')[0] || 'Order',
      items,
      total_bowls: items.reduce((n, it) => n + (Number(it && it.qty) || 1), 0),
      address: addrLine,
      delivery_notes: s.delivery_notes || null,
      eta_at: s.eta_at || null,
      eta_clock: s.eta_at ? clockET(s.eta_at) : null,
      directions_url: hasGeo ? directionsUrl({ lat: s.delivery_lat, lng: s.delivery_lng }) : directionsUrl(addrLine),
      nav_started_at: s.nav_started_at || null,
      arriving_at: s.arriving_at || null,
      delivered_at: s.delivered_at || null,
    };
  });

  const full_route_url = fullRouteUrl(
    stops.filter((s) => s.status !== 'done' && s.status !== 'failed')
      .map((s) => ({ lat: (results.find((r) => r.stop_id === s.stop_id) || {}).delivery_lat, lng: (results.find((r) => r.stop_id === s.stop_id) || {}).delivery_lng, street: s.address }))
  );

  return json({ route: { ...route, current_seq: route.current_seq || 0 }, stops, full_route_url });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const action = (b && b.action || '').toString();
  if (!['start', 'complete'].includes(action)) return bad('action must be start or complete.');

  const route = b && b.route_id
    ? await env.DB.prepare('SELECT * FROM routes WHERE id=? AND driver_id=?').bind(b.route_id, staff.id).first()
    : await todaysRoute(env, staff.id);
  if (!route) return bad('No route found for today.', 404);

  const ts = now();

  if (action === 'start') {
    await env.DB
      .prepare("UPDATE routes SET status='started', started_at=?, updated_at=? WHERE id=?")
      .bind(ts, ts, route.id)
      .run();
    await capture(env, {
      event: 'route.started',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { route_id: route.id, platform: 'pwa' },
    });
    // NOTE: per-stop notifications — each customer is texted "on the way" when the driver taps
    // Navigate to THEIR stop (see /api/hub/driver/stop). We intentionally do NOT broadcast to the
    // whole route on start, so the last stop isn't told "on the way" hours early.
    return json({ ok: true, route: { id: route.id, status: 'started', started_at: ts } });
  }

  // complete — recompute stop tallies from route_stops so the numbers are authoritative.
  const tally = await env.DB
    .prepare(
      "SELECT SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM route_stops WHERE route_id=?"
    )
    .bind(route.id)
    .first();
  const stopsCompleted = (tally && tally.done) || 0;
  const stopsFailed = (tally && tally.failed) || 0;
  const totalMinutes = route.started_at ? Math.max(0, Math.round((ts - route.started_at) / 60000)) : null;

  await env.DB
    .prepare("UPDATE routes SET status='completed', completed_at=?, stops_completed=?, stops_failed=?, total_minutes=?, updated_at=? WHERE id=?")
    .bind(ts, stopsCompleted, stopsFailed, totalMinutes, ts, route.id)
    .run();

  await capture(env, {
    event: 'route.completed',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { stops_completed: stopsCompleted, stops_failed: stopsFailed, total_minutes: totalMinutes, route_id: route.id, platform: 'pwa' },
  });

  return json({ ok: true, route: { id: route.id, status: 'completed', stops_completed: stopsCompleted, stops_failed: stopsFailed, total_minutes: totalMinutes } });
};
