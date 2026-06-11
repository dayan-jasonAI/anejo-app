// POST /api/subscriptions/create  { clientId, planTier, sourceId }
// Starts a Square subscription for an existing trainer-client: creates a Square customer,
// saves the tokenized card (sourceId from the Web Payments SDK; sandbox accepts
// 'cnon:card-nonce-ok'), starts the subscription, and writes a subscriptions row.
// Trainer attribution + 10% rev-share live in OUR D1 (provider_subscription_id → trainer_id).
import { json, bad, id, now, isEmail, normalizePhone } from '../../_lib/util.js';
import { square, squareConfigured } from '../../_lib/square.js';
import { PLAN_TIERS, isPlanTier, planVariationId } from '../../_lib/plans.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { createSubscriptionDelivery } from '../../_lib/suborders.js';
import { clampPerBowlCents, perBowlCentsFromOz, STANDARD_PER_BOWL_CENTS } from '../../_lib/sizing.js';
import { sendSms } from '../../_lib/twilio.js';
import { geocode, formatAddress } from '../../_lib/geo.js';

// Validate a subscriber's delivery address (street/city/5-digit ZIP required).
function parseAddr(raw) {
  const a = raw || {};
  const street = (a.street || '').trim();
  const city = (a.city || '').trim();
  const zip = (a.zip || '').trim();
  if (!street || !city || !/^\d{5}$/.test(zip)) return null;
  return {
    street: street.slice(0, 160), unit: (a.unit || '').trim().slice(0, 60) || null,
    city: city.slice(0, 80), state: ((a.state || 'FL').trim() || 'FL').slice(0, 20),
    zip, notes: (a.notes || '').trim().slice(0, 240) || null,
  };
}

const sqErr = (r) => r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail;

