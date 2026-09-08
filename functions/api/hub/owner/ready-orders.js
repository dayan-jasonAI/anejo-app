// Read-only readiness source: all dates, including orders cleared off the kitchen
// board. Clearing that board is a handoff, NOT a delivery or cancellation.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  try {
    const { results } = await env.DB.prepare(`SELECT o.id, o.customer_name,
      o.delivery_date, o.delivery_window, o.kitchen_cleared_at,
      r.id AS route_id, r.status AS route_status, r.offer_status, s.name AS driver_name,
      CASE WHEN r.driver_id IS NOT NULL AND
        (r.offer_status='accepted' OR r.status='started') THEN 0 ELSE 1 END AS awaiting_driver
      FROM orders o
      LEFT JOIN routes r ON r.id=(SELECT rs.route_id FROM route_stops rs
        JOIN routes active_route ON active_route.id=rs.route_id
        WHERE rs.order_id=o.id AND active_route.status NOT IN ('canceled','completed')
        ORDER BY active_route.created_at DESC LIMIT 1)
      LEFT JOIN staff s ON s.id=r.driver_id
      WHERE o.status='ready'
      ORDER BY awaiting_driver DESC, o.delivery_date, o.delivery_window, o.created_at`).all();
    const items = (results || []).map((o) => ({ ...o, awaiting_driver: !!o.awaiting_driver }));
    return json({ ok: true, items, total: items.length,
      awaiting_driver: items.filter((o) => o.awaiting_driver).length, generated_at: Date.now() },
    200, { 'Cache-Control': 'no-store' });
  } catch {
    return bad('Readiness unavailable. Retry shortly. / Estado no disponible. Vuelve a intentar pronto.', 503);
  }
};
