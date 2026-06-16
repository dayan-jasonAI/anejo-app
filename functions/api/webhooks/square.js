// POST /api/webhooks/square — Square event webhook.
// Verifies the HMAC-SHA256 signature, syncs subscription status, and — on each paid
// subscription invoice — writes the trainer's 10% rev-share ledger row (idempotent).
// Set SQUARE_WEBHOOK_KEY (Pages secret) + register this URL in the Square dashboard.
import { id, now } from '../../_lib/util.js';
import { materializeSubscriptionPrep } from '../../_lib/suborders.js';
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

          // Roll the daily fresh-prep window forward for this subscription (idempotent — the
          // deterministic per-day/per-window order ids mean duplicate invoice events are no-ops).
          await materializeSubscriptionPrep(env, { subscriptionId: sub.id, horizonDays: 7 });

          // Auto-renewal confirmation (consent-gated, no-op safe). Skip when the subscription
          // just started (<2h ago) — signup already sent its own purchase confirmation.
          if (!sub.started_at || (now() - Number(sub.started_at) > 2 * 3600 * 1000)) {
            await notifyClientById(env, sub.client_id,
              `Añejo Catering Co.: Your weekly plan renewed — $${(gross / 100).toFixed(2)} charged. This week's fresh bowls are scheduled; we'll text you each day when your delivery is on the way. Reply STOP to opt out.`);
          }
        }
      }
    }

    // À-la-carte order paid → flip the order row to 'paid' for the kitchen view.
    // Capture the driver tip (Square payment.tip_money) onto the order for owner/driver payout.
    if (type === 'payment.created' || type === 'payment.updated') {
      const pay = obj.payment || {};
      if (pay.order_id && (pay.status === 'COMPLETED' || pay.status === 'APPROVED')) {
        const tipCents = (pay.tip_money && Number(pay.tip_money.amount)) || 0;
        await env.DB.prepare(
          "UPDATE orders SET status='paid', customer_email=COALESCE(customer_email,?), tip_cents=?, updated_at=? WHERE square_order_id=? AND status='pending'"
        ).bind(pay.buyer_email_address || null, tipCents, now(), pay.order_id).run();

        // Per-delivery ADD-ONS: a paid add-on payment link → mark paid and attach the items
        // to that day's order so the kitchen + driver see them. Idempotent: the status guard
        // means duplicate webhook deliveries are no-ops.
        try {
          const ads = await env.DB.prepare(
            "SELECT * FROM order_addons WHERE square_order_id = ? AND status = 'pending_payment'"
          ).bind(pay.order_id).all();
          for (const ad of (ads && ads.results) || []) {
            await env.DB.prepare("UPDATE order_addons SET status='paid', paid_at=?, updated_at=? WHERE id=? AND status='pending_payment'")
              .bind(now(), now(), ad.id).run();
            const ord = await env.DB.prepare('SELECT items, total_estimate_cents FROM orders WHERE id=?').bind(ad.order_id).first();
            if (ord) {
              let items = [];
              try { items = JSON.parse(ord.items) || []; } catch { items = []; }
              items.push({ id: 'addon_' + ad.kind, name: ad.name, qty: ad.qty, addon: true });
              await env.DB.prepare('UPDATE orders SET items=?, total_estimate_cents=COALESCE(total_estimate_cents,0)+?, updated_at=? WHERE id=?')
                .bind(JSON.stringify(items), ad.amount_cents || 0, now(), ad.order_id).run();
            }
          }
        } catch (e) { console.log('addon attach error:', e && e.message); }
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
