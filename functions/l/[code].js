// GET /l/:code — public tracked redirect: the hop between an Instagram bio tap and the site.
//
// Two rules govern everything here, because the person on the other end is a CUSTOMER mid-tap,
// not an API client:
//   1. The redirect always wins. Click recording runs off the response path (waitUntil) and
//      swallows every failure — a D1 hiccup must cost one analytics row, never a sale.
//   2. Nobody ever sees a 404. An unknown, retired, or mistyped code means the bio link is stale
//      or the DB is down; either way a human tapped it, so they land on the homepage untagged
//      instead of a dead end.
//
// The utm_* params appended here are the whole point: /order stashes them (anejo:attr) and sends
// them with checkout, where parseAttribution (checkout.js, 0044) records them on the order —
// which is what lets the owner links report join taps to sales by utm_campaign.
import { id, now } from '../_lib/util.js';

const HOME = 'https://anejocateringco.com';

// The visitor's IP never touches the database — a raw IP is PII, and this log has no retention
// story. A salted SHA-256 keeps a stable per-visitor token so unique taps are still countable.
async function hashIp(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip) return null;
  const salt = env.IP_HASH_SALT || 'anejo-links-v1';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + ip));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Resolve the stored destination against the REQUEST's origin (a preview deploy stays on the
// preview host) and append the link's utm_* — after any params the destination already carries
// (an explicit param on the destination beats the link's default) and before any #fragment,
// which the URL API handles for /#tasting-style anchors.
function buildDest(link, origin) {
  const u = new URL(link.dest_url, origin);
  for (const [k, v] of [['utm_source', link.utm_source], ['utm_medium', link.utm_medium], ['utm_campaign', link.utm_campaign]]) {
    if (v && !u.searchParams.get(k)) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export const onRequestGet = async (context) => {
  const { request, env, params } = context;
  const redirect = (url) => new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });

  const code = String((params && params.code) || '').trim().toLowerCase();
  if (!code || !env.DB) return redirect(HOME);

  let link = null;
  try {
    link = await env.DB.prepare(
      'SELECT id, dest_url, utm_source, utm_medium, utm_campaign FROM tracked_links WHERE code=? AND active=1'
    ).bind(code).first();
  } catch { /* DB down → the visitor still lands somewhere real */ }
  if (!link) return redirect(HOME);

  let dest;
  try { dest = buildDest(link, new URL(request.url).origin); }
  catch { dest = HOME; /* a malformed stored dest_url must not strand the visitor */ }

  // Best-effort, off the response path: the tap is recorded after the 302 is already on the wire.
  const record = (async () => {
    try {
      await env.DB.prepare(
        'INSERT INTO link_clicks (id, link_id, clicked_at, referer, user_agent, ip_hash) VALUES (?,?,?,?,?,?)'
      ).bind(
        id('lc'), link.id, now(),
        String(request.headers.get('referer') || '').slice(0, 300) || null,
        String(request.headers.get('user-agent') || '').slice(0, 200) || null,
        await hashIp(request, env)
      ).run();
    } catch { /* one lost analytics row, never a lost redirect */ }
  })();
  try { if (typeof context.waitUntil === 'function') context.waitUntil(record); } catch { /* best-effort */ }

  return redirect(dest);
};
