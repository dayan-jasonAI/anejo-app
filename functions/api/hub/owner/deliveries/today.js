// GET /api/hub/owner/deliveries/today — today's delivery picture for the command center.
// Owner-only. Query: ?date=YYYY-MM-DD (defaults today). Returns route summaries + per-delivery
// status, plus a roll-up (done / failed / pending / on-time rate).
import { json } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { today } from '../../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const url = new URL(request.url);
  const date = (url.searchParams.get('date') || '').trim() || today();

  // Routes for the date with the driver name.
  let routes = [];
  try {
    const res = await env.DB
      .prepare(
        "SELECT r.id, r.driver_id, r.route_date, r.stop_count, r.stops_completed, r.stops_failed, " +
        "r.status, r.ai_optimized, r.total_miles_est, r.started_at, r.completed_at, st.name AS driver_name " +
        "FROM routes r LEFT JOIN staff st ON st.id = r.driver_id WHERE r.route_date = ? ORDER BY r.created_at ASC"
      )
      .bind(date)
      .all();
    routes = (res && res.results) || [];
  } catch {
    routes = [];
  }

  const routeIds = routes.map((r) => r.id);

  // Deliveries tied to those routes (today's drops).
  let deliveries = [];
  if (routeIds.length) {
    const placeholders = routeIds.map(() => '?').join(',');
    try {
      const res = await env.DB
        .prepare(
          `SELECT d.id, d.order_id, d.route_id, d.driver_id, d.status, d.fail_reason, d.on_time, ` +
          `d.completed_at, o.customer_name FROM deliveries d ` +
          `LEFT JOIN orders o ON o.id = d.order_id WHERE d.route_id IN (${placeholders}) ORDER BY d.created_at ASC`
        )
        .bind(...routeIds)
        .all();
      deliveries = (res && res.results) || [];
    } catch {
      deliveries = [];
    }
  }

  const done = deliveries.filter((d) => d.status === 'completed').length;
  const failed = deliveries.filter((d) => d.status === 'failed').length;
  const pending = deliveries.filter((d) => d.status === 'pending').length;
  const onTimeEligible = deliveries.filter((d) => d.on_time != null).length;
  const onTime = deliveries.filter((d) => d.on_time === 1).length;
  const on_time_pct = onTimeEligible ? Math.round((onTime / onTimeEligible) * 100) : null;

  return json({
    ok: true,
    date,
    routes,
    deliveries,
    rollup: {
      route_count: routes.length,
      delivery_count: deliveries.length,
      done,
      failed,
      pending,
      on_time_pct,
    },
  });
};
