// Web Push — subscription registry for the tickle pattern (any authenticated role).
//   GET  /api/hub/push/subscribe
//        → { ok, vapid_public_key, subscribed_count } — the public key the client
//          needs for pushManager.subscribe() (null when VAPID isn't configured),
//          plus how many devices this session already registered.
//   POST /api/hub/push/subscribe { subscription:{ endpoint, keys:{ p256dh, auth } } }
//        → upsert a push_subscriptions row keyed on the UNIQUE endpoint.
//   POST /api/hub/push/subscribe { subscription:{ endpoint }, action:'unsubscribe' }
//        → delete the row for that endpoint (allowed hard delete: user opt-out).
// Fires push.subscribed / push.unsubscribed.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, now } from '../../../_lib/hub.js';
import { getVapidPublicKey } from '../../../_lib/push.js';

const ALL_ROLES = ['owner', 'kitchen', 'driver', 'vendor', 'trainer', 'client'];

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  let count = 0;
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM push_subscriptions WHERE staff_id = ?'
    ).bind(ctx.distinct_id || ctx.email || '').first();
    count = Number(row && row.n) || 0;
  } catch { count = 0; /* table not migrated yet */ }

  return json({ ok: true, vapid_public_key: getVapidPublicKey(env), subscribed_count: count });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ALL_ROLES);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sub = (b && b.subscription) || {};
  const endpoint = ((sub && sub.endpoint) || '').toString().trim().slice(0, 1024);
  if (!endpoint || !/^https:\/\//.test(endpoint)) return bad('Missing or invalid subscription endpoint.');

  // Opt-out: remove this device's subscription entirely.
  if (b && b.action === 'unsubscribe') {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
    await capture(env, {
      event: 'push.unsubscribed',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: {},
    });
    return json({ ok: true, subscribed: false });
  }

  const keys = (sub && sub.keys) || {};
  const p256dh = ((keys && keys.p256dh) || '').toString().trim().slice(0, 256);
  const auth = ((keys && keys.auth) || '').toString().trim().slice(0, 64);
  if (!p256dh || !auth) return bad('Missing subscription keys (p256dh/auth).');

  const ua = (request.headers.get('User-Agent') || '').slice(0, 256) || null;
  const ts = now();
  const insert = (staffId) => env.DB.prepare(
    `INSERT OR REPLACE INTO push_subscriptions
       (id, staff_id, role, endpoint, p256dh, auth, user_agent, created_at, last_seen_at)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(id('push'), staffId, ctx.role, endpoint, p256dh, auth, ua, ts, ts).run();

  try {
    await insert(ctx.distinct_id || null);
  } catch {
    // staff_id has a REFERENCES staff(id) constraint — trainer/client distinct
    // ids aren't staff rows. Keep the device reachable by role instead.
    await insert(null);
  }

  await capture(env, {
    event: 'push.subscribed',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: {},
  });

  return json({ ok: true, subscribed: true });
};
