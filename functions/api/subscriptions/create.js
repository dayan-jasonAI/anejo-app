// POST /api/subscriptions/create  { clientId, planTier, sourceId }
// Starts a Square subscription for an existing trainer-client: creates a Square customer,
// saves the tokenized card (sourceId from the Web Payments SDK; sandbox accepts
// 'cnon:card-nonce-ok'), starts the subscription, and writes a subscriptions row.
// Trainer attribution + 10% rev-share live in OUR D1 (provider_subscription_id → trainer_id).
import { json, bad, id, now, isEmail } from '../../_lib/util.js';
import { square, squareConfigured } from '../../_lib/square.js';
import { PLAN_TIERS, isPlanTier, planVariationId } from '../../_lib/plans.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { createSubscriptionDelivery } from '../../_lib/suborders.js';
import { clampPerBowlCents, perBowlCentsFromOz, STANDARD_PER_BOWL_CENTS } from '../../_lib/sizing.js';

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
      .prepare('SELECT id, trainer_id, name, email FROM clients WHERE id = ?')
      .bind(clientId).first();
    if (!client) return bad('Client not found.', 404);
  } else {
    // Direct/public subscriber — create a client under the house trainer.
    const buyer = b.buyer || {};
    const email = (buyer.email || '').trim().toLowerCase();
    const name = (buyer.name || '').trim();
    if (!isEmail(email) || !name) return bad('Please enter your name and a valid email.');
    const houseId = await getOrCreateHouseTrainer(env);
    const cid = id('cl'), t0 = now();
    try {
      await env.DB.prepare('INSERT INTO clients (id, trainer_id, email, name, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
        .bind(cid, houseId, email, name, 'pending', t0, t0).run();
      client = { id: cid, trainer_id: houseId, name, email };
    } catch (_) {
      const ex = await env.DB.prepare('SELECT id, trainer_id, name, email FROM clients WHERE trainer_id = ? AND email = ?')
        .bind(houseId, email).first();
      if (!ex) return bad('Could not create your account. Please try again.', 500);
      client = ex;
    }
  }

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
  const weeklyCents = perBowlCents != null ? perBowlCents * tier.bowls : tier.weeklyCents;
  // Only override Square's catalog price when the bowls are actually sized away from standard —
  // standard-bowl subscriptions stay on the proven fixed-variation path.
  const overridePrice = perBowlCents != null && perBowlCents !== STANDARD_PER_BOWL_CENTS;

  // 1) Square customer
  let r = await square(env, '/v2/customers', {
    method: 'POST',
    body: { idempotency_key: id('cust'), given_name: client.name || 'Añejo Member', email_address: client.email || undefined },
  });
  if (!r.ok) return bad(sqErr(r) || 'Could not create customer.', 502);
  const customerId = r.data.customer.id;

  // 2) Card on file (PCI-safe token from the Web Payments SDK)
  r = await square(env, '/v2/cards', {
    method: 'POST',
    body: { idempotency_key: id('card'), source_id: sourceId, card: { customer_id: customerId } },
  });
  if (!r.ok) return bad(sqErr(r) || 'Your card could not be saved.', 502);
  const cardId = r.data.card.id;

  // 3) Start the subscription. For sized bowls, override the plan variation's phase price with
  // the member's sized weekly amount (Square bills this STATIC price on the variation's cadence).
  const subBody = {
    idempotency_key: id('sub'),
    location_id: env.SQUARE_LOCATION_ID,
    plan_variation_id: variationId,
    customer_id: customerId,
    card_id: cardId,
  };
  if (overridePrice) {
    subBody.phases = [{ ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: weeklyCents, currency: 'USD' } } }];
  }
  r = await square(env, '/v2/subscriptions', { method: 'POST', body: subBody });
  if (!r.ok) return bad(sqErr(r) || 'Subscription could not be started.', 502);
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
    });
  } catch (_) { /* never fail the subscription on the kitchen-order write */ }

  return json({ ok: true, subscriptionId: sub.id, status: sub.status, tier: planTier, weeklyUsd: weeklyCents / 100 });
};
