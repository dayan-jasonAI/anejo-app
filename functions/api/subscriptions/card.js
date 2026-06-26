// POST /api/subscriptions/card — a signed-in CLIENT updates the card on their subscription.
//   body { source_id }  — a PCI-safe card token from the Square Web Payments SDK (the member
//   types the card into Square's hosted field; the PAN never touches our server).
// Saves the new card to the member's Square customer, then points the subscription at it.
import { json, bad, now, id } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { square, squareConfigured } from '../../_lib/square.js';

export const onRequestPost = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client' || !sess.email) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);
  if (!squareConfigured(env)) return bad('Payments are not configured yet.', 503);
  let b; try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const sourceId = (b && b.source_id || '').toString().trim();
  if (!sourceId) return bad('Missing card token.');

  const email = String(sess.email).trim().toLowerCase();
  const client = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email))=? ORDER BY updated_at DESC LIMIT 1').bind(email).first();
  if (!client) return json({ error: 'No account found for your sign-in.' }, 404);
  const sub = await env.DB.prepare(
    "SELECT id, provider_subscription_id, provider_customer_id FROM subscriptions WHERE client_id=? AND status NOT IN ('canceled') ORDER BY updated_at DESC LIMIT 1"
  ).bind(client.id).first();
  if (!sub) return json({ error: 'You don’t have an active subscription.' }, 404);
  if (!sub.provider_customer_id) return bad('No payment profile on file — please contact us.', 400);

  const sqErr = (r) => (r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail) || `Square ${r.status}`;

  // 1) Save the new card on the member's Square customer.
  const cr = await square(env, '/v2/cards', { method: 'POST', body: { idempotency_key: id('card'), source_id: sourceId, card: { customer_id: sub.provider_customer_id } } });
  if (!cr.ok || !(cr.data && cr.data.card && cr.data.card.id)) return bad(sqErr(cr) || 'Your card could not be saved.', 502);
  const cardId = cr.data.card.id;

  // 2) Point the subscription at the new card (future invoices charge it).
  if (sub.provider_subscription_id) {
    const ur = await square(env, `/v2/subscriptions/${sub.provider_subscription_id}`, { method: 'PUT', body: { subscription: { card_id: cardId } } });
    if (!ur.ok) return bad(sqErr(ur) || 'Could not update the subscription card.', 502);
  }

  // Mirror locally when the column exists (older schemas may not have it).
  try { await env.DB.prepare('UPDATE subscriptions SET square_card_id=?, updated_at=? WHERE id=?').bind(cardId, now(), sub.id).run(); } catch { /* column optional */ }

  return json({ ok: true, last4: (cr.data.card.last_4 || null), brand: (cr.data.card.card_brand || null) });
};
