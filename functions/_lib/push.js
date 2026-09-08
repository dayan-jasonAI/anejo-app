// Añejo HUB — event-specific encrypted Web Push; legacy customer tickles remain payload-less.
// Files under functions/_lib are NOT routed.
//
// Staff events include safe bilingual copy encrypted for each subscription. This works
// without a live cookie/session fetch on a locked iPhone. Customer tickles are unchanged.
//
//   import { sendPushTickle } from '../../_lib/push.js';
//   await sendPushTickle(env, { staffIds: ['stf_x'], notification: { type:'new_message', id:messageId } });
//   await sendPushTickle(env, { roles: ['owner'], notification: { type:'new_paid_order', id:alertId } });
//
// Secrets (Pages project): VAPID_PUBLIC_KEY (base64url uncompressed P-256
// point), VAPID_PRIVATE_JWK (JSON string with {d,x,y} base64url JWK params),
// VAPID_SUBJECT (mailto:). When any are absent — e.g. local dev — everything
// no-ops safely. Best-effort: sendPushTickle never throws on the caller.

// Checked-in bundle: Pages' Functions compiler does not install root npm dependencies.
import { buildPushPayload } from './vendor/webcrypto-web-push.js';
import { createHubPushMessage } from './push-message.js';

const MAX_SENDS = 20;             // hard cap per call — keep ops cheap
const JWT_TTL_SECONDS = 12 * 60 * 60; // VAPID JWT exp: now + 12h (spec max 24h)

// ---------------------------------------------------------------------------
// base64url helpers (btoa-based, URL-safe, no padding)
// ---------------------------------------------------------------------------
function b64urlFromBytes(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlFromString(s) {
  return b64urlFromBytes(new TextEncoder().encode(s));
}

// ---------------------------------------------------------------------------
// VAPID key material
// ---------------------------------------------------------------------------

// The applicationServerKey the browser needs for pushManager.subscribe(), or null.
export function getVapidPublicKey(env) {
  return (env && env.VAPID_PUBLIC_KEY) || null;
}

// Parse VAPID_PRIVATE_JWK ({d,x,y} base64url params). Returns null on garbage.
function parsePrivateJwk(env) {
  try {
    const j = JSON.parse(env.VAPID_PRIVATE_JWK);
    if (j && j.d && j.x && j.y) return j;
  } catch { /* malformed secret — treat as absent */ }
  return null;
}

function importVapidKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y, key_ops: ['sign'] },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

