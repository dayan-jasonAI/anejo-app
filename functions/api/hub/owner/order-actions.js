// /api/hub/owner/order-actions — the two write actions the owner Order History never had.
//
//   GET  ?order_id=…                                       → what the owner may do to this order,
//                                                            with captured/refunded amounts read
//                                                            LIVE from Square.
//   POST { op:'cancel', order_id, reason }                 → status 'canceled'. Moves NO money.
//   POST { op:'refund', order_id, reason, amount_cents? }  → Square refund against the captured
//                                                            payment. Full by default; partial
//                                                            when amount_cents is supplied.
//
// Owner-only. Until this existed, a bad order forced Dayan into the Square dashboard, and the
// history view rendered a "Canceled" chip for a status nothing in the HUB could produce.
//
// TWO RULES THIS FILE IS BUILT AROUND
//  1. Square is the source of truth for money. Whether a payment was captured, and how much of it
//     is already refunded, is read FROM SQUARE on every request — never inferred from
//     orders.status, which lags the webhook. If Square won't tell us, we refuse and say so rather
//     than guess: the fallback (the owner refunds in the Square dashboard) is the status quo, and
//     the status quo is far better than a wrong refund.
//  2. Cancel and refund are separate acts. Cancelling a paid order does not return a cent — the
//     response says `money_moved:false` and the UI has to state it out loud.
//  3. Everything this endpoint does NOT undo is REPORTED, never silently half-done. Both ops
//     return `warnings` (see orderSideEffects) naming the awarded rewards points and the affiliate
//     commission the owner still has to adjust by hand.
import { json, bad, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { parseJson } from '../../../_lib/hub.js';
import { square, squareConfigured } from '../../../_lib/square.js';
import { capture } from '../../../_lib/track.js';

// Delivered food can't be un-delivered. Everything short of that is cancelable.
export const CANCELABLE = ['pending', 'paid', 'prep', 'ready'];

export const cancelBlockedReason = (status) =>
  status === 'canceled'
    ? 'This order is already canceled.'
    : `Only an order that has not been delivered can be canceled — this one is "${status}".`;

const sqErr = (r) =>
  (r && r.data && r.data.errors && r.data.errors[0] && (r.data.errors[0].detail || r.data.errors[0].code)) || null;

// A subscription delivery carries a synthetic 'sub_<id>' in square_order_id (see _lib/suborders.js)
// and a manual counter sale carries NULL — neither is a Square order, so neither can be refunded here.
function squareOrderIdOf(row) {
  const sid = typeof row.square_order_id === 'string' ? row.square_order_id : '';
  if (!sid || sid.indexOf('sub_') === 0) return null;
  return sid;
}

// A Square Payment reduced to the only money numbers this endpoint trusts. The refundable ceiling
// is total_money - refunded_money and originates HERE — never from the client's amount_cents, and
// never from orders.total_estimate_cents, which is an estimate written before Square ever saw the
// order (tip, adjustments and partial refunds all move the real number away from it).
export function summarizePayment(pay) {
  // total_money is amount + tip; fall back to the parts if Square omits it.
  const amt = Number(pay && pay.amount_money && pay.amount_money.amount) || 0;
  const tip = Number(pay && pay.tip_money && pay.tip_money.amount) || 0;
  const total = Number(pay && pay.total_money && pay.total_money.amount) || (amt + tip);
  const refunded = Number(pay && pay.refunded_money && pay.refunded_money.amount) || 0;
  return {
    id: (pay && pay.id) || null,
    status: (pay && pay.status) || null,
    captured_cents: total,
    refunded_cents: refunded,
    refundable_cents: Math.max(0, total - refunded),
  };
}

// Resolve the Square payment(s) behind an order.
// The orders table only ever stored square_order_id (checkout.js writes payment_link.order_id), so
// the payment id has to come from Square: the order's tenders ARE the payments that settled it, and
// a tender id is the Payment id. We then re-read the payment and require payment.order_id to match
// before touching it — a refund must never be issued against a payment we merely inferred.
// Returns { payments } or { error }.
async function loadSquarePayments(env, squareOrderId) {
  const ord = await square(env, `/v2/orders/${encodeURIComponent(squareOrderId)}`);
  if (!ord.ok) {
    return { error: sqErr(ord) || `Square could not load order ${squareOrderId} (${ord.status}).` };
  }
  const tenders = (ord.data && ord.data.order && ord.data.order.tenders) || [];
  if (!tenders.length) {
    return { error: 'Square shows no payment on this order — nothing was captured, so there is nothing to refund.' };
  }
  // Split tender is not something a hosted payment link produces, and refunding one leg of a split
  // half-succeeding is a mess we will not author blind. Send the owner to the dashboard instead.
  if (tenders.length > 1) {
    return { error: 'This order was paid with more than one tender. Refund it from the Square dashboard.' };
  }

  const payments = [];
  for (const t of tenders) {
    // A Square Tender exposes an explicit payment_id; tender.id happening to equal it is an
    // implementation coincidence, not the contract — reading the wrong one 404s and would have
    // made the whole refund feature silently inert in production.
    const tenderPaymentId = t && (t.payment_id || t.id);
    if (!tenderPaymentId) return { error: 'Square returned a payment we could not identify. Refund from the Square dashboard.' };
    const pr = await square(env, `/v2/payments/${encodeURIComponent(tenderPaymentId)}`);
    const pay = pr.ok && pr.data && pr.data.payment;
    if (!pay || !pay.id) {
      return { error: sqErr(pr) || `Square could not load the payment for this order (${pr.status}).` };
    }
    if (pay.order_id && pay.order_id !== squareOrderId) {
      return { error: 'The Square payment does not belong to this order. Refund from the Square dashboard.' };
    }
    payments.push(summarizePayment(pay));
  }
  return { payments };
}

// Square caps idempotency_key at 45 chars. Our à-la-carte ids are `ord_<20 hex>` (24), so the
// readable key fits; the hash fallback exists so an unusually long id can never be silently
// TRUNCATED into a collision with a different refund.
//
// The key deliberately includes how much was ALREADY refunded: a double-click sends the same
// amount against the same prior balance → identical key → Square returns the first refund instead
// of issuing a second. A deliberate later partial refund sees a moved balance and gets a new key.
export async function refundKey(orderId, alreadyCents, amountCents) {
  const readable = `rf_${String(orderId).replace(/^ord_/, '')}_${alreadyCents}_${amountCents}`;
  if (readable.length <= 45) return readable;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(readable));
  return 'rf_' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

// Record the action ON the order row. There is no cancellations/refunds table and this change is
// not allowed to ship a migration, so the entry rides in the items JSON as a `meta` entry — the
// same shape manual order entry already writes (see orders.js). Consumers ignore meta entries:
// order-history's item_count filters them out and the kitchen board renders them as a note line.
// This is the on-order trail for a human reading the order; the durable, append-only trail is the
// activity_log row written by capture(). Square remains the source of truth for the money itself.
async function appendOrderMeta(env, orderId, label, meta) {
  try {
    const row = await env.DB.prepare('SELECT items FROM orders WHERE id = ?').bind(orderId).first();
    const items = parseJson(row && row.items, []) || [];
    if (!Array.isArray(items)) return;
    items.push({ id: 'meta', name: label.slice(0, 240), qty: 0, price_cents: 0, meta });
    await env.DB.prepare('UPDATE orders SET items = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(items), now(), orderId).run();
  } catch (_) { /* the activity_log row is the trail that must not be lost; this one is a nicety */ }
}

// Things the owner still has to do BY HAND after cancelling or refunding — surfaced here, never
// silently done. A refund is exactly when awarded points and affiliate commission ought to come
// back, so it is worth stating plainly why this endpoint reports them instead of reversing them:
//
//   • points_ledger carries UNIQUE(order_id, reason), so at most ONE reversal row per order could
//     ever be written — a second partial refund would silently no-op and the owner would never
//     know. Worse, the member's TIER is derived from orders.total_estimate_cents (rewards.js reads
//     lifetime spend from the orders table), and a refund does not move that column, so a negative
//     points row would still leave the member standing on spend we gave back.
//   • rev_share_events has no reversal concept. partners.js sums share_cents by payout_status and
//     the "settle" op flips EVERY pending row to 'paid' — a negative row posted after a payout
//     would be swept into 'paid' and disappear from what the partner still owes back.
//
// Both would be a half-reversal that reads as a whole one. Un-routing a stop belongs to the
// deliveries endpoint, points to the rewards ledger, commission to the partners ledger — so we
// report precisely (amount, partner, payout state, pro-rata share) and let the owner adjust there.
export async function orderSideEffects(env, row, opts = {}) {
  const refunding = opts.action === 'refund';
  const amountCents = Math.max(0, Number(opts.amount_cents) || 0);
  const capturedCents = Math.max(0, Number(opts.captured_cents) || 0);
  // A partial refund makes every downstream figure pro-rata. Say which fraction, so the owner
  // isn't left computing it from the Square dashboard.
  const partial = refunding && capturedCents > 0 && amountCents > 0 && amountCents < capturedCents;
  const share = partial
    ? ` This refund is ${Math.round((amountCents / capturedCents) * 100)}% of the $${(capturedCents / 100).toFixed(2)} captured, so only a pro-rata part of it should come back.`
    : '';
  const warnings = [];

  try {
    const stop = await env.DB.prepare(
      `SELECT rs.route_id, rs.status AS stop_status, r.status AS route_status
         FROM route_stops rs JOIN routes r ON r.id = rs.route_id
        WHERE rs.order_id = ? AND r.status NOT IN ('completed','canceled')
        ORDER BY rs.created_at DESC LIMIT 1`
    ).bind(row.id).first();
    if (stop) {
      warnings.push(refunding
        // Refunding does not cancel: the food is still on a truck unless the owner acts.
        ? `This order is still a stop on route ${stop.route_id} and is NOT canceled — the driver will still deliver it. Cancel it too if the food should not go out.`
        : `This order is still a stop on route ${stop.route_id}. Pull it from Deliveries so the driver isn't sent.`);
    }
  } catch (_) { /* routing tables absent in early envs */ }

  try {
    const pts = await env.DB.prepare("SELECT delta FROM points_ledger WHERE order_id = ? AND reason = 'earn'")
      .bind(row.id).first();
    if (pts && pts.delta) {
      warnings.push(refunding
        ? `${pts.delta} rewards points were awarded for this order and are NOT reversed by a refund — adjust the balance in HUB → Rewards if they should come back.${share}`
        : `${pts.delta} rewards points were already awarded for this order and are not reversed automatically.`);
    }
  } catch (_) { /* rewards absent in early envs */ }

  try {
    const rs = await env.DB.prepare(
      'SELECT trainer_id, share_cents, payout_status FROM rev_share_events WHERE order_id = ?'
    ).bind(row.id).first();
    if (rs && rs.share_cents) {
      const settled = String(rs.payout_status || '') === 'paid';
      warnings.push(
        `$${(rs.share_cents / 100).toFixed(2)} affiliate commission was recorded for partner ${rs.trainer_id} on this order and is NOT clawed back` +
        (settled ? ' — and it has ALREADY been marked paid out.' : '.') +
        ` Adjust it in HUB → Partners.${share}`);
    }
  } catch (_) { /* affiliate tables absent in early envs */ }

  return warnings;
}

// A refund amount from the client, checked against the ONLY ceiling that counts — what Square says
// is still refundable on the payment. Returns { amount_cents } or { error, status }.
// Absent/blank means "all of it"; anything else must be a positive whole number of cents that fits.
export function validateRefundAmount(raw, refundableCents) {
  const ceiling = Math.max(0, Number(refundableCents) || 0);
  if (raw == null || raw === '') return { amount_cents: ceiling };
  const amount = Math.round(Number(raw));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Refund amount must be a positive number of cents.', status: 400 };
  }
  if (amount > ceiling) {
    return { error: `Only $${(ceiling / 100).toFixed(2)} is still refundable on this payment.`, status: 409 };
  }
  return { amount_cents: amount };
}

// How the UI must talk about money after a cancel. money_known is NOT cosmetic: without it, an
// unreachable Square would render as "nothing was captured", and the owner would tell a customer
// they weren't charged when they were.
export function moneyView(rf) {
  const pay = rf && rf.payment;
  return {
    money_known: !!pay,
    money_held_cents: (pay && pay.refundable_cents) || 0,
    money_note: pay ? null : ((rf && rf.reason) || null),
  };
}

async function loadOrder(env, orderId) {
  return env.DB.prepare(
    'SELECT id, square_order_id, items, status, total_estimate_cents, customer_name, customer_email, created_at ' +
    'FROM orders WHERE id = ?'
  ).bind(orderId).first();
}

// Money state for one order: what Square says was captured and refunded, plus WHY a refund is or
// isn't offered. Shared by GET (to draw the buttons) and POST (to guard the write).
// `loadPayments` is injectable so the gating can be exercised without calling Square.
export async function refundState(env, row, loadPayments = loadSquarePayments) {
  const sid = squareOrderIdOf(row);
  if (!sid) {
    return {
      available: false,
      reason: row.square_order_id
        ? 'This is a subscription delivery — the charge lives on the weekly invoice, not on this order. Refund it from Square.'
        : 'This order was entered by hand, so no Square payment exists to refund.',
    };
  }
  if (!squareConfigured(env)) return { available: false, reason: 'Square is not configured in this environment.' };

  const res = await loadPayments(env, sid);
  if (res.error) return { available: false, reason: res.error };

  const p = res.payments[0];
  if (p.status !== 'COMPLETED') {
    return { available: false, reason: `Square reports this payment as ${p.status || 'not completed'} — there is nothing captured to refund.`, payment: p };
  }
  if (p.refundable_cents <= 0) {
    return { available: false, reason: 'This payment is already fully refunded.', payment: p };
  }
  return { available: true, payment: p };
}

// ---------- GET ----------
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const orderId = (new URL(request.url).searchParams.get('order_id') || '').trim();
  if (!orderId) return bad('order_id is required.');

  const row = await loadOrder(env, orderId).catch(() => null);
  if (!row) return bad('Order not found.', 404);

  const rf = await refundState(env, row);
  const cancelable = CANCELABLE.includes(row.status);
  return json({
    ok: true,
    order: { id: row.id, status: row.status, total_cents: row.total_estimate_cents, customer_name: row.customer_name },
    cancel: {
      available: cancelable,
      reason: cancelable ? null : cancelBlockedReason(row.status),
      // Whether cancelling would leave money sitting with us — the UI must say this out loud.
      // money_known is NOT cosmetic: without it, an unreachable Square would render as "nothing was
      // captured", and the owner would tell a customer they weren't charged when they were.
      money_known: !!rf.payment,
      money_held_cents: (rf.payment && rf.payment.refundable_cents) || 0,
      money_note: rf.payment ? null : (rf.reason || null),
    },
    refund: {
      available: !!rf.available,
      reason: rf.reason || null,
      captured_cents: (rf.payment && rf.payment.captured_cents) || 0,
      refunded_cents: (rf.payment && rf.payment.refunded_cents) || 0,
      refundable_cents: (rf.payment && rf.payment.refundable_cents) || 0,
    },
  });
};

