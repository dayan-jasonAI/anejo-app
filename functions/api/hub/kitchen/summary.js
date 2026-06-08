// GET /api/hub/kitchen/summary?date=YYYY-MM-DD — daily order summary for the kitchen.
// Aggregates today's orders: counts by status, by delivery window, and a rolled-up
// bowl/item tally so the kitchen can batch-prep. Fires order_summary.viewed.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { today, parseJson } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const day = url.searchParams.get('date') || today();

  const { results } = await env.DB.prepare(
    `SELECT * FROM orders WHERE delivery_date = ? AND status != 'canceled' ORDER BY created_at ASC`
  ).bind(day).all();
  const orders = results || [];

  const byStatus = {};
  const byWindow = { lunch: 0, dinner: 0, unspecified: 0 };
  const itemTally = {}; // name -> qty
  let totalBowls = 0;

  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    const win = o.delivery_window === 'lunch' ? 'lunch' : o.delivery_window === 'dinner' ? 'dinner' : 'unspecified';
    byWindow[win] += 1;
    const items = parseJson(o.items, []) || [];
    if (Array.isArray(items)) {
      for (const it of items) {
        const name = (it && it.name) ? String(it.name) : 'Item';
        const qty = Number(it && it.qty) || 1;
        itemTally[name] = (itemTally[name] || 0) + qty;
        totalBowls += qty;
      }
    }
  }

  const items = Object.entries(itemTally)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);

  await capture(env, {
    event: 'order_summary.viewed',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { date: day, order_count: orders.length },
  });

  return json({
    date: day,
    order_count: orders.length,
    total_bowls: totalBowls,
    by_status: byStatus,
    by_window: byWindow,
    items,
  });
};