// Direct/public subscribers (no trainer) attach to a single "house" trainer account.
async function getOrCreateHouseTrainer(env) {
  const existing = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
  if (existing) return existing.id;
  const tid = id('tr'), t = now();
  try {
    await env.DB.prepare('INSERT INTO trainers (id, email, name, affiliate_code, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .bind(tid, 'house@anejocateringco.com', 'Añejo (Direct)', 'HOUSE', t, t).run();
    return tid;
  } catch (_) {
    const again = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
    return again ? again.id : tid;
  }
}

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'subscribe', limit: 10, windowSec: 60 });
  if (limited) return limited;

  if (!squareConfigured(env)) return bad('Subscriptions are not configured yet.', 503);
  if (!env.DB) return bad('Server not configured (DB binding missing).', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const planTier = b.planTier;
  if (!isPlanTier(planTier)) return bad('Unknown meal-plan tier.');
  const sourceId = (b.sourceId || '').trim();
  if (!sourceId) return bad('Missing payment source. Please re-enter your card.');
  let client;
  const clientId = (b.clientId || '').trim();
  if (clientId) {
    client = await env.DB
      .prepare('SELECT id, trainer_id, name, email, phone, sms_consent FROM clients WHERE id = ?')
      .bind(clientId).first();
    if (!client) return bad('Client not found.', 404);
  } else {
    // Direct/public subscriber — create a client under the house trainer.
    const buyer = b.buyer || {};
    const email = (buyer.email || '').trim().toLowerCase();
    const name = (buyer.name || '').trim();
    const phone = normalizePhone(buyer.phone);
    const smsConsent = buyer.sms_consent === true || buyer.sms_consent === 1 ? 1 : 0;
    if (!isEmail(email) || !name) return bad('Please enter your name and a valid email.');
    const houseId = await getOrCreateHouseTrainer(env);
    const cid = id('cl'), t0 = now();
    try {
      await env.DB.prepare('INSERT INTO clients (id, trainer_id, email, name, phone, sms_consent, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(cid, houseId, email, name, phone, smsConsent, 'pending', t0, t0).run();
      client = { id: cid, trainer_id: houseId, name, email, phone, sms_consent: smsConsent };
    } catch (_) {
      const ex = await env.DB.prepare('SELECT id, trainer_id, name, email, phone FROM clients WHERE trainer_id = ? AND email = ?')
        .bind(houseId, email).first();
      if (!ex) return bad('Could not create your account. Please try again.', 500);
      client = ex;
    }
  }

  // Delivery address — required to subscribe (every weekly order must be routable). Saved as
  // the client's default and reused for each auto-generated delivery. Geocode is best-effort.
  let deliveryAddr = parseAddr(b.address);
  if (deliveryAddr) {
    const g = await geocode(env, formatAddress(deliveryAddr)).catch(() => null);
    if (g) { deliveryAddr.lat = g.lat; deliveryAddr.lng = g.lng; }
    try {
      await env.DB.prepare(
        `UPDATE clients SET delivery_street=?, delivery_unit=?, delivery_city=?, delivery_state=?,
            delivery_zip=?, delivery_notes=?, delivery_lat=?, delivery_lng=?, updated_at=? WHERE id=?`
      ).bind(
        deliveryAddr.street, deliveryAddr.unit, deliveryAddr.city, deliveryAddr.state,
        deliveryAddr.zip, deliveryAddr.notes, deliveryAddr.lat != null ? deliveryAddr.lat : null,
        deliveryAddr.lng != null ? deliveryAddr.lng : null, now(), client.id
      ).run();
    } catch (_) { /* address is best-effort persistence; don't fail the subscription */ }
  } else {
    // No address in the request — fall back to the client's stored default (if any).
    try {
      const c = await env.DB.prepare(
        'SELECT delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes, delivery_lat, delivery_lng FROM clients WHERE id = ?'
      ).bind(client.id).first();
      if (c && c.delivery_street) {
        deliveryAddr = {
          street: c.delivery_street, unit: c.delivery_unit, city: c.delivery_city, state: c.delivery_state,
          zip: c.delivery_zip, notes: c.delivery_notes, lat: c.delivery_lat, lng: c.delivery_lng,
        };
      }
    } catch (_) { /* leave null */ }
  }
  // Direct/public subscribers must provide an address; trainer-referred members may have the
  // owner add it later, so only hard-require it when there's no clientId and none on file.
  if (!deliveryAddr && !clientId) return bad('Please enter your delivery address (street, city, and ZIP).');

  const plan = await env.DB
    .prepare('SELECT id, bowl_rotation, per_bowl_price_cents, bowl_size_oz FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(client.id).first();

  const tier = PLAN_TIERS[planTier];
  const variationId = planVariationId(env, planTier);
  if (!variationId) return bad('Plan not available in this environment.', 503);

  // Dynamic bowl sizing: each bowl is portion-sized to the member's goal, so we charge the
  // member's sized per-bowl price × the chosen bowl count — not the fixed standard-bowl tier.
  // Source the per-bowl price server-side (never trust a raw client amount):
  //   • trainer-client → the saved plan's per_bowl_price_cents
  //   • direct buyer    → recomputed from the bowl size (oz) they came in with (factor-clamped)
  let perBowlCents = null;
  if (plan && plan.per_bowl_price_cents != null) perBowlCents = clampPerBowlCents(plan.per_bowl_price_cents);
  else if (b.bowlSizeOz) perBowlCents = perBowlCentsFromOz(b.bowlSizeOz);
  let weeklyCents = perBowlCents != null ? perBowlCents * tier.bowls : tier.weeklyCents;
  // Only override Square's catalog price when the bowls are actually sized away from standard —
  // standard-bowl subscriptions stay on the proven fixed-variation path.
  const overridePrice = perBowlCents != null && perBowlCents !== STANDARD_PER_BOWL_CENTS;

  // 1) Square customer
  let r = await square(env, '/v2/customers', {
    method: 'POST',
    body: { idempotency_key: id('cust'), given_name: client.name || 'Añejo Member', email_address: client.email || undefined },
  });
  if (!r.ok) return bad(sqErr(r) || 'Could not create customer.', 500);
  const customerId = r.data.customer.id;

  // 2) Card on file (PCI-safe token from the Web Payments SDK)
  r = await square(env, '/v2/cards', {
    method: 'POST',
    body: { idempotency_key: id('card'), source_id: sourceId, card: { customer_id: customerId } },
  });
  if (!r.ok) return bad(sqErr(r) || 'Your card could not be saved.', 500);
  const cardId = r.data.card.id;

  // 3) Start the subscription. CreateSubscription has NO price-override field (Square rejects
  // phases[].pricing), so sized bowls subscribe to an ad-hoc catalog plan VARIATION created at
  // the sized weekly price under the tier's parent plan.
  let subscribeVariationId = variationId;
  if (overridePrice) {
    let vr = await square(env, `/v2/catalog/object/${variationId}`);
    const parentPlanId = vr.ok && vr.data.object && vr.data.object.subscription_plan_variation_data
      && vr.data.object.subscription_plan_variation_data.subscription_plan_id;
    if (parentPlanId) {
      vr = await square(env, '/v2/catalog/object', {
        method: 'POST',
        body: {
          idempotency_key: id('var'),
          object: {
            type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#sized',
            subscription_plan_variation_data: {
              name: `${tier.label} · sized ${(weeklyCents / 100).toFixed(2)}/wk`,
              subscription_plan_id: parentPlanId,
              phases: [{ cadence: 'WEEKLY', ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: weeklyCents, currency: 'USD' } } }],
            },
          },
        },
      });
    }
    if (vr.ok && vr.data.catalog_object) {
      subscribeVariationId = vr.data.catalog_object.id;
    } else {
      // Sized variation could not be created — fall back to the proven standard tier price,
      // and record that same amount so the charge and our books never disagree.
      weeklyCents = tier.weeklyCents;
    }
  }
  const subBody = {
    idempotency_key: id('sub'),
    location_id: env.SQUARE_LOCATION_ID,
    plan_variation_id: subscribeVariationId,
    customer_id: customerId,
    card_id: cardId,
  };
  r = await square(env, '/v2/subscriptions', { method: 'POST', body: subBody });
  if (!r.ok) return bad(sqErr(r) || 'Subscription could not be started.', 500);
  const sub = r.data.subscription;

  // 4) Persist + attribute to the trainer (the rev-share link)
  const t = now();
  await env.DB.prepare(
    `INSERT INTO subscriptions
       (id, client_id, trainer_id, plan_id, provider, provider_subscription_id, provider_customer_id,
        status, weekly_amount_cents, trainer_share_pct, started_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id('lsub'), client.id, client.trainer_id, plan ? plan.id : null, 'square',
    sub.id, customerId, (sub.status || 'ACTIVE').toLowerCase(), weeklyCents, 10, t, t
  ).run();

  await env.DB.prepare('UPDATE clients SET status = ?, updated_at = ? WHERE id = ?')
    .bind('subscribed', t, client.id).run();

  // Generate the first weekly delivery as a kitchen order so the kitchen sees it immediately.
  try {
    await createSubscriptionDelivery(env, {
      subscriptionId: sub.id, orderId: 'ord_subfirst_' + sub.id,
      planBowlRotation: plan ? plan.bowl_rotation : null,
      tierLabel: tier.label, bowls: tier.bowls, weeklyCents,
      customerName: client.name, customerEmail: client.email,
      deliveryDate: b.delivery && b.delivery.date, deliveryWindow: b.delivery && b.delivery.window,
      address: deliveryAddr || null,
    });
  } catch (_) { /* never fail the subscription on the kitchen-order write */ }

  // Best-effort confirmation text — ONLY to customers who opted in (checked the consent box).
  // No-op + logged when TWILIO_* creds aren't set. A2P 10DLC compliance: never text without consent.
  if (client.phone && (client.sms_consent === 1 || client.sms_consent === true)) {
    try {
      await sendSms(env, {
        to: client.phone,
        body: `Añejo: your ${tier.bowls}-bowl weekly plan is active — $${(weeklyCents / 100).toFixed(2)}/wk, delivered in Palm Beach County. We'll text you when your order is out for delivery and when it's delivered. Reply STOP to opt out.`,
      });
    } catch (_) { /* SMS must never fail the subscription */ }
  }

  return json({ ok: true, subscriptionId: sub.id, status: sub.status, tier: planTier, weeklyUsd: weeklyCents / 100 });
};
