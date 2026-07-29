// POST /api/push/peek — what a woken service worker should show.
//
// The push itself carries NO payload (the sender is payload-less VAPID), so the worker wakes with
// no idea what happened and asks here. The notification text therefore lives in D1, where it can
// be de-duplicated, audited and re-read — rather than in a fire-and-forget datagram.
//
// Auth is the subscription endpoint, which the push service issued and only this browser holds.
// It is the same credential the push itself is addressed to: anyone who has it can already send
// this device notifications, so it grants nothing new.
import { json, bad } from '../../_lib/util.js';
import { pendingFor } from '../../_lib/notifications.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const endpoint = String((b && b.endpoint) || '').trim();
  if (!endpoint) return bad('Missing endpoint.');

  let sub = null;
  try {
    sub = await env.DB.prepare("SELECT email FROM push_subscriptions WHERE endpoint = ? AND audience = 'customer' LIMIT 1").bind(endpoint).first();
  } catch { sub = null; }
  // An unknown endpoint gets an empty list, not an error: the worker's job is to render something
  // or nothing, and a 500 would only turn into a generic "Añejo" notification with no content.
  if (!sub || !sub.email) return json({ ok: true, items: [] });

  const items = await pendingFor(env, sub.email);
  return json({ ok: true, items });
};
