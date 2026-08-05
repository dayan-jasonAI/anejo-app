// Customer delivery notifications — consent-gated, no-op safe, and never throws.
//
// Channel priority for each notice:
//   1) Consented mobile → SMS (or MMS when a photo is attached). We only text a number that
//      opted in: either the order's own captured number (à-la-carte) or a consented client row.
//   2) No consented phone → email fallback (Resend), if we have an address + RESEND is set.
//   3) Otherwise nothing (sandbox / no creds → sendSms no-ops to sms_log).
// A2P 10DLC: never text without explicit opt-in.
import { sendSms, sendMms } from './twilio.js';
import { sendEmail, emailShell, escHtml } from './email.js';
import { notifyCustomer, ORDER_EVENTS } from './notifications.js';
import { now } from './hub.js';

const BRAND = 'Añejo Catering Co.';
const STOP = 'Reply STOP to opt out.';

// Resolve where to reach the customer for one order: a consented phone (order first, then a
// consented client by email), the email, and a display name.
async function contactForOrder(env, order) {
  if (!order) return null;
  const email = ((order.customer_email || '') + '').trim().toLowerCase() || null;
  const name = ((order.customer_name || '') + '').trim() || null;
  let phone = null, clientId = null;

  // 1) Phone captured on the order itself (à-la-carte) WITH consent.
  if ((order.sms_consent === 1 || order.sms_consent === true) && order.customer_phone) {
    phone = order.customer_phone;
  }
  // 2) Else a consented client matched by email.
  if (!phone && email && env.DB) {
    try {
      const c = await env.DB
        .prepare("SELECT id, phone FROM clients WHERE lower(email)=? AND phone IS NOT NULL AND phone<>'' AND sms_consent=1 ORDER BY created_at DESC LIMIT 1")
        .bind(email).first();
      if (c) { phone = c.phone; clientId = c.id; }
    } catch { /* ignore */ }
  }
  return { phone, email, name, clientId };
}

// Send one notice across the best available channel. mediaUrl (photo) → MMS, with an automatic
// fallback to plain SMS (link appended) if MMS can't be delivered.
async function deliver(env, contact, { sms, mediaUrl, emailSubject, emailHtml }) {
  if (!contact) return { sent: false };
  if (contact.phone) {
    if (mediaUrl) {
      const r = await sendMms(env, { to: contact.phone, body: sms, mediaUrl });
      if (r && (r.ok || r.noop)) return { sent: true, channel: r.noop ? 'noop' : 'mms' };
      // MMS rejected (carrier / non-MMS number) → retry as SMS with the photo link inline.
      const link = Array.isArray(mediaUrl) ? mediaUrl[0] : mediaUrl;
      await sendSms(env, { to: contact.phone, body: `${sms} ${link}` });
      return { sent: true, channel: 'sms-fallback' };
    }
    await sendSms(env, { to: contact.phone, body: sms });
    return { sent: true, channel: 'sms' };
  }
  // No consented phone → email fallback.
  if (contact.email && env.RESEND_API_KEY && emailSubject && emailHtml) {
    try { await sendEmail(env, { to: contact.email, subject: emailSubject, html: emailHtml }); return { sent: true, channel: 'email' }; }
    catch { /* ignore */ }
  }
  return { sent: false };
}

const emailWrap = (heading, bodyHtml) => emailShell(
  `<h1 style="color:#1A3D2E;font-family:Georgia,serif">${escHtml(heading)}</h1>${bodyHtml}`
);

// ── Per-stop fulfillment notices ──────────────────────────────────────────────

// Fired when the driver starts navigating to THIS stop. etaText MUST be omitted (null/undefined)
// unless it was computed from a real, fresh driver GPS fix (see stop.js's `confident` flag) — a
// specific-sounding time built from a stale position or the kitchen-origin fallback is how a
// driver 3 minutes away got quoted a ~35-minute drive on 2026-08-04. No etaText still sends a
// true, useful notice: the order left, and a second text follows when the driver is close.
export async function notifyOnTheWay(env, order, etaText) {
  try {
    const c = await contactForOrder(env, order);
    if (!c) return;
    const hi = c.name ? `Hi ${c.name} — ` : '';
    const eta = etaText ? `Estimated arrival around ${etaText}. ` : '';
    await deliver(env, c, {
      sms: `${BRAND}: ${hi}your order is on the way! ${eta}We'll text you when the driver is a few minutes out. ${STOP}`,
      emailSubject: `Your ${BRAND} order is on the way`,
      emailHtml: emailWrap('Your order is on the way', `<p>${hi || 'Hi — '}your Añejo order just left for delivery.</p>${eta ? `<p><strong>${escHtml(eta)}</strong></p>` : ''}<p>We'll let you know the moment it's delivered.</p>`),
    });
  } catch { /* a notification must never break the driver's flow */ }
}

