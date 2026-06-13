// Pickup checkoff — the kitchen → driver hand-off gate. The driver checks off every bowl as
// they load it, per order, BEFORE the route departs. This is the final confirmation that the
// bowls were actually made and left the kitchen.
//   GET  /api/hub/driver/pickup  → active route + each stop's bowl checklist + current pickup state
//   POST /api/hub/driver/pickup  { stop_id, picked:{itemId:qty}, flag?:{itemId:shortQty} }
//        → saves pickup state on the stop; status→'picked' when all bowls accounted for;
//          a short/missing bowl raises an owner alert.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, today, parseJson, toJson } from '../../../_lib/hub.js';
import { raiseAlert } from '../../../_lib/alerts.js';

async function activeRoute(env, driverId) {
  return env.DB.prepare(
    "SELECT * FROM routes WHERE driver_id=? AND route_date=? AND status IN ('assigned','started') ORDER BY CASE status WHEN 'started' THEN 0 ELSE 1 END, created_at DESC LIMIT 1"
  ).bind(driverId, today()).first();
}

// Sum the bowls/items on an order (qty across line items).
function orderTotal(itemsJson) {
  const items = parseJson(itemsJson, []) || [];
  if (!Array.isArray(items)) return 0;
  return items.reduce((n, it) => n + (Number(it && it.qty) || 1), 0);
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
    `SELECT rs.id AS stop_id, rs.seq, rs.status, rs.pickup_state, rs.picked_count, rs.picked_total,
            o.id AS order_id, o.customer_name, o.items
       FROM route_stops rs JOIN orders o ON o.id = rs.order_id
      WHERE rs.route_id=? ORDER BY rs.seq ASC, rs.created_at ASC`
  ).bind(route.id).all();

  // A stop is "past the pickup gate" once it's been picked OR has moved further down the
  // delivery lifecycle. Without the lifecycle statuses here, delivering a stop (status→'done')
  // would flip it back to "not picked" and bounce the driver to the pickup gate mid-route.
  // Mirrors the POST handler's all-picked query.
  const PAST_PICKUP = ['picked', 'en_route', 'arriving', 'delivered', 'done', 'failed'];
  const stops = (results || []).map((s) => ({
    stop_id: s.stop_id,
    seq: s.seq,
    status: s.status,
    first_name: (s.customer_name || '').split(' ')[0] || 'Order',
    items: parseJson(s.items, []) || [],
    total_bowls: orderTotal(s.items),
    pickup_state: parseJson(s.pickup_state, {}) || {},
    picked_count: s.picked_count || 0,
    picked: PAST_PICKUP.indexOf(s.status) !== -1 || (s.picked_count || 0) >= orderTotal(s.items),
  }));

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
    'SELECT rs.*, o.items, o.customer_name FROM route_stops rs JOIN orders o ON o.id=rs.order_id WHERE rs.id=? AND rs.route_id=?'
  ).bind(stopId, route.id).first();
  if (!stop) return bad('Stop not found on your route.', 404);

  const picked = (b && b.picked && typeof b.picked === 'object') ? b.picked : {};
  const flag = (b && b.flag && typeof b.flag === 'object') ? b.flag : null;

  const total = orderTotal(stop.items);
  let pickedCount = 0;
  for (const k of Object.keys(picked)) pickedCount += Math.max(0, Number(picked[k]) || 0);
  pickedCount = Math.min(pickedCount, total);

  const hasFlag = flag && Object.keys(flag).some((k) => (Number(flag[k]) || 0) > 0);
  const complete = pickedCount >= total && !hasFlag;
  const ts = now();

  await env.DB.prepare(
    "UPDATE route_stops SET pickup_state=?, picked_count=?, picked_total=?, pickup_flag=?, picked_at=?, status=CASE WHEN ?>=? AND ?='1' THEN 'picked' ELSE status END, updated_at=? WHERE id=?"
  ).bind(
    toJson(picked), pickedCount, total, hasFlag ? toJson(flag) : null, complete ? ts : null,
    pickedCount, total, complete ? '1' : '0', ts, stopId
  ).run();

  if (hasFlag) {
    const who = (stop.customer_name || '').split(' ')[0] || 'an order';
    await raiseAlert(env, {
      alert_type: 'delivery_failed',
      severity: 'high',
      title: `Missing bowl(s) at pickup — ${who}`,
      body: `Driver flagged short/missing bowls loading ${who}'s order (stop ${stop.seq}). Kitchen should reconcile before the route leaves.`,
      ref_type: 'order', ref_id: stop.order_id,
    }).catch(() => {});
  }

  await capture(env, {
    event: 'delivery.picked', distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { route_id: route.id, stop_id: stopId, picked_count: pickedCount, total, flagged: !!hasFlag },
  });

  // Is the whole route picked now?
  const left = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM route_stops rs JOIN orders o ON o.id=rs.order_id WHERE rs.route_id=? AND rs.status NOT IN ('picked','en_route','arriving','delivered','done','failed')"
  ).bind(route.id).first();
  const allPicked = (left && left.n === 0);

  return json({ ok: true, stop_id: stopId, picked_count: pickedCount, total, complete, all_picked: allPicked });
};
