// GET /api/hub/owner/geo-check — is address geocoding actually working?
//
// Exists because it was NOT, silently, for every order ever placed: GOOGLE_MAPS_API_KEY was set,
// geocode() returned null every time, and the failure reason was swallowed — so delivery_lat is
// NULL on 100% of orders and nothing anywhere said why. Routing, driven miles and delivery-radius
// checks all quietly degrade when this is broken, and none of them complain.
//
// One lookup against a known-good address, so the answer is about the KEY rather than the input.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { geoSelfTest } from '../../../_lib/geo.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  const result = await geoSelfTest(env);

  let coverage = null;
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN delivery_lat IS NOT NULL THEN 1 ELSE 0 END) AS geocoded FROM orders WHERE delivery_street IS NOT NULL AND status != 'canceled'"
    ).first();
    coverage = { orders_with_address: Number((r && r.total) || 0), geocoded: Number((r && r.geocoded) || 0) };
  } catch { coverage = null; }

  if (!env.DB) return bad('Database not configured.', 500);

  // Opened straight from the address bar, answer in English rather than JSON. This gets read once,
  // in a hurry, by someone deciding what to change in Google Cloud — not parsed by anything.
  if ((request.headers.get('accept') || '').includes('text/html')) {
    const g = result;
    const verdict = g.ok
      ? `<p class="ok"><b>Working.</b> Resolved the test address to ${esc(g.resolved || '')} (${g.lat}, ${g.lng}).</p>`
      : `<p class="bad"><b>Not working.</b> Google returned <code>${esc(g.status || 'no response')}</code>` +
        (g.message ? ` — ${esc(g.message)}` : '') + `</p><p>${esc(g.hint || '')}</p>`;
    const cov = coverage
      ? `<p class="note">${coverage.geocoded} of ${coverage.orders_with_address} delivery addresses have coordinates.` +
        (coverage.geocoded === 0 && coverage.orders_with_address > 0
          ? ' None of them do, which is what a broken key looks like from the outside.' : '') + '</p>'
      : '';
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
       <title>Geocoding check</title>
       <style>body{font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 18px;color:#1b3a2b}
       h1{font-size:19px;letter-spacing:.08em;text-transform:uppercase}code{background:#f2f0ea;padding:2px 6px;border-radius:4px;font-size:14px}
       .ok{background:#e7f0ea;border:1px solid #2c6b3f;padding:12px 14px;border-radius:8px}
       .bad{background:#fdf0ef;border:1px solid #b3402f;padding:12px 14px;border-radius:8px}
       .note{color:#5b5b5b;font-size:14px}a{color:#8B6B3E}</style>
       <h1>Añejo · Geocoding check</h1>${verdict}${cov}
       <p class="note">Tested with <code>${esc(g.probe || '')}</code>. Reload this page after changing anything in Google Cloud.</p>
       <p><a href="/hub/owner/">← Back to the HUB</a></p>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  return json({ ok: true, geocoding: result, coverage });
};

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
