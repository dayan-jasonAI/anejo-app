// Kitchen live order board.
//   GET  /api/hub/kitchen/orders            → today's actionable orders grouped pending|prep|ready
//   GET  /api/hub/kitchen/orders?surface=1  → also fires order.received for newly-surfaced rows
//   POST /api/hub/kitchen/orders { id, action:'prep_start'|'mark_ready' }
//
// The existing orders table uses status pending|paid|fulfilled|canceled (Square is the
// payment source of truth). For the kitchen workflow we layer prep states on top:
//   board "pending" = PAID orders not yet started
//   board "prep"    = status 'prep'
//   board "ready"   = status 'ready'
// 'fulfilled' is reserved for after loadout/delivery and is not shown on the board.
//
// PAYMENT GATE (Dayan ruling, re-affirmed 2026-07-22): status 'pending' means the checkout was
// created but Square has NOT confirmed payment. Those orders must NEVER reach the kitchen —
// no board row, no prep, no ready. The webhook flips pending→paid on payment confirmation;
// only then does the order surface here. Do not add 'pending' back to the board query.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, now, today, parseJson } from '../../../_lib/hub.js';
import { ensureOrderBowls, fetchBowlsForOrders } from '../../../_lib/orderbowls.js';
import { matchStaffByPin } from '../../../_lib/pinmatch.js';
import { limitOr429 } from '../../../_lib/ratelimit.js';

