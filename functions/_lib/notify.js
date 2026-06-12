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

// Fired when the driver starts navigating to THIS stop.
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
export async function notifyArrivingSoon(env, order, etaText) {
  try {
    const c = await contactForOrder(env, order);
    if (!c) return;
    await deliver(env, c, {
      sms: `${BRAND}: Your driver is about ${etaText || '10 minutes'} away with your order. ${STOP}`,
      emailSubject: `Your ${BRAND} order is arriving soon`,
      emailHtml: emailWrap('Arriving soon', `<p>Your driver is about <strong>${escHtml(etaText || '10 minutes')}</strong> away.</p>`),
    });
  } catch { /* best-effort */ }
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

// ── Legacy helpers (used by the Square webhook + subscriptions) ────────────────

const BODY = {
  out_for_delivery: `${BRAND}: Your order is out for delivery and on the way today. ${STOP}`,
  delivered: `${BRAND}: Your order was just delivered — enjoy! ${STOP}`,
};

export async function notifyOrderDelivery(env, order, kind) {
  try {
    if (!env || !env.DB || !order || !BODY[kind]) return;
    const c = await contactForOrder(env, order);
    if (!c || !c.phone) return;
    await sendSms(env, { to: c.phone, body: BODY[kind] });
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