// ---------- POST ----------
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const op = (b && b.op || '').toString();
  const orderId = (b && b.order_id || '').toString().trim();
  if (!orderId) return bad('order_id is required.');
  // A reason is mandatory on both ops. This is the record Dayan reads back in six months when a
  // customer disputes a charge; "no reason given" is not an acceptable answer.
  const reason = (b && b.reason || '').toString().trim().slice(0, 192);
  if (!reason) return bad('Give a reason — it is recorded on the order.');

  const row = await loadOrder(env, orderId).catch(() => null);
  if (!row) return bad('Order not found.', 404);

  const actor = String(ctx.email || ctx.distinct_id || 'owner').slice(0, 120);
  const t = now();

  if (op === 'cancel') {
    if (row.status === 'canceled') return json({ ok: true, already: true, id: row.id, status: 'canceled' });
    if (!CANCELABLE.includes(row.status)) return bad(cancelBlockedReason(row.status), 409);

    // Conditional UPDATE: two owners cancelling at once produce exactly one state change.
    const upd = await env.DB.prepare(
      "UPDATE orders SET status='canceled', updated_at=? WHERE id=? AND status<>'canceled'"
    ).bind(t, row.id).run();
    if (!(upd.meta && upd.meta.changes)) return json({ ok: true, already: true, id: row.id, status: 'canceled' });

    await appendOrderMeta(env, row.id, `Canceled by ${actor} — ${reason}`, {
      action: 'cancel', by: actor, at: t, reason, from_status: row.status,
    });

    // Cancelling is a bookkeeping act. If money was captured it is STILL captured — read the live
    // refundable balance so the response can tell the owner exactly how much is still theirs to return.
    const rf = await refundState(env, row);
    const stillHeld = (rf.payment && rf.payment.refundable_cents) || 0;
    const warnings = await cancelSideEffects(env, row);

    await capture(env, {
      event: 'order.canceled',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { order_id: row.id, from_status: row.status, reason, money_held_cents: stillHeld },
    });

    return json({
      ok: true,
      id: row.id,
      status: 'canceled',
      from_status: row.status,
      money_moved: false,
      money_known: !!rf.payment,
      money_held_cents: stillHeld,
      refund_available: !!rf.available,
      warnings,
    });
  }

  if (op === 'refund') {
    if (!squareConfigured(env)) return bad('Square is not configured in this environment.', 503);

    const rf = await refundState(env, row);
    if (!rf.available) return bad(rf.reason || 'This order cannot be refunded here.', 409);
    const pay = rf.payment;

    // Default to the whole remaining balance; a partial amount must be a positive whole number of
    // cents that fits inside what Square says is still refundable.
    let amountCents = pay.refundable_cents;
    if (b && b.amount_cents != null && b.amount_cents !== '') {
      amountCents = Math.round(Number(b.amount_cents));
      if (!Number.isFinite(amountCents) || amountCents <= 0) return bad('Refund amount must be a positive number of cents.');
      if (amountCents > pay.refundable_cents) {
        return bad(`Only $${(pay.refundable_cents / 100).toFixed(2)} is still refundable on this payment.`, 409);
      }
    }

    const key = await refundKey(row.id, pay.refunded_cents, amountCents);
    const r = await square(env, '/v2/refunds', {
      method: 'POST',
      body: {
        idempotency_key: key,
        payment_id: pay.id,
        amount_money: { amount: amountCents, currency: 'USD' },
        reason,
      },
    });
    if (!r.ok) {
      // Nothing local changed — the owner can retry or fall back to the Square dashboard.
      return bad(sqErr(r) || `Square refused the refund (${r.status}).`, 502);
    }
    const refund = (r.data && r.data.refund) || {};
    // HTTP 200 does NOT mean the money moved: Square's refund status can be REJECTED or FAILED.
    // Worse, the idempotency key is deterministic, so retrying replays the SAME failed refund
    // object with a 200 — reporting "Refunded $X" every time while nothing was ever returned.
    const rst = String(refund.status || '').toUpperCase();
    if (rst === 'REJECTED' || rst === 'FAILED') {
      return bad(`Square ${rst.toLowerCase()} this refund — the money was NOT returned. Refund from the Square dashboard.`, 502);
    }

    await appendOrderMeta(env, row.id, `Refunded $${(amountCents / 100).toFixed(2)} by ${actor} — ${reason}`, {
      action: 'refund', by: actor, at: t, reason,
      amount_cents: amountCents, refund_id: refund.id || null, refund_status: refund.status || null,
      payment_id: pay.id, idempotency_key: key,
    });
    await env.DB.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').bind(t, row.id).run().catch(() => {});

    await capture(env, {
      event: 'order.refunded',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: {
        order_id: row.id, amount_cents: amountCents, reason,
        partial: amountCents < pay.refundable_cents,
        refund_id: refund.id || null, refund_status: refund.status || null,
      },
    });

    const refundedTotal = pay.refunded_cents + amountCents;
    return json({
      ok: true,
      id: row.id,
      refund_id: refund.id || null,
      // PENDING is normal — card refunds settle over a few days. The owner should not read that as failure.
      refund_status: refund.status || null,
      amount_cents: amountCents,
      refunded_total_cents: refundedTotal,
      refundable_cents: Math.max(0, pay.captured_cents - refundedTotal),
      status: row.status,
    });
  }

  return bad("Unknown op — expected 'cancel' or 'refund'.");
};
