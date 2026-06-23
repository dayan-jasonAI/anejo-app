// GET /api/hub/owner/finance/rollup — money roll-up for the command center.
// Owner-only. Query: ?days=7 (window, max 90) or ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// Combines: orders revenue (paid/fulfilled), expenses (by status), mileage (pending),
// and trainer rev-share (from rev_share_events). All amounts in cents.
import { json } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';

async function one(env, sql, binds = []) {
  try { return await env.DB.prepare(sql).bind(...binds).first(); } catch { return null; }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const url = new URL(request.url);
  let days = parseInt(url.searchParams.get('days') || '7', 10);
  if (!Number.isFinite(days) || days < 1) days = 7;
  if (days > 90) days = 90;
  const sinceMs = Date.now() - days * 86400000;

  // Orders revenue in window (use created_at unix-ms). Count paid + fulfilled as realized.
  const ordersRow = await one(
    env,
    "SELECT COUNT(*) n, COALESCE(SUM(total_estimate_cents),0) cents FROM orders WHERE status IN ('paid','fulfilled') AND created_at >= ?",
    [sinceMs]
  );
  const ordersPendingRow = await one(
    env,
    "SELECT COUNT(*) n, COALESCE(SUM(total_estimate_cents),0) cents FROM orders WHERE status='pending' AND created_at >= ?",
    [sinceMs]
  );

  // Expenses by status in window.
  const expApproved = await one(env, "SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) cents FROM expenses WHERE status='approved' AND created_at >= ?", [sinceMs]);
  const expPending = await one(env, "SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) cents FROM expenses WHERE status='pending' AND created_at >= ?", [sinceMs]);

  // Mileage pending (count + miles) in window.
  const mileagePending = await one(env, "SELECT COUNT(*) n, COALESCE(SUM(miles),0) miles FROM mileage WHERE status='pending' AND created_at >= ?", [sinceMs]);

  // Trainer rev-share owed in window (occurred_at unix-ms; pending payout).
  const revShare = await one(env, "SELECT COUNT(*) n, COALESCE(SUM(share_cents),0) cents FROM rev_share_events WHERE occurred_at >= ?", [sinceMs]);
  const revSharePending = await one(env, "SELECT COALESCE(SUM(share_cents),0) cents FROM rev_share_events WHERE payout_status='pending' AND occurred_at >= ?", [sinceMs]);

  // Driver route pay in window. completed = earned/payable now; scheduled = assigned/started (owed on completion).
  const driverPay = await one(
    env,
    "SELECT COUNT(*) n, COALESCE(SUM(pay_cents),0) cents, " +
    "COALESCE(SUM(CASE WHEN status='completed' THEN pay_cents ELSE 0 END),0) completed_cents, " +
    "COALESCE(SUM(CASE WHEN status IN ('assigned','started') THEN pay_cents ELSE 0 END),0) scheduled_cents, " +
    "COALESCE(SUM(total_miles_est),0) miles FROM routes WHERE created_at >= ?",
    [sinceMs]
  );

  const revenue_cents = (ordersRow && ordersRow.cents) || 0;
  const expenses_approved_cents = (expApproved && expApproved.cents) || 0;
  const driver_pay_completed_cents = (driverPay && driverPay.completed_cents) || 0;

  return json({
    ok: true,
    window_days: days,
    since: sinceMs,
    orders: {
      realized_count: (ordersRow && ordersRow.n) || 0,
      revenue_cents,
      pending_count: (ordersPendingRow && ordersPendingRow.n) || 0,
      pending_cents: (ordersPendingRow && ordersPendingRow.cents) || 0,
    },
    expenses: {
      approved_count: (expApproved && expApproved.n) || 0,
      approved_cents: expenses_approved_cents,
      pending_count: (expPending && expPending.n) || 0,
      pending_cents: (expPending && expPending.cents) || 0,
    },
    mileage: {
      pending_count: (mileagePending && mileagePending.n) || 0,
      pending_miles: (mileagePending && mileagePending.miles) || 0,
    },
    rev_share: {
      event_count: (revShare && revShare.n) || 0,
      total_cents: (revShare && revShare.cents) || 0,
      pending_cents: (revSharePending && revSharePending.cents) || 0,
    },
    driver_pay: {
      route_count: (driverPay && driverPay.n) || 0,
      total_cents: (driverPay && driverPay.cents) || 0,
      completed_cents: driver_pay_completed_cents,
      scheduled_cents: (driverPay && driverPay.scheduled_cents) || 0,
      miles: (driverPay && driverPay.miles) || 0,
    },
    // Rough operating contribution = realized revenue − approved expenses − driver pay earned (sandbox estimate).
    net_estimate_cents: revenue_cents - expenses_approved_cents - driver_pay_completed_cents,
  });
};
