// KV-backed sessions + cookie helpers.
import { randToken } from './util.js';

const COOKIE = 'anejo_sess';
const TTL = 60 * 60 * 24 * 30; // 30 days (KV TTL ceiling)
// Staff (HUB) sessions expire after this much INACTIVITY — defense-in-depth for a stolen
// token. Slides forward on use. Trainers/clients keep the long TTL (consumer convenience).
const STAFF_IDLE_MS = 12 * 60 * 60 * 1000;   // 12h idle → must sign in again
const SLIDE_AFTER_MS = 15 * 60 * 1000;       // only re-write KV when >15min stale (cheap)

export async function createSession(env, data, ttl = TTL) {
  const token = randToken(24);
  const payload = { ...data, la: Date.now() };   // la = last-active (for inactivity timeout)
  await env.SESSIONS.put(`session:${token}`, JSON.stringify(payload), { expirationTtl: ttl });
  return token;
}

export async function getSession(env, token) {
  if (!token) return null;
  const v = await env.SESSIONS.get(`session:${token}`);
  if (!v) return null;
  let data;
  try { data = JSON.parse(v); } catch { return null; }  // corrupt session → signed out, never 500
  if (!data) return null;
  const t = Date.now();
  const la = Number(data.la) || 0;
  // Staff inactivity timeout. Sessions minted before this field existed (no la) are grandfathered.
  if (data.type === 'staff' && la && (t - la) > STAFF_IDLE_MS) {
    try { await env.SESSIONS.delete(`session:${token}`); } catch { /* best-effort */ }
    return null;
  }
  // Slide the activity window without writing KV on every request.
  if (!la || (t - la) > SLIDE_AFTER_MS) {
    data.la = t;
    try { await env.SESSIONS.put(`session:${token}`, JSON.stringify(data), { expirationTtl: TTL }); } catch { /* best-effort */ }
  }
  return data;
}

export async function destroySession(env, token) {
  if (token) await env.SESSIONS.delete(`session:${token}`);
}

export function readCookie(request, name = COOKIE) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(/;\s*/)) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx) === name) return decodeURIComponent(part.slice(idx + 1));
  }
  return null;
}

// `secure` defaults true (production https). Pass false for local http (e.g.
// http://localhost dev), where browsers like Safari reject Secure cookies.
export function sessionCookie(token, maxAge = TTL, secure = true) {
  return `${COOKIE}=${token}; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(secure = true) {
  return `${COOKIE}=; Path=/; HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Max-Age=0`;
}

// True when the request arrived over https (so the session cookie should be Secure).
export function isSecureRequest(request) {
  try { return new URL(request.url).protocol === 'https:'; } catch { return true; }
}

// Returns the session object for the current request, or null.
export async function currentUser(env, request) {
  return getSession(env, readCookie(request));
}
