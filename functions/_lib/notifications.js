// Customer notifications — one call, two channels, never sent twice.
// Files under _lib are NOT routed.
//
// Channel order is deliberate:
//   1) PUSH, if they have enabled it. Free, instant, and it renders on the lock screen.
//   2) SMS, otherwise — via the existing consent-gated notify.js path.
// On iPhone, web push only works once the site is added to the Home Screen, so for most customers
// SMS is not a degraded fallback, it IS the channel. Push is the upgrade for those who install.
//
// DEDUPE IS THE POINT. Order status is written by several independent paths — the Square webhook,
// the kitchen board, the driver app, a manual owner edit — and more than one can land on the same
// status. `notifications.dedupe_key` is UNIQUE, so "order X reached ready" notifies exactly once
// however many times something re-writes that status. Getting told your food is ready four times
// is how people turn notifications off.
import { id, now } from './util.js';
import { sendPushToEmail } from './push.js';

const key = (e) => String(e == null ? '' : e).trim().toLowerCase();

/**
 * Queue a notification and deliver it.
 *
 * `dedupeKey` is the contract: the same key never fires twice, ever. Pass something derived from
 * the FACT, not the moment — 'order:ord_123:ready', not 'order:ord_123:' + Date.now().
 *
 * Returns { ok, sent, channel, duplicate } and NEVER throws: a notification failing must not take
 * down the order flow that triggered it.
 */
export async function notifyCustomer(env, { email, dedupeKey, kind = 'order', title, body, url, orderId, smsFallback } = {}) {
  const em = key(email);
  if (!env || !env.DB || !em || !dedupeKey || !title) return { ok: false, sent: false, channel: 'none' };

  // Claim the key FIRST. The UNIQUE constraint is the lock: if the insert fails, someone else
  // already owns this notification and we must not send a second one. Doing this before any
  // send is what makes two concurrent status writes safe.
  const rowId = id('ntf');
  try {
    await env.DB.prepare(
      'INSERT INTO notifications (id, email, dedupe_key, kind, title, body, url, order_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(rowId, em, String(dedupeKey), kind, String(title).slice(0, 120),
      body ? String(body).slice(0, 300) : null, url || null, orderId || null, now()).run();
  } catch {
    return { ok: true, sent: false, channel: 'none', duplicate: true };
  }

  // 1) Push. sent === 0 simply means they have not enabled it — the normal case, not an error.
  let channel = 'none';
  try {
    const r = await sendPushToEmail(env, em);
    if (r && r.sent > 0) channel = 'push';
  } catch { /* fall through to SMS */ }

  // 2) SMS fallback, only when push did not reach anyone. The caller supplies it because the
  //    consent rules and copy live with the existing notify.js helpers.
  if (channel === 'none' && typeof smsFallback === 'function') {
    try {
      const r = await smsFallback();
      if (r !== false) channel = 'sms';
    } catch { /* nothing reached them; the row still records the attempt */ }
  }

  try {
    await env.DB.prepare('UPDATE notifications SET channel = ? WHERE id = ?').bind(channel, rowId).run();
  } catch { /* best-effort */ }

  return { ok: true, sent: channel !== 'none', channel };
}

/**
 * What a woken service worker should render for this subscription, oldest first.
 * Marked delivered as it is handed over so a second wake does not re-render it.
 */
export async function pendingFor(env, addr, limit = 3) {
  const em = key(addr);
  if (!env || !env.DB || !em) return [];
  let rows = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, title, body, url, kind FROM notifications WHERE email = ? AND delivered_at IS NULL ORDER BY created_at ASC LIMIT ?'
    ).bind(em, Math.min(10, Math.max(1, limit))).all();
    rows = (r && r.results) || [];
  } catch { return []; }

  for (const row of rows) {
    try { await env.DB.prepare('UPDATE notifications SET delivered_at = ? WHERE id = ?').bind(now(), row.id).run(); }
    catch { /* it may render twice rather than never — the lesser failure */ }
  }
  return rows;
}

// The customer-facing moments, in the words a customer would use. Kitchen-internal steps
// ('prep') are deliberately absent: they cannot act on them, and every extra buzz costs
// attention on the ones that matter.
export const ORDER_EVENTS = {
  paid: { title: 'Order confirmed', body: (o) => `We've got your order${o && o.delivery_date ? ` for ${o.delivery_date}` : ''}. We'll tell you when it's on the way.` },
  out_for_delivery: { title: 'On the way', body: () => 'Your driver has your order and is heading your way.' },
  approaching: { title: 'Almost there', body: () => 'Your driver is a couple of minutes away.' },
  delivered: { title: 'Delivered', body: () => 'Enjoy — tap to rate your order.' },
};
