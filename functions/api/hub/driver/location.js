// POST /api/hub/driver/location — the driver app posts its GPS fix while a route is active.
// Body: { lat, lng, acc? }. Stores the position on the route, recomputes the ETA to the current
// en-route stop, and AUTO-FIRES the "arriving soon" text once when the ETA drops under the
// threshold (default 13 min). Foreground-only on the device; the manual "Arriving soon" button
// (/stop action:'arriving') is the backup. Consent-gated + no-op safe.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { now, today } from '../../../_lib/hub.js';
import { etaSeconds, clockET } from '../../../_lib/geo.js';
import { notifyArrivingSoon } from '../../../_lib/notify.js';

async function activeRoute(env, driverId) {
  return env.DB.prepare(
    "SELECT * FROM routes WHERE driver_id=? AND route_date=? AND status='started' ORDER BY created_at DESC LIMIT 1"
  ).bind(driverId, today()).first();
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const lat = Number(b && b.lat), lng = Number(b && b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad('Missing lat/lng.');

  const route = await activeRoute(env, staff.id);
  if (!route) return json({ ok: true, route: null });   // nothing in progress; just accept

  const ts = now();
  await env.DB.prepare('UPDATE routes SET driver_lat=?, driver_lng=?, driver_loc_at=?, updated_at=? WHERE id=?')
    .bind(lat, lng, ts, ts, route.id).run();

  // The stop we're currently driving to: en_route, with coordinates, not yet "arriving".
  const stop = await env.DB.prepare(
    "SELECT rs.id AS stop_id, rs.seq, rs.arriving_at, o.* FROM route_stops rs JOIN orders o ON o.id=rs.order_id " +
    "WHERE rs.route_id=? AND rs.status='en_route' ORDER BY rs.seq ASC LIMIT 1"
  ).bind(route.id).first();

  if (!stop || !Number.isFinite(stop.delivery_lat) || !Number.isFinite(stop.delivery_lng)) {
    return json({ ok: true, eta_min: null });
  }

  const secs = await etaSeconds(env, { lat, lng }, { lat: stop.delivery_lat, lng: stop.delivery_lng }).catch(() => null);
  if (secs == null) return json({ ok: true, eta_min: null });
  const etaMin = Math.max(1, Math.round(secs / 60));
  const etaAtMs = ts + secs * 1000;
  await env.DB.prepare('UPDATE route_stops SET eta_at=?, updated_at=? WHERE id=?').bind(etaAtMs, ts, stop.stop_id).run();

  // Auto "arriving soon" — once, when we cross the threshold and haven't already sent it.
  const threshold = Number(env.DELIVERY_ARRIVING_MIN) || 13;
  let fired = false;
  if (etaMin <= threshold && !stop.arriving_at) {
    await env.DB.prepare("UPDATE route_stops SET status='arriving', arriving_at=?, updated_at=? WHERE id=?")
      .bind(ts, ts, stop.stop_id).run();
    await notifyArrivingSoon(env, stop, `${etaMin} minutes`);
    fired = true;
  }

  return json({ ok: true, eta_min: etaMin, eta_clock: clockET(etaAtMs), arriving_sent: fired });
};
