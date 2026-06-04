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
  return v ? JSON.parse(v) : null;
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

export function sessionCookie(token, maxAge = TTL) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Returns the session object for the current request, or null.
export async function currentUser(env, request) {
  return getSession(env, readCookie(request));
}
