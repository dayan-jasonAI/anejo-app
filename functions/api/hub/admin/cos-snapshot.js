// GET /api/hub/admin/cos-snapshot — read-only operational rollup for the DMD Chief of Staff.
// Auth: X-Cos-Key header matching env.COS_SNAPSHOT_KEY (constant-time), or an owner session.
// Returns AGGREGATES ONLY: counts, percentages, staff first names for EOD, alert titles.
// No customer names, emails, phones, or addresses ever leave through this endpoint.
import { ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function authed(request, env) {
  const k = request.headers.get('X-Cos-Key') || '';
  if (env.COS_SNAPSHOT_KEY && k && ctEq(k, env.COS_SNAPSHOT_KEY)) return true;
  const ctx = await requireRole(request, env, ['owner']);
  return !(ctx instanceof Response);
}

const scalar = async (env, sql, ...binds) => {
  try { const r = await env.DB.prepare(sql).bind(...binds).first(); return r ? Object.values(r)[0] : 0; } catch (_) { return null; }
};

export async function onRequestGet({ request, env }) {
  if (!(await authed(request, env))) return json({ error: 'unauthorized' }, 401);

  const now = Date.now();
  const dayMs = 864e5;
  const weekAgo = now - 7 * dayMs;
  const today = new Date().toISOString().slice(0, 10);

  // EOD compliance: expected = active kitchen/driver staff; filed = reports for today
  let expected = [], filed = new Set();
  try {
    const e = await env.DB.prepare("SELECT id, name FROM staff WHERE active=1 AND role IN ('kitchen','driver')").all();
    expected = (e && e.results) || [];
    const f = await env.DB.prepare('SELECT staff_id FROM eod_reports WHERE report_date=?').bind(today).all();
    filed = new Set(((f && f.results) || []).map((r) => r.staff_id));
  } catch (_) {}
  const missing = expected.filter((s) => !filed.has(s.id));

  let alerts = [];
  try {
    const a = await env.DB.prepare("SELECT alert_type, severity, title FROM alerts WHERE status='open' ORDER BY created_at DESC LIMIT 12").all();
    alerts = ((a && a.results) || []).map((x) => ({ type: x.alert_type, severity: x.severity, title: x.title }));
  } catch (_) {}

  return json({
    fetched_at: new Date().toISOString(),
    orders_week: await scalar(env, 'SELECT COUNT(*) n FROM orders WHERE created_at>=?', weekAgo),
    orders_open: await scalar(env, "SELECT COUNT(*) n FROM orders WHERE status IN ('pending','paid')"),
    revenue_week_cents: await scalar(env, "SELECT COALESCE(SUM(total_cents),0) n FROM orders WHERE created_at>=? AND status IN ('paid','fulfilled')", weekAgo),
    deliveries_today: await scalar(env, 'SELECT COUNT(*) n FROM deliveries WHERE delivery_date=?', today),
    on_shift: await scalar(env, "SELECT COUNT(*) n FROM shifts WHERE status='open'"),
    eod_expected: expected.length,
    eod_filed: filed.size,
    eod_pct: expected.length ? Math.round((filed.size / expected.length) * 100) : null,
    eod_missing: missing.map((s) => String(s.name || '').split(' ')[0]).slice(0, 10), // first names only
    open_alerts: alerts.length,
    alerts,
    low_stock: await scalar(env, 'SELECT COUNT(*) n FROM inventory_items WHERE par_level>0 AND on_hand<par_level'),
    expenses_pending: await scalar(env, "SELECT COUNT(*) n FROM expenses WHERE status='pending'"),
    tickets_open: await scalar(env, "SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')"),
  });
}
