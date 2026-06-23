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
        "r.status, r.ai_optimized, r.total_miles_est, r.pay_cents, r.eta_complete_at, r.total_minutes, r.started_at, r.completed_at, st.name AS driver_name " +
        "FROM routes r LEFT JOIN staff st ON st.id = r.driver_id WHERE r.route_date = ? ORDER BY r.created_at ASC"
      )
      .bind(date)
      .all();
    routes = (res && res.results) || [];
  } catch {
    routes = [];
  }

  const routeIds = routes.map((r) => r.id);

  // Deliveries tied to those routes (today's drops) — with proof photo + customer feedback.
  let deliveries = [];
  if (routeIds.length) {
    const placeholders = routeIds.map(() => '?').join(',');
    try {
      const res = await env.DB
        .prepare(
          `SELECT d.id, d.order_id, d.route_id, d.driver_id, d.status, d.fail_reason, d.on_time, ` +
          `d.completed_at, d.proof_photo, d.proof_skipped, o.customer_name, ` +
          `f.rating AS feedback_rating, f.comment AS feedback_comment FROM deliveries d ` +
          `LEFT JOIN orders o ON o.id = d.order_id ` +
          `LEFT JOIN delivery_feedback f ON f.delivery_id = d.id ` +
          `WHERE d.route_id IN (${placeholders}) ORDER BY d.created_at ASC`
        )
        .bind(...routeIds)
        .all();
      deliveries = (res && res.results) || [];
    } catch {
      deliveries = [];
    }
  }

  // Live per-route stop progress (the in-flight picture: who's picked / en route / arriving).
  const progressByRoute = {};
  if (routeIds.length) {
    const ph = routeIds.map(() => '?').join(',');
    try {
      const res = await env.DB.prepare(
        `SELECT rs.route_id, rs.status, rs.eta_at, rs.seq, o.customer_name
           FROM route_stops rs LEFT JOIN orders o ON o.id = rs.order_id
          WHERE rs.route_id IN (${ph}) ORDER BY rs.seq ASC`
      ).bind(...routeIds).all();
      for (const s of (res && res.results) || []) {
        const p = progressByRoute[s.route_id] || (progressByRoute[s.route_id] = { picked: 0, en_route: 0, arriving: 0, done: 0, failed: 0, pending: 0, active: null });
        p[s.status] = (p[s.status] || 0) + 1;
        if ((s.status === 'en_route' || s.status === 'arriving') && !p.active) {
          p.active = { name: (s.customer_name || '').split(' ')[0] || 'Stop', status: s.status, eta_at: s.eta_at || null };
        }
      }
    } catch { /* progress is best-effort */ }
  }
  routes = routes.map((r) => ({ ...r, progress: progressByRoute[r.id] || null }));

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
