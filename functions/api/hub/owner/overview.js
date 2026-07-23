// GET /api/hub/owner/overview — at-a-glance aggregate counts for the command center.
// Owner-only. Reads the hub tables; tolerant of missing tables (returns zeros) so the
// dashboard renders before every migration is applied. Does NOT instrument by itself —
// the client fires dashboard.viewed; this is a pure read.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { today } from '../../../_lib/hub.js';

// Run a single-row count query; return 0 if the table is missing or the query fails.
async function count(env, sql, binds = []) {
  try {
    const row = await env.DB.prepare(sql).bind(...binds).first();
    return (row && (row.n != null ? row.n : row.c)) || 0;
  } catch {
    return 0;
  }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const day = today();

  const [
    ordersOpen,
    pendingCheckout,
    deliveriesToday,
    deliveriesDone,
    deliveriesFailed,
    onShift,
    eodToday,
    staffActive,
    ticketsOpen,
    expensesPending,
    alertsOpen,
    alertsCritical,
    tempExcursionsToday,
    restockPending,
  ] = await Promise.all([
    count(env, "SELECT COUNT(*) n FROM orders WHERE status IN ('paid','prep','ready') AND kitchen_cleared_at IS NULL"),
    count(env, "SELECT COUNT(*) n FROM orders WHERE status='pending'"),
    count(env, 'SELECT COUNT(*) n FROM deliveries WHERE substr(datetime(created_at/1000,"unixepoch"),1,10) >= ? OR route_id IN (SELECT id FROM routes WHERE route_date = ?)', [day, day]),
    count(env, "SELECT COUNT(*) n FROM deliveries WHERE status='completed' AND route_id IN (SELECT id FROM routes WHERE route_date = ?)", [day]),
    count(env, "SELECT COUNT(*) n FROM deliveries WHERE status='failed' AND route_id IN (SELECT id FROM routes WHERE route_date = ?)", [day]),
    count(env, "SELECT COUNT(*) n FROM shifts WHERE status='open'"),
    count(env, 'SELECT COUNT(*) n FROM eod_reports WHERE report_date = ?', [day]),
    count(env, 'SELECT COUNT(*) n FROM staff WHERE active=1'),
    count(env, "SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')"),
    count(env, "SELECT COUNT(*) n FROM expenses WHERE status='pending'"),
    count(env, "SELECT COUNT(*) n FROM alerts WHERE status='open'"),
    count(env, "SELECT COUNT(*) n FROM alerts WHERE status='open' AND severity='critical'"),
    count(env, 'SELECT COUNT(*) n FROM temp_logs WHERE in_range=0 AND substr(datetime(created_at/1000,"unixepoch"),1,10) = ?', [day]),
    count(env, "SELECT COUNT(*) n FROM restock_orders WHERE status IN ('submitted','acknowledged')"),
  ]);

  // EOD compliance: reports submitted today vs staff expected to file (active w2/contractor staff).
  const eodExpected = await count(env, "SELECT COUNT(*) n FROM staff WHERE active=1 AND role IN ('kitchen','driver')");
  const eodPct = eodExpected ? Math.round((eodToday / eodExpected) * 100) : null;

  return json({
    ok: true,
    date: day,
    tiles: {
      orders_open: ordersOpen,
      pending_checkout: pendingCheckout,
      deliveries_today: deliveriesToday,
      deliveries_done: deliveriesDone,
      deliveries_failed: deliveriesFailed,
      on_shift: onShift,
      staff_active: staffActive,
      eod_submitted: eodToday,
      eod_expected: eodExpected,
      eod_pct: eodPct,
      tickets_open: ticketsOpen,
      expenses_pending: expensesPending,
      alerts_open: alertsOpen,
      alerts_critical: alertsCritical,
      temp_excursions_today: tempExcursionsToday,
      restock_pending: restockPending,
    },
  });
};
