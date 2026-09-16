// Kitchen live order board.
//   GET  /api/hub/kitchen/orders            → today's actionable orders grouped pending|prep|ready
//   GET  /api/hub/kitchen/orders?surface=1  → also fires order.received for newly-surfaced rows
//   POST /api/hub/kitchen/orders { id, action:'prep_start'|'mark_ready'|'bowl_done'|'bowl_undo'|'kitchen_clear' }
//   POST /api/hub/kitchen/orders { id, action:'photo', kind:'contents'|'packed', data_url }
//
// Mark ready needs both photos (kitchen-photos.js). Each board order also carries `photos` and
// `timing` — start-by, ready-by and the running prep clock (kitchen-timing.js).
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
import { loadMenu, planRotationWarnings } from '../../../_lib/menu.js';
import { markKitchenReady } from '../../../_lib/kitchen-ready.js';
import { putMedia } from '../../../_lib/media.js';
import { PHOTO_KINDS, currentPhotosByOrder, photoUrl } from '../../../_lib/kitchen-photos.js';
import { loadKitchenTiming, loadPrepMinutes, loadSiteWindows, orderTiming } from '../../../_lib/kitchen-timing.js';

const PHOTO_LABEL = { contents: 'inside the container / adentro del envase', packed: 'closed and packed / cerrado y empacado' };

