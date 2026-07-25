// GET /api/hub/driver/earnings?days=30 (max 120) — what the SIGNED-IN driver has earned:
// owed (completed + not yet paid), paid, scheduled (assigned/started), plus the per-route lines
// behind those numbers. The driver-side mirror of the owner's /api/hub/owner/payouts, so a driver
// no longer has to ask the owner what they're owed.
//
// The driver id comes ONLY from the session's staff record — never from the query string or body —
// so this endpoint cannot be pointed at another driver's pay. Amounts in cents.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { payRollupColumns } from '../../../_lib/pay.js';

const ROUTE_LIMIT = 100;

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);
  const driverId = staff.id;

  let days = parseInt(new URL(request.url).searchParams.get('days') || '30', 10);
  if (!Number.isFinite(days) || days < 1) days = 30;
  if (days > 120) days = 120;
  const since = Date.now() - days * 86400000;

  let totals = { owed_cents: 0, paid_cents: 0, scheduled_cents: 0, completed_routes: 0, miles: 0, stops: 0 };
  try {
    const row = await env.DB.prepare(
      `SELECT ${payRollupColumns('r')}, COUNT(*) route_count FROM routes r WHERE r.driver_id=? AND r.created_at>=?`
    ).bind(driverId, since).first();
    if (row) totals = row;
  } catch { /* early env without the pay columns — fall back to zeros rather than 500 */ }

  // The lines behind the totals: what each route paid and whether it's been settled.
  let routes = [];
  try {
    const res = await env.DB.prepare(
      "SELECT id, route_date, status, stop_count, total_miles_est, pay_cents, " +
      "COALESCE(pay_status,'unpaid') pay_status, completed_at, paid_at FROM routes " +
      'WHERE driver_id=? AND created_at>=? ORDER BY route_date DESC, created_at DESC LIMIT ' + ROUTE_LIMIT
    ).bind(driverId, since).all();
    routes = (res && res.results) || [];
  } catch { routes = []; }

  return json({
    ok: true,
    window_days: days,
    since,
    driver: { id: driverId, name: staff.name || null },
    totals,
    routes,
  });
};
