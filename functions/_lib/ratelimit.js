// Lightweight KV-backed per-IP rate limiter for cost-sensitive endpoints
// (AI generation, magic-link email, checkout). Fail-OPEN: if KV is unavailable
// we allow the request rather than block legitimate traffic on an infra hiccup.
// Files under functions/_lib are not routed.

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
}

// { ok:true } if allowed; { ok:false, retryAfter } if over the per-window limit.
export async function rateLimit(env, request, { name, limit, windowSec }) {
  if (!env.SESSIONS) return { ok: true };                 // no KV → fail open
  const ip = clientIp(request);
  const win = Math.max(60, windowSec | 0);                // KV TTL floor is 60s
  const bucket = Math.floor(Date.now() / (win * 1000));   // fixed window
  const key = `rl:${name}:${ip}:${bucket}`;
  let count = 0;
  try { count = parseInt((await env.SESSIONS.get(key)) || '0', 10) || 0; }
  catch { return { ok: true }; }
  if (count >= limit) return { ok: false, retryAfter: win };
  try { await env.SESSIONS.put(key, String(count + 1), { expirationTtl: win + 5 }); }
  catch { /* best effort — don't fail the request on a KV write hiccup */ }
  return { ok: true };
}

// Convenience: returns a ready-to-send 429 Response if limited, else null.
export async function limitOr429(env, request, opts) {
  const r = await rateLimit(env, request, opts);
  if (r.ok) return null;
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please slow down and try again in a moment.' }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(r.retryAfter) } }
  );
}
