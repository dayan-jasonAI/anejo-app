// KV-backed sessions + cookie helpers.
import { randToken } from './util.js';

const COOKIE = 'anejo_sess';
const TTL = 60 * 60 * 24 * 30; // 30 days

export async function createSession(env, data, ttl = TTL) {
  const token = randToken(24);
  await env.SESSIONS.put(`session:${token}`, JSON.stringify(data), { expirationTtl: ttl });
  return token;
}

export async function getSession(env, token) {
  if (!token) return null;
  const v = await env.SESSIONS.get(`session:${token}`);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }  // corrupt session → treat as signed out, never 500
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
