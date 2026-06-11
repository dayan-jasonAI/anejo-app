// Añejo HUB — Web Push "tickle" sender (VAPID over WebCrypto, NO payload).
// Files under functions/_lib are NOT routed.
//
// Pattern: we POST an EMPTY push to the endpoint (no payload → no Web Push
// encryption needed). The service worker wakes on the 'push' event, fetches
// /api/hub/push/peek for fresh context, and renders the notification itself.
//
//   import { sendPushTickle } from '../../_lib/push.js';
//   await sendPushTickle(env, { staffIds: ['stf_x'] });        // target people
//   await sendPushTickle(env, { roles: ['owner'] });           // target roles
//
// Secrets (Pages project): VAPID_PUBLIC_KEY (base64url uncompressed P-256
// point), VAPID_PRIVATE_JWK (JSON string with {d,x,y} base64url JWK params),
// VAPID_SUBJECT (mailto:). When any are absent — e.g. local dev — everything
// no-ops safely. Best-effort: sendPushTickle never throws on the caller.

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
// Tickle sender
// ---------------------------------------------------------------------------

// Send an empty "tickle" push to every subscription matching staffIds OR roles.
// Returns { sent, failed } — or { sent:0, noop:true } when VAPID isn't
// configured. Expired endpoints (404/410) get their push_subscriptions row
// deleted (the one allowed hard delete: dead subscription cleanup). Never throws.
export async function sendPushTickle(env, { staffIds = [], roles = [] } = {}) {
  try {
    if (!env || !env.DB) return { sent: 0, noop: true };
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK || !env.VAPID_SUBJECT) {
      return { sent: 0, noop: true };
    }
    const jwk = parsePrivateJwk(env);
    if (!jwk) return { sent: 0, noop: true };

    const ids = (Array.isArray(staffIds) ? staffIds : []).filter(Boolean).map(String);
    const rs = (Array.isArray(roles) ? roles : []).filter(Boolean).map(String);
    if (!ids.length && !rs.length) return { sent: 0, failed: 0 };

    const clauses = [];
    const binds = [];
    if (ids.length) {
      clauses.push(`staff_id IN (${ids.map(() => '?').join(',')})`);
      binds.push(...ids);
    }
    if (rs.length) {
      clauses.push(`role IN (${rs.map(() => '?').join(',')})`);
      binds.push(...rs);
    }
    const { results } = await env.DB.prepare(
      `SELECT id, endpoint FROM push_subscriptions WHERE ${clauses.join(' OR ')} LIMIT ${MAX_SENDS}`
    ).bind(...binds).all();
    const subs = results || [];
    if (!subs.length) return { sent: 0, failed: 0 };

    const key = await importVapidKey(jwk);
    const jwtByOrigin = new Map(); // one JWT per push-service origin per call

    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      try {
        const origin = new URL(sub.endpoint).origin;
        let jwt = jwtByOrigin.get(origin);
        if (!jwt) {
          jwt = await vapidJwt(key, origin, env.VAPID_SUBJECT);
          jwtByOrigin.set(origin, jwt);
        }
        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
            TTL: '86400',
          },
          // EMPTY body on purpose: payload-less pushes skip RFC 8291 encryption.
        });
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
    return { sent, failed };
  } catch {
    return { sent: 0, failed: 0 };
  }
}
