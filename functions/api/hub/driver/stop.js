// POST /api/hub/driver/stop — per-stop driver actions during an active route.
//   { stop_id, action:'nav_start' } → driver tapped Navigate to this stop:
//       marks the stop en_route, advances the route's current_seq, computes the live ETA,
//       and texts THIS customer "your order is on the way" (+ estimated arrival).
//   { stop_id, action:'arriving' }  → manual "Arriving soon": texts the customer the
//       ~10-min heads-up (the GPS auto-trigger in /location does this automatically too).
// Guarded for driver/owner. Each notice is consent-gated + no-op safe.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, today } from '../../../_lib/hub.js';
import { etaSeconds, clockET, kitchenOrigin } from '../../../_lib/geo.js';
import { notifyOnTheWay, notifyArrivingSoon } from '../../../_lib/notify.js';

async function activeRoute(env, driverId) {
  return env.DB.prepare(
    "SELECT * FROM routes WHERE driver_id=? AND route_date=? AND status IN ('assigned','started') ORDER BY CASE status WHEN 'started' THEN 0 ELSE 1 END, created_at DESC LIMIT 1"
  ).bind(driverId, today()).first();
}

// Where the driver currently is: last GPS fix on the route if fresh (<5 min), else the kitchen.
function fromPoint(env, route) {
  if (route && Number.isFinite(route.driver_lat) && route.driver_loc_at && (Date.now() - route.driver_loc_at < 5 * 60000)) {
    return { lat: route.driver_lat, lng: route.driver_lng };
  }
  return kitchenOrigin(env);
}

export const onRequestPost = async ({ request, env, waitUntil }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  // Run customer notification + analytics off the response path (waitUntil) so a slow/failing
  // Twilio/Resend/PostHog call never freezes the driver app. Same fix as delivery/complete.
  const defer = (fn) => { const p = (async () => { try { await fn(); } catch { /* best-effort */ } })(); if (typeof waitUntil === 'function') waitUntil(p); return p; };

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const stopId = (b && b.stop_id || '').toString().trim();
  const action = (b && b.action || '').toString();
  if (!stopId) return bad('Missing stop_id.');
  if (!['nav_start', 'arriving'].includes(action)) return bad('action must be nav_start or arriving.');

  const route = await activeRoute(env, staff.id);
  if (!route) return bad('No active route.', 404);

  const stop = await env.DB.prepare(
    'SELECT rs.*, o.* , rs.id AS stop_id FROM route_stops rs JOIN orders o ON o.id=rs.order_id WHERE rs.id=? AND rs.route_id=?'
  ).bind(stopId, route.id).first();
  if (!stop) return bad('Stop not found on your route.', 404);

  const ts = now();
  const order = stop;   // joined row carries all order columns

  // Live ETA from the driver's position (or kitchen) to this stop.
  let etaMin = null, etaClock = null, etaAtMs = null;
  const to = (Number.isFinite(order.delivery_lat) && Number.isFinite(order.delivery_lng))
    ? { lat: order.delivery_lat, lng: order.delivery_lng } : null;
  if (to) {
    const secs = await etaSeconds(env, fromPoint(env, route), to).catch(() => null);
    if (secs != null) { etaMin = Math.max(1, Math.round(secs / 60)); etaAtMs = ts + secs * 1000; etaClock = clockET(etaAtMs); }
  }

  if (action === 'nav_start') {
    await env.DB.prepare(
      "UPDATE route_stops SET status='en_route', nav_started_at=?, on_the_way_at=?, eta_at=?, updated_at=? WHERE id=?"
    ).bind(ts, ts, etaAtMs, ts, stopId).run();
    await env.DB.prepare('UPDATE routes SET current_seq=?, updated_at=? WHERE id=?').bind(stop.seq, ts, route.id).run().catch(() => {});

    defer(async () => {
      await notifyOnTheWay(env, order, etaClock);
      await capture(env, {
        event: 'delivery.en_route', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
        properties: { route_id: route.id, stop_id: stopId, eta_min: etaMin },
      });
    });
    return json({ ok: true, stop_id: stopId, status: 'en_route', eta_min: etaMin, eta_clock: etaClock });
  }

  // arriving — manual ~10-min heads-up
  await env.DB.prepare("UPDATE route_stops SET status='arriving', arriving_at=?, eta_at=?, updated_at=? WHERE id=?")
    .bind(ts, etaAtMs, ts, stopId).run();
  defer(async () => {
    await notifyArrivingSoon(env, order, etaMin ? `${etaMin} minutes` : null);
    await capture(env, {
      event: 'delivery.arriving', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { route_id: route.id, stop_id: stopId, eta_min: etaMin, trigger: 'manual' },
    });
  });
  return json({ ok: true, stop_id: stopId, status: 'arriving', eta_min: etaMin });
};
