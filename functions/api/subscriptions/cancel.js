// POST /api/subscriptions/cancel — a signed-in CLIENT cancels their own subscription.
// Cancels in Square (best-effort; Square stops the renewal at the end of the paid period)
// and marks the local subscription canceled so the portal reflects it immediately.
import { json, bad, now } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { square, squareConfigured } from '../../_lib/square.js';

export const onRequestPost = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client' || !sess.email) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  const email = String(sess.email).trim().toLowerCase();
  const client = await env.DB
    .prepare('SELECT id FROM clients WHERE LOWER(TRIM(email))=? ORDER BY updated_at DESC LIMIT 1')
    .bind(email).first();
  if (!client) return json({ error: 'No account found for your sign-in.' }, 404);

  const sub = await env.DB.prepare(
    "SELECT id, provider_subscription_id, status FROM subscriptions " +
    "WHERE client_id=? AND status NOT IN ('canceled') ORDER BY updated_at DESC LIMIT 1"
  ).bind(client.id).first();
  if (!sub) return json({ ok: true, already: true });   // nothing active to cancel

  // Best-effort Square cancel (cancels the renewal at the end of the current paid period).
  let squareOk = true, squareErr = null;
  if (sub.provider_subscription_id && squareConfigured(env)) {
    try {
      const r = await square(env, `/v2/subscriptions/${sub.provider_subscription_id}/cancel`, { method: 'POST', body: {} });
      squareOk = !!r.ok;
      if (!r.ok) squareErr = (r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail) || `Square ${r.status}`;
    } catch (e) { squareOk = false; squareErr = e && e.message; }
  }
  if (!squareOk) console.log('subscription cancel — Square error:', squareErr, '· sub', sub.id);

  const t = now();
  await env.DB.prepare("UPDATE subscriptions SET status='canceled', canceled_at=?, updated_at=? WHERE id=?")
    .bind(t, t, sub.id).run();

  return json({ ok: true, square_canceled: squareOk });
};
