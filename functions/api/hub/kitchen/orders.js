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
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders
       WHERE (delivery_date = ? OR delivery_date IS NULL)
         AND status IN ('pending','paid','prep','ready')
       ORDER BY
         CASE delivery_window WHEN 'lunch' THEN 0 WHEN 'dinner' THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT 200`
  ).bind(day).all();

  const orders = (results || []).map((o) => ({ ...o, item_count: itemCount(o.items) }));

  const board = { pending: [], prep: [], ready: [] };
  for (const o of orders) {
    if (o.status === 'prep') board.prep.push(o);
    else if (o.status === 'ready') board.ready.push(o);
    else board.pending.push(o); // pending | paid
  }

  // Optionally fire order.received for rows the kitchen hasn't been shown yet.
  // We mark "surfaced" by writing a sentinel into activity_log; to keep it cheap we
  // only surface paid+pending rows created in the last 24h that have no prior order.received.
  if (surface && board.pending.length) {
    for (const o of board.pending) {
      try {
        const seen = await env.DB.prepare(
          "SELECT 1 FROM activity_log WHERE event = 'order.received' AND properties LIKE ? LIMIT 1"
        ).bind(`%"order_id":"${o.id}"%`).first();
        if (!seen) {
          await capture(env, {
            event: 'order.received',
            distinct_id: ctx.distinct_id,
            role: ctx.role,
            team: ctx.team,
            properties: { order_id: o.id, item_count: o.item_count, delivery_window: o.delivery_window || null },
          });
        }
      } catch { /* best-effort surface */ }
    }
  }

  return json({ date: day, board, counts: {
    pending: board.pending.length, prep: board.prep.length, ready: board.ready.length,
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
