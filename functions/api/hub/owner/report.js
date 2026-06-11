// POST /api/hub/owner/report — real CSV report export for the command center.
// Owner-only. Body: { report_type, format?:'csv'|'json', from?:'YYYY-MM-DD', to?:'YYYY-MM-DD' }.
// report_type ∈ payroll|deliveries|finance|accountability|temp_compliance.
// Default range: last 30 days (inclusive). format:'csv' (default) returns the file
// directly as an attachment download; format:'json' returns { ok, headers, rows }
// for callers that expect JSON (backward-safe with the old stub UI).
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { today, parseJson } from '../../../_lib/hub.js';

const REPORT_TYPES = ['payroll', 'deliveries', 'finance', 'accountability', 'temp_compliance'];
const FORMATS = ['csv', 'json'];
const DAY_MS = 24 * 3600 * 1000;
const MAX_ACCOUNTABILITY_DAYS = 92; // bound the per-staff-per-day matrix

const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// YYYY-MM-DD (business tz) for a unix-ms timestamp.
function dayOf(ms, tz = 'America/New_York') {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

const iso = (ms) => (ms ? new Date(ms).toISOString() : '');
const dollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2));
const yn = (v) => (v == null ? '' : (v ? 'y' : 'n'));

// CSV escape: quote + double embedded quotes when the field needs it.
function csvEsc(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(headers, rows) {
  return [headers].concat(rows).map((r) => r.map(csvEsc).join(',')).join('\r\n') + '\r\n';
}

// ---------- report builders (each returns { headers, rows }) ----------

async function buildPayroll(env, fromMs, toMs) {
  const { results } = await env.DB.prepare(
    `SELECT st.id, st.name, st.role, st.pay_rate_cents,
            COUNT(s.id) AS shift_count,
            SUM(COALESCE(s.total_minutes, CAST((s.clock_out_at - s.clock_in_at) / 60000 AS INTEGER), 0)) AS minutes,
            SUM(COALESCE(s.break_minutes, 0)) AS break_minutes
       FROM shifts s
       JOIN staff st ON st.id = s.staff_id
      WHERE s.status = 'closed' AND s.clock_out_at >= ? AND s.clock_out_at <= ?
      GROUP BY st.id
      ORDER BY st.name`
  ).bind(fromMs, toMs).all();

  const headers = ['name', 'role', 'shifts', 'total_hours', 'break_minutes', 'est_pay'];
  const rows = (results || []).map((r) => {
    const hours = (r.minutes || 0) / 60;
    const estPay = r.pay_rate_cents ? ((r.pay_rate_cents * hours) / 100).toFixed(2) : '';
    return [r.name || r.id, r.role || '', r.shift_count || 0, hours.toFixed(2), r.break_minutes || 0, estPay];
  });
  return { headers, rows };
}

async function buildDeliveries(env, fromMs, toMs) {
  const { results } = await env.DB.prepare(
    `SELECT d.order_id, d.status, d.on_time, d.completed_at, d.created_at,
            o.customer_name, st.name AS driver_name
       FROM deliveries d
       LEFT JOIN orders o ON o.id = d.order_id
       LEFT JOIN staff st ON st.id = d.driver_id
      WHERE d.created_at >= ? AND d.created_at <= ?
      ORDER BY d.created_at ASC`
  ).bind(fromMs, toMs).all();

  const headers = ['date', 'order_id', 'customer_name', 'driver', 'status', 'on_time', 'completed_at'];
  const rows = (results || []).map((d) => [
    dayOf(d.completed_at || d.created_at), d.order_id || '', d.customer_name || '',
    d.driver_name || '', d.status || '', yn(d.on_time), iso(d.completed_at),
  ]);
  return { headers, rows };
}

async function buildFinance(env, fromMs, toMs) {
  const { results } = await env.DB.prepare(
    `SELECT id, square_order_id, items, delivery_date, subtotal_cents, fee_cents,
            tax_pct, total_estimate_cents, status, customer_name, created_at
       FROM orders
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at ASC`
  ).bind(fromMs, toMs).all();

  const headers = ['date', 'order_id', 'customer', 'items_count', 'subtotal', 'fee', 'tax_pct', 'total', 'status', 'source'];
  const rows = (results || []).map((o) => {
    const items = parseJson(o.items, []);
    return [
      o.delivery_date || dayOf(o.created_at), o.id, o.customer_name || '',
      Array.isArray(items) ? items.length : 0, dollars(o.subtotal_cents), dollars(o.fee_cents),
      o.tax_pct == null ? '' : o.tax_pct, dollars(o.total_estimate_cents), o.status || '',
      o.square_order_id ? 'square' : 'manual',
    ];
  });
  return { headers, rows };
}

async function buildAccountability(env, fromMs, toMs, from, to) {
  const staffRes = await env.DB.prepare(
    "SELECT id, name, role FROM staff WHERE active = 1 AND role IN ('kitchen','driver') ORDER BY role, name"
  ).all();
  const staff = (staffRes && staffRes.results) || [];

  const shiftsRes = await env.DB.prepare(
    'SELECT staff_id, clock_in_at FROM shifts WHERE clock_in_at >= ? AND clock_in_at <= ?'
  ).bind(fromMs, toMs).all();
  const clocked = new Set();
  ((shiftsRes && shiftsRes.results) || []).forEach((s) => {
    clocked.add(`${s.staff_id}|${dayOf(s.clock_in_at)}`);
  });

  const eodRes = await env.DB.prepare(
    'SELECT staff_id, report_date, on_time, status FROM eod_reports WHERE report_date >= ? AND report_date <= ?'
  ).bind(from, to).all();
  const eodMap = new Map();
  ((eodRes && eodRes.results) || []).forEach((r) => {
    eodMap.set(`${r.staff_id}|${r.report_date}`, r);
  });

  // Day list (inclusive, bounded).
  const days = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && days.length < MAX_ACCOUNTABILITY_DAYS; t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }

  const headers = ['date', 'name', 'role', 'clocked_in', 'eod_submitted', 'on_time'];
  const rows = [];
  days.forEach((day) => {
    staff.forEach((s) => {
      const eod = eodMap.get(`${s.id}|${day}`);
      const submitted = !!(eod && eod.status !== 'missed');
      rows.push([
        day, s.name || s.id, s.role || '',
        yn(clocked.has(`${s.id}|${day}`)),
        yn(submitted),
        eod ? yn(eod.on_time) : '',
      ]);
    });
  });
  return { headers, rows };
}

