// /api/hub/owner/payouts — per-driver payout view ("who's owed what").
//   GET  ?days=14 (max 120) → per driver: owed (completed+unpaid), paid, scheduled, routes,
//        miles, stops + the list of unpaid completed routes.
//   POST { op:'mark_paid', driver_id, days? }  → marks that driver's completed+unpaid routes in
//        the window as paid.  OR { op:'mark_paid', route_ids:[…] } to mark specific routes.
// Owner-only. Amounts in cents.
//
// BOTH MONEY SAFETIES APPLY HERE (Decision #13). Marking a payout paid used to be a single POST
// with no switch and no record that anyone had agreed to the figure. It now requires:
//   1. the payouts switch ON in the HUB (Finance → Automatic payments), and
//   2. an unused approval for the EXACT total being marked (POST approve_payout on
//      /api/hub/owner/autopay first).
// The approval is consumed as it is used, so one approval can never cover two payouts, and two
// concurrent mark-paid calls cannot both claim it. Refusals are recorded in money_movements.
//
// The amount is computed HERE, from the routes, and the approval must match that computed number —
// not a number the caller sent. Otherwise "approve $500, mark $5,000" would pass.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';
import { authorizePayout } from '../../../_lib/autopay.js';

function windowMs(url) {
  let days = parseInt(url.searchParams.get('days') || '14', 10);
  if (!Number.isFinite(days) || days < 1) days = 14;
  if (days > 120) days = 120;
  return { days, since: Date.now() - days * 86400000 };
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const { days, since } = windowMs(new URL(request.url));

  let drivers = [];
  try {
    const res = await env.DB.prepare(
      "SELECT r.driver_id, st.name AS driver_name, COUNT(*) routes, " +
      "COALESCE(SUM(CASE WHEN r.status='completed' AND COALESCE(r.pay_status,'unpaid')='unpaid' THEN r.pay_cents ELSE 0 END),0) owed_cents, " +
      "COALESCE(SUM(CASE WHEN r.pay_status='paid' THEN r.pay_cents ELSE 0 END),0) paid_cents, " +
      "COALESCE(SUM(CASE WHEN r.status IN ('assigned','started') THEN r.pay_cents ELSE 0 END),0) scheduled_cents, " +
      "COALESCE(SUM(CASE WHEN r.status='completed' THEN 1 ELSE 0 END),0) completed_routes, " +
      "COALESCE(SUM(r.total_miles_est),0) miles, COALESCE(SUM(r.stop_count),0) stops " +
      "FROM routes r LEFT JOIN staff st ON st.id = r.driver_id " +
      "WHERE r.created_at >= ? AND r.driver_id IS NOT NULL GROUP BY r.driver_id ORDER BY owed_cents DESC, paid_cents DESC"
    ).bind(since).all();
    drivers = (res && res.results) || [];
  } catch { drivers = []; }

  // Unpaid completed routes (the detail behind "owed").
  for (const d of drivers) {
    try {
      const res = await env.DB.prepare(
        "SELECT id, route_date, stop_count, total_miles_est, pay_cents, completed_at FROM routes " +
        "WHERE driver_id=? AND status='completed' AND COALESCE(pay_status,'unpaid')='unpaid' AND created_at>=? ORDER BY route_date DESC"
      ).bind(d.driver_id, since).all();
      d.unpaid_routes = (res && res.results) || [];
    } catch { d.unpaid_routes = []; }
  }

  const totals = {
    owed_cents: drivers.reduce((s, d) => s + (d.owed_cents || 0), 0),
    paid_cents: drivers.reduce((s, d) => s + (d.paid_cents || 0), 0),
    scheduled_cents: drivers.reduce((s, d) => s + (d.scheduled_cents || 0), 0),
  };
  return json({ ok: true, window_days: days, since, drivers, totals });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  if (!b || b.op !== 'mark_paid') return bad('Unknown action.');
  const t = now();
  const actor = (ctx && (ctx.email || ctx.distinct_id)) || null;

  // Mark specific routes, or all of a driver's completed+unpaid routes in the window.
  if (Array.isArray(b.route_ids) && b.route_ids.length) {
    const ids = b.route_ids.map(String).slice(0, 200);
    const ph = ids.map(() => '?').join(',');
    let before;
    try {
      before = await env.DB.prepare(`SELECT COALESCE(SUM(pay_cents),0) c, COUNT(*) n, MIN(driver_id) d FROM routes WHERE id IN (${ph}) AND status='completed' AND COALESCE(pay_status,'unpaid')='unpaid'`).bind(...ids).first();
    } catch { return bad('Could not read those routes.', 500); }
    const total = (before && before.c) || 0;
    if (!before || !before.n) return json({ ok: true, marked: 0, total_cents: 0 });

    // Gate BEFORE the UPDATE. A refusal must leave the routes exactly as they were.
    const auth = await authorizePayout(env, {
      kind: 'driver', subjectId: (b.driver_id || before.d || '').toString(), amountCents: total,
      ref: ids.join(','), actor,
    });
    if (!auth.ok) return json({ ok: false, refused: auth.reason, error: auth.error }, 403);

    try {
      await env.DB.prepare(`UPDATE routes SET pay_status='paid', paid_at=?, updated_at=? WHERE id IN (${ph}) AND status='completed' AND COALESCE(pay_status,'unpaid')='unpaid'`).bind(t, t, ...ids).run();
      return json({ ok: true, marked: before.n, total_cents: total, approval_id: auth.approval_id });
    } catch { return bad('Could not mark paid.', 500); }
  }

  const driverId = (b.driver_id || '').toString().trim();
  if (!driverId) return bad('Missing driver_id.');
  let days = parseInt(b.days || '14', 10);
  if (!Number.isFinite(days) || days < 1) days = 14;
  if (days > 120) days = 120;
  const since = Date.now() - days * 86400000;

  let before;
  try {
    before = await env.DB.prepare("SELECT COALESCE(SUM(pay_cents),0) c, COUNT(*) n FROM routes WHERE driver_id=? AND status='completed' AND COALESCE(pay_status,'unpaid')='unpaid' AND created_at>=?").bind(driverId, since).first();
  } catch { return bad('Could not read that driver’s routes.', 500); }
  const total = (before && before.c) || 0;
  if (!before || !before.n) return json({ ok: true, marked: 0, total_cents: 0 });

  const auth = await authorizePayout(env, {
    kind: 'driver', subjectId: driverId, amountCents: total, ref: `days:${days}`, actor,
  });
  if (!auth.ok) return json({ ok: false, refused: auth.reason, error: auth.error }, 403);

  try {
    await env.DB.prepare("UPDATE routes SET pay_status='paid', paid_at=?, updated_at=? WHERE driver_id=? AND status='completed' AND COALESCE(pay_status,'unpaid')='unpaid' AND created_at>=?").bind(t, t, driverId, since).run();
    return json({ ok: true, marked: before.n, total_cents: total, approval_id: auth.approval_id });
  } catch { return bad('Could not mark paid.', 500); }
};
