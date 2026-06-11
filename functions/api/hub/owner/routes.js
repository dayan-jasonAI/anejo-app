// /api/hub/owner/routes — owner route assignment.
//   GET  ?date=YYYY-MM-DD (default today)
//        → { drivers, unassigned (orders pending|paid for the date with no route_stops row),
//            routes (existing routes for the date w/ stop counts + driver name) }
//   POST { driver_id, route_date, order_ids:[…], ai_optimized? }
//        → creates a routes row + route_stops seq 1..n, fires route.assigned,
//          SMSes the driver (safe no-op without Twilio creds) and posts an in_app
//          thread message so the route shows up in their HUB inbox.
// Owner-only. Stop labels carry customer name + window — never a street address.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { today, bit } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';
import { sendSms } from '../../../_lib/twilio.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Find the driver's latest open thread, or create one (audience 'driver').
// Prefers a threads.staff_id column when present (added by the comms module);
// falls back to created_by so this works against the base 0003 schema too.
async function findOrCreateDriverThread(env, driver, t) {
  try {
    const r = await env.DB
      .prepare("SELECT id FROM threads WHERE staff_id=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1")
      .bind(driver.id)
      .first();
    if (r && r.id) return r.id;
  } catch { /* no staff_id column yet */ }
  try {
    const r = await env.DB
      .prepare("SELECT id FROM threads WHERE created_by=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1")
      .bind(driver.id)
      .first();
    if (r && r.id) return r.id;
  } catch { /* tolerate */ }

  const tid = id('thr');
  try {
    await env.DB
      .prepare("INSERT INTO threads (id, audience, subject, created_by, staff_id, status, created_at, updated_at) VALUES (?,'driver',?,?,?,'open',?,?)")
      .bind(tid, 'Route assignment', driver.id, driver.id, t, t)
      .run();
    return tid;
  } catch { /* no staff_id column yet */ }
  await env.DB
    .prepare("INSERT INTO threads (id, audience, subject, created_by, status, created_at, updated_at) VALUES (?,'driver',?,?,'open',?,?)")
    .bind(tid, 'Route assignment', driver.id, t, t)
    .run();
  return tid;
}

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
      .prepare("SELECT id, name, phone, team FROM staff WHERE role='driver' AND active=1 ORDER BY name")
      .all();
    drivers = (res && res.results) || [];
  } catch { drivers = []; }

  // Orders for the date that are payable/fulfillable and not yet on any route.
  let unassigned = [];
  try {
    const res = await env.DB
      .prepare(
        "SELECT o.id, o.customer_name, o.items, o.delivery_date, o.delivery_window, o.status, o.total_estimate_cents " +
        "FROM orders o WHERE o.delivery_date=? AND o.status IN ('pending','paid') " +
        'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ' +
        'ORDER BY o.delivery_window, o.created_at'
      )
      .bind(date)
      .all();
    unassigned = (res && res.results) || [];
  } catch { unassigned = []; }

  let routes = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT r.id, r.driver_id, r.route_date, r.stop_count, r.stops_completed, r.stops_failed, r.status, ' +
        'r.ai_optimized, r.created_at, st.name AS driver_name, ' +
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
    .prepare(`SELECT id, customer_name, delivery_window, status FROM orders WHERE id IN (${placeholders})`)
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

  const t = now();
  const routeId = id('route');
  const byId = new Map(orders.map((o) => [o.id, o]));

  await env.DB
    .prepare(
      'INSERT INTO routes (id, driver_id, route_date, stop_count, ai_optimized, status, created_at, updated_at) ' +
      "VALUES (?,?,?,?,?,'assigned',?,?)"
    )
    .bind(routeId, driverId, routeDate, orderIds.length, bit(aiOptimized), t, t)
    .run();

  // Stops in the order the owner picked them (seq 1..n).
  const stmt = env.DB.prepare(
    "INSERT INTO route_stops (id, route_id, order_id, seq, label, status, created_at, updated_at) VALUES (?,?,?,?,?,'pending',?,?)"
  );
  const batch = orderIds.map((oid, i) => {
    const o = byId.get(oid);
    const label = `${(o && o.customer_name) || 'Customer'} — ${(o && o.delivery_window) || 'delivery'}`;
    return stmt.bind(id('stop'), routeId, oid, i + 1, label, t, t);
  });
  await env.DB.batch(batch);

  await capture(env, {
    event: 'route.assigned',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { route_id: routeId, driver_id: driverId, stop_count: orderIds.length, ai_optimized: aiOptimized },
  });

  // SMS the driver (safe no-op without TWILIO_* creds; still logged to sms_log).
  let sms = null;
  if (driver.phone) {
    sms = await sendSms(env, {
      to: driver.phone,
      body: `Añejo: new route — ${orderIds.length} stops on ${routeDate}. Open the HUB.`,
    });
  }

  // In-app thread message so the route shows in the driver's inbox.
  try {
    const threadId = await findOrCreateDriverThread(env, driver, t);
    await env.DB
      .prepare("INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at) VALUES (?,?,'outbound','in_app',?,?,?,0,?)")
      .bind(id('msg'), threadId, ctx.distinct_id || null, ctx.role || 'owner', `New route assigned: ${orderIds.length} stops on ${routeDate}.`, t)
      .run();
    await env.DB.prepare('UPDATE threads SET last_message_at=?, updated_at=? WHERE id=?').bind(t, t, threadId).run();
    await capture(env, {
      event: 'message.sent',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { channel: 'in_app', audience: 'driver', ai_drafted: false },
    });
  } catch { /* messaging must not break the assignment */ }

  return json({ ok: true, id: routeId, stop_count: orderIds.length, sms_sent: !!(sms && sms.sent), sms_noop: !!(sms && sms.noop) });
};
