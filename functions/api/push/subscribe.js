// POST /api/push/subscribe — a CUSTOMER turns on order notifications.
// GET  /api/push/subscribe — the VAPID public key the browser needs to subscribe.
//
// Public on purpose: most buyers check out as guests and never create an account, so requiring a
// session here would exclude exactly the people most likely to want "where is my order?".
// The subscription endpoint is itself an unguessable secret issued by the push service, so
// possession of it is the credential — the same assumption the staff path already makes.
//
// The email is what ties a device to an order. It is stored lowercased, matching the CRM key.
import { json, bad, id, now, isEmail } from '../../_lib/util.js';
import { getVapidPublicKey } from '../../_lib/push.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

export const onRequestGet = async ({ env }) => {
  const key = getVapidPublicKey(env);
  // Absent key is a CONFIGURATION state, not an error — the page hides the prompt rather than
  // offering a button that cannot work.
  return json({ ok: true, configured: !!key, vapid_public_key: key || null });
};

export const onRequestPost = async ({ request, env }) => {
  // No session gates this route (see file header), so a rate limit is the only thing standing
  // between it and someone scripting thousands of fake rows against a real customer's email —
  // the same guard /api/leads and /api/preferences already carry for the same reason.
  const limited = await limitOr429(env, request, { name: 'push_subscribe', limit: 12, windowSec: 60 });
  if (limited) return limited;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const email = String((b && b.email) || '').trim().toLowerCase();
  const sub = b && b.subscription;
  const endpoint = sub && String(sub.endpoint || '').trim();
  if (!isEmail(email)) return bad('A valid email is required.');
  if (!endpoint || !/^https:\/\//.test(endpoint)) return bad('A push subscription is required.');

  const p256dh = (sub.keys && sub.keys.p256dh) || null;
  const auth = (sub.keys && sub.keys.auth) || null;
  const marketing = b.marketing_opt_in ? 1 : 0;
  const t = now();

  // Endpoint is UNIQUE: re-subscribing on the same device updates rather than duplicating, so a
  // customer who toggles it off and on does not get every notification twice.
  try {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, user_agent, email, audience, marketing_opt_in, created_at, last_seen_at)
       VALUES (?,?,?,?,?,?,'customer',?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET
         email=excluded.email, audience='customer', p256dh=excluded.p256dh, auth=excluded.auth,
         marketing_opt_in=excluded.marketing_opt_in, last_seen_at=excluded.last_seen_at`
    ).bind(id('psub'), endpoint, p256dh, auth,
      (request.headers.get('user-agent') || '').slice(0, 200), email, marketing, t, t).run();
  } catch (e) {
    return bad('Could not save the subscription. ' + String((e && e.message) || '').slice(0, 100), 500);
  }

  return json({ ok: true, email, marketing_opt_in: !!marketing });
};

// DELETE — turn them off again. Offered because a notification you cannot switch off is the
// fastest way to get the whole channel blocked at the OS level.
export const onRequestDelete = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'push_subscribe', limit: 12, windowSec: 60 });
  if (limited) return limited;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const endpoint = String((b && b.endpoint) || '').trim();
  if (!endpoint) return bad('Missing endpoint.');
  try { await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND audience = 'customer'").bind(endpoint).run(); }
  catch { /* already gone */ }
  return json({ ok: true });
};
