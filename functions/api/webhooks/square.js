// POST /api/webhooks/square — Square event webhook.
// Verifies the HMAC-SHA256 signature, syncs subscription status, and — on each paid
// subscription invoice — writes the trainer's 10% rev-share ledger row (idempotent).
// Set SQUARE_WEBHOOK_KEY (Pages secret) + register this URL in the Square dashboard.
import { id, now } from '../../_lib/util.js';
import { createSubscriptionDelivery } from '../../_lib/suborders.js';
import { notifyClientById } from '../../_lib/notify.js';

const ok = (msg = 'ok') => new Response(msg, { status: 200 });

async function validSignature(key, notificationUrl, rawBody, signature) {
  if (!key) return true;            // dev: no key configured → don't block (log-only)
  if (!signature) return false;
  try {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', k, enc.encode(notificationUrl + rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return expected === signature;
  } catch { return false; }
}

export const onRequestPost = async ({ request, env }) => {
  const raw = await request.text();
  const sig = request.headers.get('x-square-hmacsha256-signature');
  // Square signs over the exact notification URL it was configured with.
  const notifyUrl = env.SQUARE_WEBHOOK_URL || request.url;

  if (!(await validSignature(env.SQUARE_WEBHOOK_KEY, notifyUrl, raw, sig))) {
    return new Response('invalid signature', { status: 401 });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return ok('bad json'); }   // 200 so Square stops retrying
  const type = evt.type || '';
  const obj = (evt.data && evt.data.object) || {};

  if (!env.DB) return ok('no db');

  try {
    // Keep our subscription status in sync.
    if (type === 'subscription.updated' || type === 'subscription.created') {
      const s = obj.subscription || {};
      if (s.id) {
        const canceled = (s.status === 'CANCELED' || s.status === 'DEACTIVATED') ? now() : null;
        await env.DB.prepare(
          'UPDATE subscriptions SET status = ?, canceled_at = COALESCE(?, canceled_at), updated_at = ? WHERE provider_subscription_id = ?'
        ).bind((s.status || 'ACTIVE').toLowerCase(), canceled, now(), s.id).run();
      }
    }

    // Trainer rev-share: one ledger row per paid subscription invoice.
    if (type === 'invoice.payment_made') {
      const inv = obj.invoice || {};
      const subProviderId = inv.subscription_id;
      const invoiceId = inv.id || (evt.event_id);
      if (subProviderId && invoiceId) {
        const sub = await env.DB
          .prepare('SELECT id, client_id, plan_id, trainer_id, weekly_amount_cents, trainer_share_pct, avocado FROM subscriptions WHERE provider_subscription_id = ?')
          .bind(subProviderId).first();
        if (sub) {
          const gross = sub.weekly_amount_cents || 0;
          const share = Math.round(gross * (sub.trainer_share_pct || 10) / 100);
          // Idempotent: PK derived from the invoice id, so retries/duplicates are ignored.
          await env.DB.prepare(
            `INSERT OR IGNORE INTO rev_share_events (id, trainer_id, subscription_id, amount_cents, share_cents, occurred_at, payout_status)
             VALUES (?,?,?,?,?,?, 'pending')`
          ).bind('rs_' + invoiceId, sub.trainer_id, sub.id, gross, share, now()).run();

          // Weekly kitchen delivery ticket — unless one was just created at signup (<2h ago).
          const recent = await env.DB
            .prepare('SELECT 1 FROM orders WHERE square_order_id = ? AND created_at > ? LIMIT 1')
            .bind('sub_' + subProviderId, now() - 2 * 3600 * 1000).first();
          if (!recent) {
            const client = await env.DB.prepare(
              'SELECT name, email, delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes, delivery_lat, delivery_lng FROM clients WHERE id = ?'
            ).bind(sub.client_id).first();
            const plan = sub.plan_id ? await env.DB.prepare('SELECT bowl_rotation, bowl_size_factor FROM plans WHERE id = ?').bind(sub.plan_id).first() : null;
            const address = client && client.delivery_street ? {
              street: client.delivery_street, unit: client.delivery_unit, city: client.delivery_city,
              state: client.delivery_state, zip: client.delivery_zip, notes: client.delivery_notes,
              lat: client.delivery_lat, lng: client.delivery_lng,
            } : null;
            await createSubscriptionDelivery(env, {
              subscriptionId: subProviderId, orderId: 'ord_inv_' + invoiceId,
              planBowlRotation: plan ? plan.bowl_rotation : null,
              sizeFactor: plan ? plan.bowl_size_factor : null, avocado: sub.avocado === 1,
              weeklyCents: gross,
              customerName: client && client.name, customerEmail: client && client.email,
              address,
            });
            // Auto-renewal confirmation (consent-gated, no-op safe). Only on real renewals —
            // signup already sent a purchase confirmation, and that path skips this via `recent`.
            await notifyClientById(env, sub.client_id,
              `Añejo Catering Co.: Your weekly plan renewed — $${(gross / 100).toFixed(2)} charged. This week's bowls are on the way; we'll text you when they're out for delivery. Reply STOP to opt out.`);
          }
        }
      }
    }

    // À-la-carte order paid → flip the order row to 'paid' for the kitchen view.
    if (type === 'payment.created' || type === 'payment.updated') {
      const pay = obj.payment || {};
      if (pay.order_id && (pay.status === 'COMPLETED' || pay.status === 'APPROVED')) {
        await env.DB.prepare(
          "UPDATE orders SET status='paid', customer_email=COALESCE(customer_email,?), updated_at=? WHERE square_order_id=? AND status='pending'"
        ).bind(pay.buyer_email_address || null, now(), pay.order_id).run();
      }
    }
  } catch (e) {
    // Log but still 200 — a 500 makes Square retry indefinitely. Surface via logs.
    console.log('webhook handler error:', e && e.message);
  }

  return ok();
};

// Square sends a GET to validate the endpoint during setup.
export const onRequestGet = () => ok('Añejo Square webhook ready');