// Fired ~10–15 min out (auto from live GPS ETA, or the driver's manual "Arriving soon").
// etaText is only ever a specific number when it came from a real, fresh GPS fix (the auto
// trigger in location.js always is; the manual button in stop.js is gated the same way). A stale
// or missing position must never manufacture one here — the old `|| '10 minutes'` default did
// exactly that: a driver could tap "Arriving soon" with no usable fix and the customer would be
// told a precise-sounding "about 10 minutes" that had no basis at all. No etaText still means
// something true and worth sending (that's why this fired): the driver is close by.
export async function notifyArrivingSoon(env, order, etaText) {
  try {
    const c = await contactForOrder(env, order);
    if (!c) return;
    const near = etaText ? `about ${etaText} away` : 'close by';
    await deliver(env, c, {
      sms: `${BRAND}: Your driver is ${near} with your order. ${STOP}`,
      emailSubject: `Your ${BRAND} order is arriving soon`,
      emailHtml: emailWrap('Arriving soon', `<p>Your driver is <strong>${escHtml(near)}</strong>.</p>`),
    });
  } catch { /* best-effort */ }
}

// Fired after an order is paid: tell the customer the Añejo Rewards points they just earned.
export async function notifyPointsEarned(env, order, { points, balance, tierName, nextTier, toNextDollars } = {}) {
  try {
    if (!points || points <= 0) return;
    const c = await contactForOrder(env, order);
    if (!c) return;
    const hi = c.name ? `Hi ${c.name} — ` : '';
    const bal = balance != null ? ` You're at ${balance} pts` + (tierName ? ` (${tierName})` : '') + '.' : '';
    const nxt = (nextTier && toNextDollars) ? ` $${toNextDollars} more to ${nextTier}.` : '';
    await deliver(env, c, {
      sms: `${BRAND}: ${hi}you earned ${points} Añejo Rewards points!${bal}${nxt} ${STOP}`,
      emailSubject: `You earned ${points} Añejo Rewards points`,
      emailHtml: emailWrap('You earned points!', `<p>${hi || 'Hi — '}thanks for your order — you just earned <strong>${points} points</strong>.${escHtml(bal)}${escHtml(nxt)}</p><p>See your balance anytime in your account.</p>`),
    });
  } catch { /* a notification must never break the webhook */ }
}

// Fired on drop-off. photoUrl = public proof photo (MMS media + email image). feedbackUrl = the
// "how did we do?" smart-rating page.
export async function notifyDelivered(env, order, { photoUrl, feedbackUrl } = {}) {
  try {
    const c = await contactForOrder(env, order);
    if (!c) return;
    const hi = c.name ? `${c.name}, ` : '';
    const fb = feedbackUrl ? ` How did we do? ${feedbackUrl}` : '';
    const photoEmail = photoUrl ? `<p><img src="${escHtml(photoUrl)}" alt="Proof of delivery" style="max-width:100%;border-radius:10px"></p>` : '';
    const fbEmail = feedbackUrl ? `<p><a href="${escHtml(feedbackUrl)}" style="display:inline-block;background:#C6A85B;color:#0D0D0D;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">How did we do?</a></p>` : '';
    await deliver(env, c, {
      sms: `${BRAND}: Delivered — enjoy, ${hi || 'thank you'}! Photo proof attached.${fb} ${STOP}`,
      mediaUrl: photoUrl || null,
      emailSubject: `Your ${BRAND} order was just delivered`,
      emailHtml: emailWrap('Delivered', `<p>${hi ? escHtml(hi) : ''}your order was just delivered — enjoy!</p>${photoEmail}${fbEmail}`),
    });
  } catch { /* best-effort */ }
}

