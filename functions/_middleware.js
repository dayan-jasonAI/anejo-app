// Top-level Pages middleware — runs on EVERY request. Two jobs:
//   1) Canonical host: 301 www → apex (Pages serves the same build on all hosts; _redirects can't
//      match hosts). Preview *.pages.dev + apex pass through.
//   2) First-party, cookieless, no-PII analytics: log HTML pageviews to D1 (path, referrer source,
//      country, language). No IP / cookie / user-agent stored. Best-effort via waitUntil so it never
//      delays the response. Replaces the need for a third-party analytics ID to "measure organic".
const STATIC_EXT = /\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|xml|txt|json|webmanifest|wav|mp3|mp4)$/i;
function refSource(refHost, host) {
  if (!refHost) return ['direct', null];
  if (refHost === host) return ['internal', refHost];
  if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave)\./i.test(refHost)) return ['organic', refHost];
  if (/(^|\.)(facebook|instagram|t\.co|twitter|x\.com|linkedin|pinterest|tiktok|reddit|youtube)\b/i.test(refHost)) return ['social', refHost];
  return ['referral', refHost];
}
function shouldLog(request, url) {
  if (request.method !== 'GET') return false;
  if (!(request.headers.get('Accept') || '').includes('text/html')) return false;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/assets/') || p.startsWith('/.well-known/') || p.startsWith('/hub/')) return false;
  if (STATIC_EXT.test(p)) return false;
  return true;
}
async function logView(env, request, url) {
  try {
    let refHost = null;
    const ref = request.headers.get('Referer');
    if (ref) { try { refHost = new URL(ref).hostname.replace(/^www\./, ''); } catch (_) {} }
    const [source, rhost] = refSource(refHost, url.hostname.replace(/^www\./, ''));
    const country = request.headers.get('cf-ipcountry') || (request.cf && request.cf.country) || null;
    const lang = url.pathname === '/es' || url.pathname.startsWith('/es/') ? 'es' : 'en';
    const id = 'pv_' + crypto.getRandomValues(new Uint8Array(8)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    await env.DB.prepare('INSERT INTO page_views (id, path, ref_source, ref_host, country, lang, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, url.pathname.slice(0, 200), source, rhost, country, lang, Date.now()).run();
  } catch (_) { /* analytics is best-effort; never surface */ }
}
export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  if (url.hostname === 'www.anejocateringco.com') {
    url.hostname = 'anejocateringco.com';
    return Response.redirect(url.toString(), 301);
  }
  try { if (env.DB && shouldLog(request, url)) context.waitUntil(logView(env, request, url)); } catch (_) {}
  return next();
}
