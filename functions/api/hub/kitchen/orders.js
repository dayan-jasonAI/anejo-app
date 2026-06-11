// Kitchen live order board.
//   GET  /api/hub/kitchen/orders            → today's actionable orders grouped pending|prep|ready
//   GET  /api/hub/kitchen/orders?surface=1  → also fires order.received for newly-surfaced rows
//   POST /api/hub/kitchen/orders { id, action:'prep_start'|'mark_ready' }
//
// The existing orders table uses status pending|paid|fulfilled|canceled (Square is the
// payment source of truth). For the kitchen workflow we layer prep states on top:
//   board "pending" = paid (or pending) orders not yet started
//   board "prep"    = status 'prep'
//   board "ready"   = status 'ready'
// 'fulfilled' is reserved for after loadout/delivery and is not shown on the board.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { now, today, parseJson } from '../../../_lib/hub.js';

function itemCount(itemsJson) {
  const items = parseJson(itemsJson, []) || [];
  if (!Array.isArray(items)) return 0;
  return items.reduce((n, it) => n + (Number(it && it.qty) || 1), 0);
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const surface = url.searchParams.get('surface') === '1';
  const day = url.searchParams.get('date') || today();

  // Pull today's actionable orders. Pending shown so the kitchen can pre-empt; canceled hidden.
  // Show ALL open/actionable orders (not just today's) so nothing silently disappears —
  // the kitchen needs to see and prep upcoming + overdue orders, soonest delivery first.
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders
       WHERE status IN ('pending','paid','prep','ready')
       ORDER BY
         (delivery_date IS NULL), delivery_date ASC,
         CASE delivery_window WHEN 'lunch' THEN 0 WHEN 'dinner' THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT 200`
  ).all();

  const orders = (results || []).map((o) => ({ ...o, item_count: itemCount(o.items) }));

  const board = { pending: [], prep: [], ready: [] };
  for (const o of orders) {
    if (o.status === 'prep') board.prep.push(o);
    else if (o.status === 'ready') board.ready.push(o);
    else board.pending.push(o); // pending | paid
  }

  // Optionally fire order.received for rows the kitchen hasn't been shown yet.
  // One query fetches every already-surfaced order_id (last 7d of order.received events),
  // then we diff in memory — avoids the old O(N) per-pending-order LIKE scan.
  if (surface && board.pending.length) {
    let surfaced = new Set();
    try {
      const since = now() - 7 * 24 * 3600 * 1000;
      const res = await env.DB.prepare(
        "SELECT properties FROM activity_log WHERE event = 'order.received' AND created_at > ? LIMIT 5000"
      ).bind(since).all();
      for (const row of (res && res.results) || []) {
        const m = /"order_id":"([^"]+)"/.exec(row.properties || '');
        if (m) surfaced.add(m[1]);
      }
    } catch { /* if the lookup fails, we just risk re-firing — harmless */ }
    for (const o of board.pending) {
      try {
        if (!surfaced.has(o.id)) {
          await capture(env, {
            event: 'order.received',
            distinct_id: ctx.distinct_id,
            role: ctx.role,
            team: ctx.team,
            properties: { order_id: o.id, item_count: o.item_count, delivery_window: o.delivery_window || null },
          });
          surfaced.add(o.id); // guard against dup within this same response
        }
      } catch { /* best-effort surface */ }
    }
  }

  // The board now includes all open orders (any date), so a separate "incoming" list would
  // duplicate them. Kept as an empty array for frontend compatibility.
  const incoming = [];

  return json({ date: day, board, incoming, counts: {
    pending: board.pending.length, prep: board.prep.length, ready: board.ready.length, incoming: 0,
  } });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const orderId = (b && b.id || '').toString().trim();
  const action = (b && b.action || '').toString().trim();
  if (!orderId) return bad('Missing order id.');
  if (!['prep_start', 'mark_ready'].includes(action)) return bad('Unknown action.');

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return bad('Order not found.', 404);

  const ts = now();

  if (action === 'prep_start') {
    await env.DB.prepare("UPDATE orders SET status = 'prep', updated_at = ? WHERE id = ?")
      .bind(ts, orderId).run();
    await capture(env, {
      event: 'order.prep_started',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { order_id: orderId },
    });
    return json({ ok: true, id: orderId, status: 'prep' });
  }

  // mark_ready — compute prep_minutes from when prep started (updated_at on the prep row)
  // best-effort: fall back to time since order creation.
  let prepMinutes = null;
  const startedFrom = order.status === 'prep' ? Number(order.updated_at) : Number(order.created_at);
  if (startedFrom) prepMinutes = Math.max(0, Math.round((ts - startedFrom) / 60000));

  await env.DB.prepare("UPDATE orders SET status = 'ready', updated_at = ? WHERE id = ?")
    .bind(ts, orderId).run();
  await capture(env, {
    event: 'order.ready',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { order_id: orderId, prep_minutes: prepMinutes },
  });
  return json({ ok: true, id: orderId, status: 'ready', prep_minutes: prepMinutes });
};