// ── The Google review ask ─────────────────────────────────────────────────────
//
// Fires ONCE per order, on delivery, and only when the owner has set reviews.google_url in
// app_settings — dormant until then, because inventing a review link would send customers to
// nothing. Deliberately EMAIL-ONLY and gentle: the ask rides the moment the food landed, offers a
// reply path for problems BEFORE the public button, and never fires twice — a repeated review
// nag is how a five-star experience becomes a three-star review.
export async function askForReview(env, order) {
  try {
    if (!env || !env.DB || !order) return;
    const em = ((order.customer_email || '') + '').trim().toLowerCase();
    if (!em) return;
    let url = '';
    try {
      const r = await env.DB.prepare("SELECT value FROM app_settings WHERE key='reviews.google_url'").first();
      url = String((r && r.value) || '').trim();
    } catch { return; }
    if (!/^https:\/\//.test(url)) return;   // unset or malformed → dormant, never a broken link

    // The ledger row IS the dedupe: a fixed id per order means the second caller's INSERT changes
    // nothing and no second email leaves.
    const claim = await env.DB.prepare(
      "INSERT OR IGNORE INTO notifications (id, email, kind, title, body, url, created_at) VALUES (?,?,?,?,?,?,?)"
    ).bind(`ntf_review_${order.id}`, em, 'review', 'How was everything?', 'Review request sent', url, now()).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) return;

    const first = ((order.customer_name || '') + '').trim().split(/\s+/)[0];
    await sendEmail(env, {
      to: em,
      subject: 'How was everything? ⭐',
      html: emailWrap('How was everything?',
        `<p>${first ? `Hi ${escHtml(first)} — ` : 'Hi — '}your Añejo order was just delivered, and we genuinely want to know how it landed.</p>` +
        `<p>If anything wasn't right, <strong>just reply to this email</strong> — a human reads every one and we'll make it right.</p>` +
        `<p>And if we earned it, a Google review takes about 30 seconds and means the world to a young kitchen:</p>` +
        `<p style="text-align:center;margin:26px 0"><a href="${escHtml(url)}" style="background:#C08418;color:#fff;text-decoration:none;padding:13px 28px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px">⭐ Rate us on Google</a></p>` +
        `<p style="font-size:13px;color:#8a8a8a">Thank you for eating with us — Dayan &amp; the Añejo kitchen.</p>`),
    });
  } catch { /* never let a review ask break a delivery flow */ }
}

// ── Legacy helpers (used by the Square webhook + subscriptions) ────────────────

const BODY = {
  out_for_delivery: `${BRAND}: Your order is out for delivery and on the way today. ${STOP}`,
  delivered: `${BRAND}: Your order was just delivered — enjoy! ${STOP}`,
};

// PUSH FIRST, SMS SECOND — and exactly once either way.
//
// Push is free, instant, and renders on the lock screen; SMS costs money and is the channel that
// reaches the iPhone customers who have not added the site to their Home Screen (where Apple
// gives web push no other way in). Routing both through notifyCustomer() means the dedupe key is
// shared, so a status written twice by two different code paths still notifies once — on ONE
// channel, not one of each.
export async function notifyOrderDelivery(env, order, kind) {
  try {
    if (!env || !env.DB || !order || !BODY[kind]) return;
    // The review ask rides the delivered moment — fire-and-forget, its own guards inside.
    if (kind === 'delivered') askForReview(env, order).catch(() => {});
    const c = await contactForOrder(env, order);
    const em = ((order.customer_email || '') + '').trim().toLowerCase();
    const ev = ORDER_EVENTS[kind];

    // No email means no way to look up a push subscription or to de-duplicate — fall back to the
    // original behaviour rather than dropping the notice.
    if (!em || !ev) {
      if (c && c.phone) await sendSms(env, { to: c.phone, body: BODY[kind] });
      return;
    }

    await notifyCustomer(env, {
      email: em,
      dedupeKey: `order:${order.id}:${kind}`,
      kind: 'order',
      title: ev.title,
      body: ev.body(order),
      url: '/account',
      orderId: order.id,
      // Only runs when push reached nobody. Returning false keeps the row honest about the fact
      // that nothing actually left the building.
      smsFallback: async () => {
        if (!c || !c.phone) return false;
        await sendSms(env, { to: c.phone, body: BODY[kind] });
        return true;
      },
    });
  } catch { /* never break the caller */ }
}

export async function notifyClientById(env, clientId, body) {
  try {
    if (!env || !env.DB || !clientId || !body) return;
    const c = await env.DB
      .prepare("SELECT phone FROM clients WHERE id=? AND phone IS NOT NULL AND phone<>'' AND sms_consent=1 LIMIT 1")
      .bind(clientId).first();
    if (!c || !c.phone) return;
    await sendSms(env, { to: c.phone, body });
  } catch { /* never fail the caller */ }
}

export async function notifyRouteOutForDelivery(env, routeId) {
  try {
    if (!env || !env.DB || !routeId) return;
    const res = await env.DB
      .prepare("SELECT o.* FROM route_stops rs JOIN orders o ON o.id = rs.order_id WHERE rs.route_id=? AND rs.status IN ('pending','arrived')")
      .bind(routeId).all();
    for (const order of (res && res.results) || []) {
      await notifyOrderDelivery(env, order, 'out_for_delivery');
    }
  } catch { /* best-effort */ }
}
