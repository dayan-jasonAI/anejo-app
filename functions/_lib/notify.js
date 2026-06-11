// Customer delivery SMS — consent-gated, no-op safe, and never throws.
// Orders carry only name + email, so we resolve a CONSENTED mobile number from the
// clients table (matched by email, sms_consent=1) before texting. If the customer
// never opted in (or has no phone on file), nothing is sent. Twilio creds absent =>
// sendSms no-ops to sms_log. A2P 10DLC: we only text customers who opted in.
import { sendSms } from './twilio.js';

const BODY = {
  out_for_delivery: 'Añejo Catering Co.: Your order is out for delivery and on the way today. Reply STOP to opt out.',
  delivered: 'Añejo Catering Co.: Your order was just delivered — enjoy! Reply STOP to opt out.',
};

async function consentedPhoneForOrder(env, order) {
  const email = ((order && order.customer_email) || '').trim().toLowerCase();
  if (!email) return null;
  try {
    const c = await env.DB
      .prepare("SELECT phone FROM clients WHERE lower(email)=? AND phone IS NOT NULL AND phone<>'' AND sms_consent=1 ORDER BY created_at DESC LIMIT 1")
      .bind(email)
      .first();
    return c && c.phone ? c.phone : null;
  } catch { return null; }
}

// Text the customer for one order. kind ∈ 'out_for_delivery' | 'delivered'.
export async function notifyOrderDelivery(env, order, kind) {
  try {
    if (!env || !env.DB || !order || !BODY[kind]) return;
    const phone = await consentedPhoneForOrder(env, order);
    if (!phone) return;
    await sendSms(env, { to: phone, body: BODY[kind] });
  } catch { /* a notification must never break the driver's action */ }
}

// Text a specific client by id, if they have a phone on file AND opted in. No-op safe.
export async function notifyClientById(env, clientId, body) {
  try {
    if (!env || !env.DB || !clientId || !body) return;
    const c = await env.DB
      .prepare("SELECT phone FROM clients WHERE id=? AND phone IS NOT NULL AND phone<>'' AND sms_consent=1 LIMIT 1")
      .bind(clientId)
      .first();
    if (!c || !c.phone) return;
    await sendSms(env, { to: c.phone, body });
  } catch { /* never fail the caller on a notification */ }
}

// On route start: tell every (consented) customer on the route their delivery is on the way.
export async function notifyRouteOutForDelivery(env, routeId) {
  try {
    if (!env || !env.DB || !routeId) return;
    const res = await env.DB
      .prepare("SELECT o.* FROM route_stops rs JOIN orders o ON o.id = rs.order_id WHERE rs.route_id=? AND rs.status IN ('pending','arrived')")
      .bind(routeId)
      .all();
    for (const order of (res && res.results) || []) {
      await notifyOrderDelivery(env, order, 'out_for_delivery');
    }
  } catch { /* best-effort */ }
}
