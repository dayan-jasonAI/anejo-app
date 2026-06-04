// Shared helpers for Pages Functions. Files under functions/_lib are not routed.

export const now = () => Date.now();

export function randToken(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function id(prefix) {
  return `${prefix}_${randToken(10)}`;
}

// Short, human-ish affiliate code (8 chars, no ambiguous letters).
export function affiliateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => alphabet[b % alphabet.length]).join('');
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const bad = (msg, status = 400) => json({ error: msg }, status);

export function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function appBaseUrl(env, request) {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, '');
  try { return new URL(request.url).origin; } catch { return 'https://anejocateringco.com'; }
}
