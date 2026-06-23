// POST /api/contract/headcount  { t, count, notes?, name, phone?, lang?, code? }
//   PUBLIC (token-gated). Enforces verify-device-once for non-repudiation:
//     • trusted device (cookie)         → records the order + texts a receipt.
//     • untrusted, no code               → texts a 6-digit code, returns { needs_verify }.
//     • untrusted, code present          → verifies, trusts the device (Set-Cookie), records.
//   Every submission writes an append-only audit row. ok:false is returned 200 so the intake
//   page can show the message inline. Rate-limited.
import { json, bad } from '../../_lib/util.js';
import { processIntake } from '../../_lib/contract.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const limited = await limitOr429(env, request, { name: 'contract-headcount', limit: 20, windowSec: 60 });
  if (limited) return limited;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const r = await processIntake(env, {
    token: b && b.t,
    count: b && b.count,
    notes: b && b.notes,
    name: b && b.name,
    phone: b && b.phone,
    lang: b && b.lang,
    code: b && b.code,
    cookieHeader: request.headers.get('Cookie') || '',
    ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '',
    userAgent: request.headers.get('User-Agent') || '',
  });

  // On a freshly-verified device, set the trusted-device cookie (180 days, HttpOnly).
  const headers = {};
  if (r && r.set_cookie) {
    const c = r.set_cookie;
    headers['Set-Cookie'] = `${c.name}=${c.value}; Path=/; Max-Age=${c.maxAge}; HttpOnly; Secure; SameSite=Lax`;
    delete r.set_cookie; // never expose the token in the JSON body
  }
  return json(r, 200, headers);
};
