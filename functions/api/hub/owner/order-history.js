// GET /api/hub/owner/order-history?from=YYYY-MM-DD&to=YYYY-MM-DD&status=&q=&limit=&offset=
//   Owner browse of ALL orders (any status), newest first, over a date range — going back as far
//   as the data goes. Pairs with /api/hub/owner/kitchen-audit?order_id= for the per-order PIN trail.
//   Owner-only.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

function parseJson(s, f) { try { return JSON.parse(s); } catch { return f; } }
const DAY = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const fromStr = (url.searchParams.get('from') || '').trim();
  const toStr = (url.searchParams.get('to') || '').trim();
  const status = (url.searchParams.get('status') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  // Inclusive range on created_at; default to the last 30 days when unspecified.
  const toMs = DATE_RE.test(toStr) ? Date.parse(toStr + 'T23:59:59Z') : Date.now();
  const fromMs = DATE_RE.test(fromStr) ? Date.parse(fromStr + 'T00:00:00Z') : (toMs - 30 * DAY);

  const where = ['created_at >= ?', 'created_at <= ?'];
  const binds = [fromMs, toMs];
  if (status) { where.push('status = ?'); binds.push(status); }
  if (q) {
    where.push('(customer_name LIKE ? OR customer_email LIKE ? OR id LIKE ?)');
    const like = '%' + q + '%'; binds.push(like, like, like);
  }
  const whereSql = where.join(' AND ');

  let rows = [], total = 0;
  try {
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${whereSql}`).bind(...binds).first();
    total = (c && c.n) || 0;
    const res = await env.DB.prepare(
      `SELECT id, square_order_id, items, status, kitchen_cleared_at, kitchen_cleared_by,
              delivery_date, delivery_window, total_estimate_cents, customer_name, customer_email, created_at
         FROM orders WHERE ${whereSql}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds, limit, offset).all();
    rows = (res && res.results) || [];
  } catch { return bad('Could not load order history.', 500); }

  const items = rows.map((o) => {
    const its = parseJson(o.items, []) || [];
    const count = Array.isArray(its)
      ? its.filter((it) => !(it && it.meta)).reduce((n, it) => n + (Number(it && it.qty) || 1), 0) : 0;
    const sid = typeof o.square_order_id === 'string' ? o.square_order_id : '';
    return {
      id: o.id, status: o.status, cleared_at: o.kitchen_cleared_at || null,
      delivery_date: o.delivery_date, delivery_window: o.delivery_window,
      total_cents: o.total_estimate_cents, customer_name: o.customer_name, customer_email: o.customer_email,
      created_at: o.created_at, item_count: count,
      is_subscription: sid.indexOf('sub_') === 0,
    };
  });

  return json({ ok: true, items, count: items.length, total, from: fromMs, to: toMs, limit, offset });
};