// Build the VAPID JWT for one push-service origin. WebCrypto ECDSA signatures
// are already the raw r||s concatenation JWS ES256 wants — base64url it as-is.
async function vapidJwt(key, aud, sub) {
  const header = b64urlFromString(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64urlFromString(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS,
    sub,
  }));
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64urlFromBytes(sig)}`;
}

// ---------------------------------------------------------------------------
// Notification sender
// ---------------------------------------------------------------------------

/**
 * Wake a CUSTOMER's devices. Same VAPID machinery as the staff tickle — the difference is only
 * who is looked up, and that customers are keyed by email because they have no staff row.
 *
 * Payload-less, like the staff path: the push carries nothing, the service worker wakes and asks
 * /api/push/peek what to show. That keeps RFC 8291 payload encryption out of the picture and means
 * the notification text lives in D1, where it can be de-duplicated and audited, rather than in a
 * fire-and-forget datagram.
 *
 * Returns { sent, failed } — sent:0 with no error is the normal, expected case for a customer who
 * has never enabled notifications. The caller falls back to SMS on sent === 0.
 */
export async function sendPushToEmail(env, addr) {
  const em = String(addr == null ? '' : addr).trim().toLowerCase();
  if (!em) return { sent: 0, failed: 0 };
  return sendPushTickle(env, { emails: [em] });
}

// Returns { sent, failed } — or { sent:0, noop:true } when VAPID isn't
// configured. Expired endpoints (404/410) get their push_subscriptions row
// deleted (the one allowed hard delete: dead subscription cleanup). Never throws.
export async function sendPushTickle(env, { staffIds = [], roles = [], emails = [], notification = null } = {}) {
  try {
    if (!env || !env.DB) return { sent: 0, noop: true };
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) {
      return { sent: 0, noop: true };
    }
    const jwk = parsePrivateJwk(env);
    if (!jwk) return { sent: 0, noop: true };

    const ids = (Array.isArray(staffIds) ? staffIds : []).filter(Boolean).map(String);
    const rs = (Array.isArray(roles) ? roles : []).filter(Boolean).map(String);
    const ems = (Array.isArray(emails) ? emails : []).filter(Boolean).map((e) => String(e).trim().toLowerCase());
    if (!ids.length && !rs.length && !ems.length) return { sent: 0, failed: 0 };

    const clauses = [];
    const binds = [];
    // Staff selectors are scoped to staff rows and customer selectors to customer rows. Without
    // the audience guard a customer whose email matched a staff `role` string — or a stale row
    // written before audiences existed — could be woken by the wrong queue.
    if (ids.length) {
      clauses.push(`(audience = 'staff' AND staff_id IN (${ids.map(() => '?').join(',')}))`);
      binds.push(...ids);
    }
    if (rs.length) {
      clauses.push(`(audience = 'staff' AND role IN (${rs.map(() => '?').join(',')}))`);
      binds.push(...rs);
    }
    if (ems.length) {
      clauses.push(`(audience = 'customer' AND LOWER(TRIM(email)) IN (${ems.map(() => '?').join(',')}))`);
      binds.push(...ems);
    }
    // Resolve the CURRENT staff role at delivery, and exclude disabled/deleted staff.
    // Trainer/client portal subscriptions legitimately have a null staff_id; preserve
    // those role-only rows without allowing null-id owner/employee rows to bypass checks.
    const { results } = await env.DB.prepare(
      `SELECT id, endpoint, p256dh, auth, audience FROM (
        SELECT p.id, p.endpoint, p.p256dh, p.auth, p.audience, p.staff_id, p.email,
               CASE WHEN s.id IS NOT NULL THEN s.role ELSE p.role END AS role
        FROM push_subscriptions p LEFT JOIN staff s ON s.id = p.staff_id
        WHERE p.audience = 'customer' OR s.active = 1
           OR (p.staff_id IS NULL AND p.role IN ('trainer', 'client'))
      ) WHERE ${clauses.join(' OR ')} LIMIT ${MAX_SENDS}`
    ).bind(...binds).all();
    const subs = results || [];
    if (!subs.length) return { sent: 0, failed: 0 };

    const key = await importVapidKey(jwk);
    const jwtByOrigin = new Map(); // one JWT per push-service origin per call

    let sent = 0;
    let failed = 0;
    async function sendOne(sub) {
      try {
        const endpoint = new URL(sub.endpoint);
        if (endpoint.protocol !== 'https:') { failed++; return; }
        let request;
        if (notification && sub.audience !== 'customer') {
          request = await buildPushPayload(
            { data: createHubPushMessage(notification), options: { ttl: 3600, urgency: 'high' } },
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: jwk.d }
          );
        } else {
          // Legacy/customer path only: retain its existing queue-peek behavior.
          if (!jwtByOrigin.has(endpoint.origin)) jwtByOrigin.set(endpoint.origin, vapidJwt(key, endpoint.origin, env.VAPID_SUBJECT));
          const jwt = await jwtByOrigin.get(endpoint.origin);
          request = { method: 'POST', headers: { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, TTL: '86400' } };
        }
        const res = await fetch(sub.endpoint, { ...request, signal: AbortSignal.timeout(8000) });
        if (res.status === 200 || res.status === 201 || res.status === 202) {
          sent++;
        } else {
          failed++;
          if (res.status === 404 || res.status === 410) {
            // Subscription is gone at the push service — drop the dead row.
            try {
              await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
            } catch { /* cleanup is best-effort */ }
          }
        }
      } catch {
        failed++;
      }
    }
    // At most four simultaneous network sends; one slow endpoint cannot serialize
    // the entire fleet. Each send retains its independent timeout and cleanup result.
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, subs.length) }, async () => {
      while (cursor < subs.length) await sendOne(subs[cursor++]);
    }));
    return { sent, failed };
  } catch {
    return { sent: 0, failed: 1 };
  }
}