async function buildTempCompliance(env, fromMs, toMs) {
  const { results } = await env.DB.prepare(
    `SELECT t.created_at, t.item, t.temp_f, t.in_range, t.context, st.name AS staff_name
       FROM temp_logs t
       LEFT JOIN staff st ON st.id = t.staff_id
      WHERE t.created_at >= ? AND t.created_at <= ?
      ORDER BY t.created_at ASC`
  ).bind(fromMs, toMs).all();

  const headers = ['datetime', 'item', 'temp_f', 'in_range', 'context', 'staff'];
  const rows = (results || []).map((t) => [
    iso(t.created_at), t.item || '', t.temp_f == null ? '' : t.temp_f,
    yn(t.in_range), t.context || '', t.staff_name || '',
  ]);
  return { headers, rows };
}

// ---------- handler ----------

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const report_type = (b && b.report_type || '').toString().trim();
  if (!REPORT_TYPES.includes(report_type)) return bad('Unknown report_type.');
  let format = (b && b.format || 'csv').toString().toLowerCase();
  if (!FORMATS.includes(format)) format = 'csv';

  // Inclusive date range, default last 30 days ending today.
  let to = (b && b.to || '').toString().trim();
  if (!isYmd(to)) to = today();
  let from = (b && b.from || '').toString().trim();
  if (!isYmd(from)) from = new Date(Date.parse(`${to}T00:00:00Z`) - 30 * DAY_MS).toISOString().slice(0, 10);
  if (from > to) { const t = from; from = to; to = t; }

  const fromMs = Date.parse(`${from}T00:00:00Z`) - 12 * 3600 * 1000; // pad for tz skew
  const toMs = Date.parse(`${to}T00:00:00Z`) + DAY_MS + 12 * 3600 * 1000;

  let report;
  if (report_type === 'payroll') report = await buildPayroll(env, fromMs, toMs);
  else if (report_type === 'deliveries') report = await buildDeliveries(env, fromMs, toMs);
  else if (report_type === 'finance') report = await buildFinance(env, fromMs, toMs);
  else if (report_type === 'accountability') report = await buildAccountability(env, fromMs, toMs, from, to);
  else report = await buildTempCompliance(env, fromMs, toMs);

  await capture(env, {
    event: 'report.exported',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    actor_type: 'human',
    team: ctx.team,
    properties: { report_type, format, from, to, row_count: report.rows.length, platform: 'api' },
  });

  if (format === 'json') {
    return json({ ok: true, report_type, from, to, headers: report.headers, rows: report.rows });
  }

  const csv = toCsv(report.headers, report.rows);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="anejo-${report_type}-${from}-${to}.csv"`,
    },
  });
};
