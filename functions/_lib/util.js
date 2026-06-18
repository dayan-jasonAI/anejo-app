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

// Constant-time string equality — avoids timing side-channels when comparing secrets/signatures.
// (Length is allowed to leak, as is standard; the content comparison is time-invariant.)
export function ctEq(a, b) {
  a = String(a == null ? '' : a); b = String(b == null ? '' : b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

// Optional phone capture. Returns a trimmed display string (capped) if it has at least 7 digits,
// else null. Kept permissive on formatting — login is still email-based, this is contact info.
export function normalizePhone(s) {
  const t = (s == null ? '' : String(s)).trim();
  if (!t) return null;
  const digits = t.replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;
  return t.slice(0, 32);
}

export function appBaseUrl(env, request) {
  if (env.APP_BASE_URL) return env.APP_BASE_URL.replace(/\/$/, '');
  try { return new URL(request.url).origin; } catch { return 'https://anejocateringco.com'; }
}