// Append a row to the PIN-gated kitchen audit trail. Best-effort; never blocks the action.
async function audit(env, { action, orderId, bowlId, staff, viaPin }) {
  try {
    await env.DB.prepare(
      'INSERT INTO kitchen_audit (id, action, order_id, bowl_id, staff_id, staff_name, via_pin, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id('kau'), action, orderId || null, bowlId || null, (staff && staff.id) || null, (staff && staff.name) || null, viaPin ? 1 : 0, now()).run();
  } catch { /* audit is best-effort */ }
}

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

  // Pull actionable orders — payment-confirmed ONLY (see PAYMENT GATE above). Canceled and
  // unpaid-checkout ('pending') rows never surface. Show ALL open/actionable orders (not just
  // today's) so nothing silently disappears — upcoming + overdue, soonest delivery first.
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders
       WHERE status IN ('paid','prep','ready')
         AND kitchen_cleared_at IS NULL
       ORDER BY
         (delivery_date IS NULL), delivery_date ASC,
         CASE delivery_window WHEN 'lunch' THEN 0 WHEN 'dinner' THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT 200`
  ).all();

  const orders = (results || []).map((o) => ({
    ...o,
    item_count: itemCount(o.items),
    is_subscription: !!o.subscription_id, // drives the "Subscription" tag on the board
    is_contract: !!o.contract_site_id,    // B2B contract order (e.g. DGP office lunches)
    is_rush: !!o.is_rush,
  }));

  const board = { pending: [], prep: [], ready: [] };
  for (const o of orders) {
    if (o.status === 'prep') board.prep.push(o);
    else if (o.status === 'ready') board.ready.push(o);
    else board.pending.push(o); // 'paid', not yet started — board "pending" = prep-pending, never payment-pending
  }

  // Attach per-bowl production rows (materialized when an order entered PREP) so the kitchen
  // can check bowls off individually. Orders not yet in prep have none → UI falls back to the
  // items breakdown. One query for the whole board.
  const bowlsByOrder = await fetchBowlsForOrders(env, orders.map((o) => o.id));
  for (const o of orders) o.bowls = bowlsByOrder.get(o.id) || [];

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

  // Orders the kitchen has handed off (cleared) today — so cooks can confirm what's left the line.
  let clearedToday = [];
  try {
    const startOfDay = Date.parse(today() + 'T00:00:00Z');
    const cr = await env.DB.prepare(
      `SELECT o.id, o.customer_name, o.kitchen_cleared_at, s.name AS cleared_by_name
         FROM orders o LEFT JOIN staff s ON s.id = o.kitchen_cleared_by
        WHERE o.kitchen_cleared_at >= ?
        ORDER BY o.kitchen_cleared_at DESC LIMIT 50`
    ).bind(startOfDay).all();
    clearedToday = (cr && cr.results) || [];
  } catch { clearedToday = []; }

  return json({ date: day, board, incoming, cleared_today: clearedToday, counts: {
    pending: board.pending.length, prep: board.prep.length, ready: board.ready.length,
    cleared_today: clearedToday.length, incoming: 0,
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
  if (!['prep_start', 'mark_ready', 'bowl_done', 'bowl_undo', 'kitchen_clear'].includes(action)) return bad('Unknown action.');

  const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return bad('Order not found.', 404);

  // PAYMENT GATE: an unpaid checkout ('pending') or canceled order can never be prepped, checked
  // off, or marked ready — regardless of how the request reached this endpoint.
  if (!['paid', 'prep', 'ready'].includes(order.status)) {
    return bad('Payment has not been confirmed for this order — it cannot go to the kitchen.', 409);
  }

  const ts = now();

  // Check a single bowl off (or undo) during PREP. No PIN here — the PIN gates are on the two
  // state transitions (prep_start and mark_ready); per-bowl check-offs are quick taps attributed
  // to the signed-in cook so prepping a multi-bowl order isn't a string of PIN prompts.
  if (action === 'bowl_done' || action === 'bowl_undo') {
    const bowlId = (b && b.bowl_id || '').toString().trim();
    const seq = Number(b && b.seq);
    if (!bowlId && !Number.isInteger(seq)) return bad('Missing bowl_id or seq.');
    const done = action === 'bowl_done';

    const actor = await currentStaff(env, request); // attributed to the signed-in session cook
    const viaPin = false;

    const where = bowlId ? 'id = ?' : 'order_id = ? AND seq = ?';
    const binds = bowlId ? [bowlId] : [orderId, seq];
    const res = await env.DB.prepare(
      `UPDATE order_bowls SET prep_state = ?, prep_by = ?, prep_at = ?, updated_at = ? WHERE ${where}`
    ).bind(done ? 'done' : 'pending', done && actor ? actor.id : null, done ? ts : null, ts, ...binds).run();
    if (!res || !res.meta || !res.meta.changes) return bad('Bowl not found.', 404);

    await audit(env, { action: done ? 'bowl_checked' : 'bowl_unchecked', orderId, bowlId: bowlId || null, staff: actor, viaPin });
    await capture(env, {
      event: 'order.bowl_checked',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { order_id: orderId, state: done ? 'done' : 'pending', via_pin: viaPin },
    });
    return json({ ok: true, order_id: orderId, state: done ? 'done' : 'pending', by: actor && actor.name });
  }

  // prep_start — PIN-gated (pending → prep). Requires the cook's PIN, attributed + audited, so
  // every order's prep has an accountable owner the moment it leaves the queue.
  if (action === 'prep_start') {
    const limited = await limitOr429(env, request, { name: 'kitchen-pin', limit: 20, windowSec: 60 });
    if (limited) return limited;
    const startedBy = await matchStaffByPin(env, (b && b.pin || '').toString(), { roles: ['kitchen', 'owner'] });
    if (!startedBy) return bad('PIN not recognized.', 401);

    await env.DB.prepare("UPDATE orders SET status = 'prep', updated_at = ? WHERE id = ?")
      .bind(ts, orderId).run();
    await ensureOrderBowls(env, order); // materialize the per-bowl check-off rows
    await audit(env, { action: 'prep_start', orderId, bowlId: null, staff: startedBy, viaPin: true });
    await capture(env, {
      event: 'order.prep_started',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { order_id: orderId, via_pin: true },
    });
    return json({ ok: true, id: orderId, status: 'prep', by: startedBy.name });
  }

  // kitchen_clear — PIN-gated (ready → handed off). The 3rd PIN: a cook confirms the built order
  // has left the kitchen for loadout, which clears it OFF the board. We keep status='ready' so the
  // routing/delivery flow is untouched; we stamp who cleared it + when, and audit it.
  if (action === 'kitchen_clear') {
    const limited = await limitOr429(env, request, { name: 'kitchen-pin', limit: 20, windowSec: 60 });
    if (limited) return limited;
    const clearedBy = await matchStaffByPin(env, (b && b.pin || '').toString(), { roles: ['kitchen', 'owner'] });
    if (!clearedBy) return bad('PIN not recognized.', 401);
    if (order.status !== 'ready') return bad('Only a ready order can be handed off.', 409);

    await env.DB.prepare("UPDATE orders SET kitchen_cleared_at = ?, kitchen_cleared_by = ?, updated_at = ? WHERE id = ?")
      .bind(ts, clearedBy.id, ts, orderId).run();
    await audit(env, { action: 'kitchen_clear', orderId, bowlId: null, staff: clearedBy, viaPin: true });
    await capture(env, {
      event: 'order.kitchen_cleared',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { order_id: orderId, via_pin: true },
    });
    return json({ ok: true, id: orderId, cleared: true, by: clearedBy.name });
  }

  // mark_ready — PIN-gated. Requires the cook's PIN (attributed + audited) and that EVERY bowl
  // has been checked off first (READY means the whole order is built).
  const limited = await limitOr429(env, request, { name: 'kitchen-pin', limit: 20, windowSec: 60 });
  if (limited) return limited;
  const readyBy = await matchStaffByPin(env, (b && b.pin || '').toString(), { roles: ['kitchen', 'owner'] });
  if (!readyBy) return bad('PIN not recognized.', 401);

  const bowls = await fetchBowlsForOrders(env, [orderId]);
  const list = bowls.get(orderId) || [];
  const pending = list.filter((bw) => bw.prep_state !== 'done').length;
  if (list.length && pending > 0) {
    return bad(`${pending} of ${list.length} bowls still need to be checked off before this order is ready.`, 409);
  }

  // prep_minutes from when prep started (best-effort; fall back to time since creation).
  let prepMinutes = null;
  const startedFrom = order.status === 'prep' ? Number(order.updated_at) : Number(order.created_at);
  if (startedFrom) prepMinutes = Math.max(0, Math.round((ts - startedFrom) / 60000));

  await env.DB.prepare("UPDATE orders SET status = 'ready', updated_at = ? WHERE id = ?")
    .bind(ts, orderId).run();
  await audit(env, { action: 'mark_ready', orderId, bowlId: null, staff: readyBy, viaPin: true });
  await capture(env, {
    event: 'order.ready',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { order_id: orderId, prep_minutes: prepMinutes, via_pin: true },
  });
  return json({ ok: true, id: orderId, status: 'ready', prep_minutes: prepMinutes, by: readyBy.name });
};
