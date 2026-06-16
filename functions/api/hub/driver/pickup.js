// Pickup confirmation — the kitchen → driver hand-off gate (Phase 3). The driver re-confirms
// every bowl the kitchen prepped (the order_bowls rows) before the route departs; an order
// can't go out for delivery until all its bowls are driver-confirmed. The driver taps each
// bowl, then enters their PIN ONCE per order to confirm — attributed to that driver + audited.
//   GET  /api/hub/driver/pickup → active route + each stop's bowl checklist (prep + confirm state)
//   POST /api/hub/driver/pickup { stop_id, pin, confirmed:[bowl_id...], missing?:[bowl_id...] }
//        → marks those bowls driver-confirmed; stop→'picked' when all are; a missing bowl alerts.
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, today, parseJson } from '../../../_lib/hub.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { ensureOrderBowls, fetchOrderBowls } from '../../../_lib/orderbowls.js';
import { matchStaffByPin } from '../../../_lib/pinmatch.js';
import { limitOr429 } from '../../../_lib/ratelimit.js';

const PAST_PICKUP = ['picked', 'en_route', 'arriving', 'delivered', 'done', 'failed'];

async function activeRoute(env, driverId) {
  return env.DB.prepare(
    "SELECT * FROM routes WHERE driver_id=? AND route_date=? AND status IN ('assigned','started') ORDER BY CASE status WHEN 'started' THEN 0 ELSE 1 END, created_at DESC LIMIT 1"
  ).bind(driverId, today()).first();
}

// Compact per-bowl shape for the driver checklist (name, size, who prepped, confirm state).
function bowlView(bw) {
  const c = bw.customization || {};
  return {
    id: bw.id,
    name: bw.bowl_name || 'Bowl',
    size_oz: c.size_oz || null,
    avocado: !!c.avocado,
    prepped: bw.prep_state === 'done',
    prepped_by: bw.prep_by_name || null,
    confirmed: !!bw.driver_confirmed_by,
  };
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  const route = await activeRoute(env, staff.id);
  if (!route) return json({ route: null, stops: [] });

  const { results } = await env.DB.prepare(
    `SELECT rs.id AS stop_id, rs.seq, rs.status, o.id AS order_id, o.customer_name, o.items
       FROM route_stops rs JOIN orders o ON o.id = rs.order_id
      WHERE rs.route_id=? ORDER BY rs.seq ASC, rs.created_at ASC`
  ).bind(route.id).all();

  const stops = [];
  for (const s of results || []) {
    // Materialize the per-bowl rows if this order never went through the kitchen prep flow,
    // so the driver always has bowls to confirm against.
    await ensureOrderBowls(env, { id: s.order_id, items: s.items });
    const bowls = (await fetchOrderBowls(env, s.order_id)).map(bowlView);
    const allConfirmed = bowls.length > 0 && bowls.every((bw) => bw.confirmed);
    stops.push({
      stop_id: s.stop_id, seq: s.seq, status: s.status,
      first_name: (s.customer_name || '').split(' ')[0] || 'Order',
      bowls, total_bowls: bowls.length,
      picked: PAST_PICKUP.indexOf(s.status) !== -1 || allConfirmed,
    });
  }

  const allPicked = stops.length > 0 && stops.every((s) => s.picked);
  return json({ route: { id: route.id, status: route.status }, stops, all_picked: allPicked });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const stopId = (b && b.stop_id || '').toString().trim();
  if (!stopId) return bad('Missing stop_id.');

  const route = await activeRoute(env, staff.id);
  if (!route) return bad('No active route.', 404);

  const stop = await env.DB.prepare(
    'SELECT rs.*, o.id AS order_id, o.customer_name FROM route_stops rs JOIN orders o ON o.id=rs.order_id WHERE rs.id=? AND rs.route_id=?'
  ).bind(stopId, route.id).first();
  if (!stop) return bad('Stop not found on your route.', 404);

  // Driver PIN (one per order). Rate-limited against guessing; matched to a driver/owner staff row.
  const limited = await limitOr429(env, request, { name: 'pickup-pin', limit: 20, windowSec: 60 });
  if (limited) return limited;
  const driver = await matchStaffByPin(env, (b && b.pin || '').toString(), { roles: ['driver', 'owner'] });
  if (!driver) return bad('PIN not recognized.', 401);

  const confirmed = Array.isArray(b && b.confirmed) ? b.confirmed.map(String) : [];
  const missing = Array.isArray(b && b.missing) ? b.missing.map(String) : [];
  const ts = now();

  // Confirm the selected bowls (only those belonging to THIS order).
  const bowls = await fetchOrderBowls(env, stop.order_id);
  const validIds = new Set(bowls.map((bw) => bw.id));
  let confirmedCount = 0;
  for (const bid of confirmed) {
    if (!validIds.has(bid)) continue;
    await env.DB.prepare('UPDATE order_bowls SET driver_confirmed_by=?, driver_confirmed_at=?, updated_at=? WHERE id=?')
      .bind(driver.id, ts, ts, bid).run();
    confirmedCount++;
  }

  // Re-read to decide if the whole order is confirmed now.
  const after = await fetchOrderBowls(env, stop.order_id);
  const allConfirmed = after.length > 0 && after.every((bw) => !!bw.driver_confirmed_by);
  const hasMissing = missing.length > 0;

  if (allConfirmed && !hasMissing) {
    await env.DB.prepare("UPDATE route_stops SET status='picked', picked_at=?, updated_at=? WHERE id=? AND status NOT IN ('en_route','arriving','delivered','done','failed')")
      .bind(ts, ts, stopId).run();
  }

  // Audit the driver confirmation (one row per order confirm).
  try {
    await env.DB.prepare(
      'INSERT INTO kitchen_audit (id, action, order_id, bowl_id, staff_id, staff_name, via_pin, created_at) VALUES (?,?,?,?,?,?,1,?)'
    ).bind(id('kau'), 'driver_confirm', stop.order_id, null, driver.id, driver.name || null, ts).run();
  } catch { /* audit best-effort */ }

  if (hasMissing) {
    const who = (stop.customer_name || '').split(' ')[0] || 'an order';
    await raiseAlert(env, {
      alert_type: 'delivery_failed', severity: 'high',
      title: `Missing bowl(s) at pickup — ${who}`,
      body: `Driver flagged ${missing.length} missing/short bowl(s) loading ${who}'s order (stop ${stop.seq}). Kitchen should reconcile before the route leaves.`,
      ref_type: 'order', ref_id: stop.order_id,
    }).catch(() => {});
  }

  await capture(env, {
    event: 'delivery.picked', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { route_id: route.id, stop_id: stopId, confirmed: confirmedCount, total: after.length, flagged: hasMissing, via_pin: true },
  });

  const left = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM route_stops rs WHERE rs.route_id=? AND rs.status NOT IN ('picked','en_route','arriving','delivered','done','failed')"
  ).bind(route.id).first();

  return json({ ok: true, stop_id: stopId, confirmed: confirmedCount, total: after.length, complete: allConfirmed && !hasMissing, all_picked: (left && left.n === 0), by: driver.name });
};
