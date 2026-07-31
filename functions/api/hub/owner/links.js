// /api/hub/owner/links — the tracked-link desk (owner-only).
//   GET                                        → every link + 7/30-day clicks + attributed orders
//   POST { op:'create', label, dest_url, ... } → new link with an auto-generated short code
//   POST { op:'toggle', id }                   → retire / revive a link (the bio keeps working:
//                                                an inactive code falls back to the homepage)
//
// "Attributed orders" counts PAID-or-later orders whose utm_campaign matches the link's — the
// same join key the redirect stamps on the visit and checkout records on the order (0044).
// Pending rows are checkout starts that never paid; counting them would let the report claim
// revenue the register never saw.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

const DAY = 86400000;

// Short, lowercase, URL-safe code for /l/<code>. No ambiguous characters — these get read off a
// phone screen and typed into Meta's bio field by hand.
function linkCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => alphabet[b % alphabet.length]).join('');
}

// A destination is either a path on our own site or an explicit https URL. Anything else is
// refused: /l/* is a PUBLIC redirect, and a permissive dest field is an open-redirect service
// for whoever phishes their way into an owner session.
function cleanDest(raw) {
  const s = String(raw == null ? '' : raw).trim().slice(0, 500);
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { if (new URL(s).protocol === 'https:') return s; } catch { /* fall through */ }
  return null;
}

const cleanUtm = (v) => (String(v == null ? '' : v).trim().slice(0, 120) || null);

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const t = now();
  const links = ((await env.DB.prepare(
    'SELECT id, code, label, dest_url, utm_source, utm_medium, utm_campaign, active, created_at FROM tracked_links ORDER BY created_at'
  ).all()).results) || [];

  // One grouped pass per side of the join, stitched in JS — not a per-link query fan-out.
  const clicks = {};
  try {
    const r = await env.DB.prepare(
      `SELECT link_id,
              SUM(CASE WHEN clicked_at > ? THEN 1 ELSE 0 END) AS c7,
              SUM(CASE WHEN clicked_at > ? THEN 1 ELSE 0 END) AS c30,
              COUNT(*) AS total
         FROM link_clicks GROUP BY link_id`
    ).bind(t - 7 * DAY, t - 30 * DAY).all();
    for (const row of (r && r.results) || []) clicks[row.link_id] = row;
  } catch { /* no clicks yet (fresh migration) → zeros below */ }

  const orders = {};
  try {
    const r = await env.DB.prepare(
      `SELECT utm_campaign, COUNT(*) AS n FROM orders
        WHERE utm_campaign IS NOT NULL AND status IN ('paid','prep','ready','fulfilled')
        GROUP BY utm_campaign`
    ).all();
    for (const row of (r && r.results) || []) orders[row.utm_campaign] = row.n;
  } catch { /* attribution columns predate some early envs → zeros below */ }

  return json({
    ok: true,
    links: links.map((l) => ({
      ...l,
      url: `https://anejocateringco.com/l/${l.code}`,
      clicks_7d: (clicks[l.id] && clicks[l.id].c7) || 0,
      clicks_30d: (clicks[l.id] && clicks[l.id].c30) || 0,
      clicks_total: (clicks[l.id] && clicks[l.id].total) || 0,
      orders_attributed: (l.utm_campaign && orders[l.utm_campaign]) || 0,
    })),
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || '';
  const t = now();

  if (op === 'create') {
    const label = String(b.label == null ? '' : b.label).trim().slice(0, 120);
    if (!label) return bad('Enter a label for the link.');
    const dest = cleanDest(b.dest_url);
    if (!dest) return bad('Destination must be a site path (/order) or an https:// URL.');

    let code = linkCode();
    const lid = id('lnk');
    // utm_campaign defaults to the code itself so the orders join works with zero configuration.
    const utm = {
      source: cleanUtm(b.utm_source) || 'instagram',
      medium: cleanUtm(b.utm_medium) || 'bio',
      campaign: cleanUtm(b.utm_campaign) || code,
    };
    const insert = (c) => env.DB.prepare(
      `INSERT INTO tracked_links (id, code, label, dest_url, utm_source, utm_medium, utm_campaign, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,1,?,?)`
    ).bind(lid, c, label, dest, utm.source, utm.medium, utm.campaign === code ? c : utm.campaign, t, t).run();
    try {
      await insert(code);
    } catch (e) {
      // Random 6-char collision → one regenerate, same as partners.js codes.
      if (String(e.message || '').includes('UNIQUE')) { code = linkCode(); await insert(code); }
      else return bad('Could not create that link.', 500);
    }
    return json({ ok: true, id: lid, code, url: `https://anejocateringco.com/l/${code}` });
  }

  if (op === 'toggle') {
    const lid = String(b.id == null ? '' : b.id).trim();
    if (!lid) return bad('Pick a link.');
    const r = await env.DB.prepare(
      'UPDATE tracked_links SET active = CASE WHEN active=1 THEN 0 ELSE 1 END, updated_at=? WHERE id=?'
    ).bind(t, lid).run();
    if (!r.meta || !r.meta.changes) return bad('No such link.', 404);
    const row = await env.DB.prepare('SELECT active FROM tracked_links WHERE id=?').bind(lid).first();
    return json({ ok: true, id: lid, active: row ? row.active : null });
  }

  return bad('Unknown op.');
};
