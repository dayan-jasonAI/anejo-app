// POST /api/subscriptions/create  { clientId, planTier, sourceId }
// Starts a Square subscription for an existing trainer-client: creates a Square customer,
// saves the tokenized card (sourceId from the Web Payments SDK; sandbox accepts
// 'cnon:card-nonce-ok'), starts the subscription, and writes a subscriptions row.
// Trainer attribution + 10% rev-share live in OUR D1 (provider_subscription_id → trainer_id).
import { json, bad, id, now } from '../../_lib/util.js';
import { square, squareConfigured } from '../../_lib/square.js';
import { PLAN_TIERS, isPlanTier, planVariationId } from '../../_lib/plans.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

const sqErr = (r) => r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail;

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
  const clientId = (b.clientId || '').trim();
  if (!clientId) return bad('Missing client.');

  const client = await env.DB
    .prepare('SELECT id, trainer_id, name, email FROM clients WHERE id = ?')
    .bind(clientId).first();
  if (!client) return bad('Client not found.', 404);

  const plan = await env.DB
    .prepare('SELECT id FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(clientId).first();

  const tier = PLAN_TIERS[planTier];
  const variationId = planVariationId(env, planTier);
  if (!variationId) return bad('Plan not available in this environment.', 503);

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

  // 3) Start the subscription
  r = await square(env, '/v2/subscriptions', {
    method: 'POST',
    body: {
      idempotency_key: id('sub'),
      location_id: env.SQUARE_LOCATION_ID,
      plan_variation_id: variationId,
      customer_id: customerId,
      card_id: cardId,
    },
  });
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
    sub.id, customerId, (sub.status || 'ACTIVE').toLowerCase(), tier.weeklyCents, 10, t, t
  ).run();

  await env.DB.prepare('UPDATE clients SET status = ?, updated_at = ? WHERE id = ?')
    .bind('subscribed', t, client.id).run();

  return json({ ok: true, subscriptionId: sub.id, status: sub.status, tier: planTier, weeklyUsd: tier.weeklyCents / 100 });
};
