// GET  /api/hub/driver/route       — today's assigned route + ordered stops for the driver.
// POST /api/hub/driver/route       — { action:'start'|'complete' } to mark the route started/completed.
//   start    → routes.status='started', started_at set; fires route.started
//   complete → routes.status='completed', completed_at + totals; fires route.completed
// Guarded for driver/owner. Labels only — never a public street address in code.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, today } from '../../../_lib/hub.js';
import { notifyRouteOutForDelivery } from '../../../_lib/notify.js';

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

  const { results } = await env.DB
    .prepare('SELECT * FROM route_stops WHERE route_id=? ORDER BY seq ASC, created_at ASC')
    .bind(route.id)
    .all();

  return json({ route, stops: results || [] });
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
    // Tell each opted-in customer their delivery is on the way (consent-gated, no-op safe).
    await notifyRouteOutForDelivery(env, route.id);
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