// Append a row to the PIN-gated kitchen audit trail. Best-effort; never blocks the action.
async function audit(env, { action, orderId, bowlId, staff, viaPin }) {
  try {
    await env.DB.prepare(
      'INSERT INTO kitchen_audit (id, action, order_id, bowl_id, staff_id, staff_name, via_pin, created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(id('kau'), action, orderId || null, bowlId || null, (staff && staff.id) || null, (staff && staff.name) || null, viaPin ? 1 : 0, now()).run();
  } catch { /* audit is best-effort */ }
}

function itemCount(items) {
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

  // Loaded once for the whole board: rotation-sold-out is a LIVE check (a bowl can run out
  // mid-shift, well after this ticket printed), not something baked into the order row at
  // creation time. See planRotationWarnings() for why it never touches à-la-carte items.
  const menu = await loadMenu(env);

  const orders = (results || []).map((o) => {
    const items = parseJson(o.items, []) || [];
    return {
      ...o,
      item_count: itemCount(items),
      is_subscription: !!o.subscription_id, // drives the "Subscription" tag on the board
      is_contract: !!o.contract_site_id,    // B2B contract order (e.g. DGP office lunches)
      is_rush: !!o.is_rush,
      // Report only — see menu.js. Rendering decides how loud to be; nothing here substitutes,
      // reorders, or hides the order for being on this list.
      rotation_warnings: planRotationWarnings(items, menu),
    };
  });

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

  // The two ready photos and the prep clock. Best-effort on the board: a lookup that fails shows no
  // photos and no timer, and the ready gate still refuses without photos, so nothing slips through.
  let photosByOrder = new Map();
  try { photosByOrder = await currentPhotosByOrder(env, orders.map((o) => o.id)); } catch { /* not migrated yet */ }
  const [timing, prepById, siteWindows] = await Promise.all([
    loadKitchenTiming(env),
    loadPrepMinutes(env),
    loadSiteWindows(env, orders.map((o) => o.contract_site_id)),
  ]);
  const atMs = now();
  for (const o of orders) {
    o.photos = photosByOrder.get(o.id) || {};
    o.timing = orderTiming({
      order: o, items: parseJson(o.items, []) || [], prepById,
      siteLabel: siteWindows.get(o.contract_site_id) || null, timing, atMs,
    });
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
  if (!['prep_start', 'mark_ready', 'bowl_done', 'bowl_undo', 'kitchen_clear', 'photo'].includes(action)) return bad('Unknown action.');

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
    if (order.status === 'ready') return bad('This order is already ready. / Este pedido ya está listo.', 409);
    const bowlId = (b && b.bowl_id || '').toString().trim();
    const seq = Number(b && b.seq);
    if (!bowlId && !Number.isInteger(seq)) return bad('Missing bowl_id or seq.');
    const done = action === 'bowl_done';

    const actor = await currentStaff(env, request); // attributed to the signed-in session cook
    const viaPin = false;

    const where = bowlId ? 'id = ? AND order_id = ?' : 'order_id = ? AND seq = ?';
    const binds = bowlId ? [bowlId, orderId] : [orderId, seq];
    const res = await env.DB.prepare(
      `UPDATE order_bowls SET prep_state = ?, prep_by = ?, prep_at = ?, updated_at = ? WHERE ${where}
        AND EXISTS (SELECT 1 FROM orders WHERE id=order_bowls.order_id AND status IN ('paid','prep'))`
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

  // photo — the "inside" or "packed" photo, taken during PREP. No PIN, like a bowl check-off: it is
  // attributed to the signed-in cook, and the PIN still gates Mark ready itself. A photo only counts
  // once it is really stored: putMedia reports stored:false when the bucket is missing, and the
  // driver's flow falls back to keeping the image inline. Here that fallback would let an order be
  // ready with a photo nobody can open, so it is refused instead.
  if (action === 'photo') {
    const kind = (b && b.kind || '').toString();
    if (!PHOTO_KINDS.includes(kind)) return bad('Photo kind must be "contents" or "packed".');
    if (order.status !== 'prep') return bad('Start prep first. Photos are taken while the order is packed. / Primero inicia la preparación. Las fotos se toman al empacar.', 409);
    const dataUrl = (b && b.data_url || '').toString();
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl)) return bad('Send a JPEG, PNG or WebP photo. / Envía una foto JPEG, PNG o WebP.');

    const actor = await currentStaff(env, request);
    const put = await putMedia(env, { kind: 'kitchen', dataUrl, role: kind });
    if (!put || !put.stored) {
      return put && put.error === 'too_large'
        ? bad('That photo is too large. Please retake it. / La foto es muy grande. Tómala de nuevo.', 413)
        : bad('The photo could not be saved. Please retake it. / No se pudo guardar la foto. Tómala de nuevo.', 503);
    }
    await env.DB.batch([
      env.DB.prepare('UPDATE kitchen_photos SET superseded_at = ? WHERE order_id = ? AND kind = ? AND superseded_at IS NULL')
        .bind(ts, orderId, kind),
      env.DB.prepare(
        'INSERT INTO kitchen_photos (id, order_id, kind, media_key, taken_by, taken_by_name, taken_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(id('kph'), orderId, kind, put.key, (actor && actor.id) || null, (actor && actor.name) || null, ts),
    ]);
    await audit(env, { action: `photo_${kind}`, orderId, bowlId: null, staff: actor, viaPin: false });
    return json({ ok: true, order_id: orderId, kind, url: photoUrl(put.key), taken_at: ts, by: actor && actor.name });
  }

  // prep_start — PIN-gated (pending → prep). Requires the cook's PIN, attributed + audited, so
  // every order's prep has an accountable owner the moment it leaves the queue.
  if (action === 'prep_start') {
    if (order.status === 'ready') return bad('This order is already ready. / Este pedido ya está listo.', 409);
    const limited = await limitOr429(env, request, { name: 'kitchen-pin', limit: 20, windowSec: 60 });
    if (limited) return limited;
    const startedBy = await matchStaffByPin(env, (b && b.pin || '').toString(), { roles: ['kitchen', 'owner'] });
    if (!startedBy) return bad('PIN not recognized.', 401);

    // prep_started_at is the prep clock's start. COALESCE keeps the first start if Start prep is
    // pressed again, so the timer never resets on a double tap.
    const prepUpdate = await env.DB.prepare("UPDATE orders SET status = 'prep', prep_started_at = COALESCE(prep_started_at, ?), updated_at = ? WHERE id = ? AND status IN ('paid','prep')")
      .bind(ts, ts, orderId).run();
    if (!prepUpdate?.meta?.changes) return bad('Order changed. Refresh the board. / El pedido cambió. Actualiza el tablero.', 409);
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

  // Both photos, before the PIN-checked transition. The same rule is inside markKitchenReady's
  // UPDATE; this check exists to tell the cook WHICH photo is missing.
  const photos = (await currentPhotosByOrder(env, [orderId])).get(orderId) || {};
  const missingPhotos = PHOTO_KINDS.filter((k) => !photos[k]);
  if (missingPhotos.length) {
    return json({
      ok: false,
      error: `Take the photo ${missingPhotos.map((k) => PHOTO_LABEL[k]).join(' and ')} before marking ready. / Toma la foto antes de marcar listo.`,
      missing_photos: missingPhotos,
    }, 409);
  }

  // prep_minutes from when prep started. prep_started_at is exact; updated_at is the fallback for
  // orders started before it existed, and moves on any later write.
  let prepMinutes = null;
  const startedFrom = Number(order.prep_started_at) || (order.status === 'prep' ? Number(order.updated_at) : Number(order.created_at));
  if (startedFrom) prepMinutes = Math.max(0, Math.round((ts - startedFrom) / 60000));

  let receipt;
  try { receipt = await markKitchenReady(env, order, ts); }
  catch {
    return bad('Could not save readiness and the owner alert. Please retry. / No se pudo guardar el estado y la alerta. Inténtalo de nuevo.', 503);
  }
  if (!receipt.changed) {
    const current = await env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(orderId).first();
    if (current?.status === 'ready') return json({ ok: true, id: orderId, status: 'ready', already: true });
    return bad('Order changed. Refresh and check all items before trying again. / El pedido cambió. Actualiza y revisa todos los artículos antes de volver a intentar.', 409);
  }
  await audit(env, { action: 'mark_ready', orderId, bowlId: null, staff: readyBy, viaPin: true });
  await capture(env, {
    event: 'order.ready',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { order_id: orderId, prep_minutes: prepMinutes, via_pin: true },
  });
  return json({ ok: true, id: orderId, status: 'ready', prep_minutes: prepMinutes, by: readyBy.name, alert_id: receipt.alert_id });
};
