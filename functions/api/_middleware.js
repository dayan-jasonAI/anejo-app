// CSRF defense-in-depth for /api/* (Pages middleware — wraps every /api route).
//
// Browsers ALWAYS send an `Origin` header on state-changing requests (POST/PUT/PATCH/DELETE),
// same-origin or cross-origin. A forged cross-site request therefore arrives with the attacker's
// Origin, which won't match ours — so we reject it. This complements the existing SameSite=Lax
// cookie and JSON-only handlers; together they make browser-driven CSRF infeasible.
//
// Deliberately NOT blocked:
//   • Safe methods (GET/HEAD/OPTIONS) — non-mutating.
//   • /api/webhooks/* — server-to-server (Square/Twilio); no browser Origin, verified by HMAC.
//   • Requests with no Origin at all — non-browser clients (curl, server-to-server); these are
//     not a CSRF vector (CSRF requires a victim's browser, which always sends Origin on mutations).

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Static allow-list of canonical first-party hosts (in addition to the request's own host, which
// already covers apex/www in prod and the *.pages.dev preview being hit).
const ALLOWED_HOSTS = new Set(['anejocateringco.com', 'www.anejocateringco.com']);

function originAllowed(requestUrl, origin) {
  try {
    const o = new URL(origin);
    if (o.protocol !== 'https:' && o.protocol !== 'http:') return false;
    const reqHost = new URL(requestUrl).host;
    if (o.host === reqHost) return true;              // same-origin (incl. the preview host hit)
    if (ALLOWED_HOSTS.has(o.host)) return true;       // canonical production hosts
    if (o.host.endsWith('.anejo-app.pages.dev')) return true; // Pages preview/branch deploys
    return false;
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (!SAFE_METHODS.has(request.method) && !url.pathname.startsWith('/api/webhooks/')) {
    const origin = request.headers.get('Origin');
    if (origin && !originAllowed(request.url, origin)) {
      return new Response(JSON.stringify({ error: 'Cross-site request blocked.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
}
