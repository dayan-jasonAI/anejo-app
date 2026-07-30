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
import { geoSelfTest, geocode, formatAddress } from '../../../_lib/geo.js';

/**
 * Fill in coordinates for rows saved while geocoding was broken.
 *
 * Bounded and idempotent: only rows where the latitude is NULL, capped per run, and a row that
 * fails to resolve is simply left alone for a human to look at rather than written as 0,0 —
 * which would route a driver into the Atlantic off the coast of Africa.
 */
const BACKFILL_MAX = 40;

async function backfill(env) {
  const done = { orders: 0, sites: 0, clients: 0, failed: [] };
  const t = Date.now();

  const fill = async (sql, rows, apply) => {
    for (const r of rows) {
      const line = formatAddress({ street: r.street, unit: r.unit, city: r.city, state: r.state, zip: r.zip });
      if (!line) continue;
      const g = await geocode(env, line);
      if (!g) { done.failed.push(line); continue; }
      await apply(r, g);
    }
  };

  const o = await env.DB.prepare(
    "SELECT id, delivery_street AS street, delivery_unit AS unit, delivery_city AS city, delivery_state AS state, delivery_zip AS zip FROM orders WHERE delivery_street IS NOT NULL AND delivery_lat IS NULL AND status != 'canceled' LIMIT ?"
  ).bind(BACKFILL_MAX).all().catch(() => null);
  await fill(null, (o && o.results) || [], async (r, g) => {
    await env.DB.prepare('UPDATE orders SET delivery_lat=?, delivery_lng=?, geocoded_at=? WHERE id=?')
      .bind(g.lat, g.lng, t, r.id).run();
    done.orders += 1;
  });

  const s2 = await env.DB.prepare(
    'SELECT id, street, unit, city, state, zip FROM contract_sites WHERE delivery_lat IS NULL LIMIT ?'
  ).bind(BACKFILL_MAX).all().catch(() => null);
  await fill(null, (s2 && s2.results) || [], async (r, g) => {
    await env.DB.prepare('UPDATE contract_sites SET delivery_lat=?, delivery_lng=? WHERE id=?')
      .bind(g.lat, g.lng, r.id).run();
    done.sites += 1;
  });

  const c = await env.DB.prepare(
    'SELECT id, delivery_street AS street, delivery_unit AS unit, delivery_city AS city, delivery_state AS state, delivery_zip AS zip FROM clients WHERE delivery_street IS NOT NULL AND delivery_lat IS NULL LIMIT ?'
  ).bind(BACKFILL_MAX).all().catch(() => null);
  await fill(null, (c && c.results) || [], async (r, g) => {
    await env.DB.prepare('UPDATE clients SET delivery_lat=?, delivery_lng=? WHERE id=?')
      .bind(g.lat, g.lng, r.id).run();
    done.clients += 1;
  });

  return done;
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const test = await geoSelfTest(env);
  // Refuse rather than march through every row writing nothing and reporting success.
  if (!test.ok) return bad('Geocoding is still not working — fix that first, or the backfill does nothing.', 409);

  const r = await backfill(env);
  const wants = (request.headers.get('accept') || '').includes('text/html');
  if (!wants) return json({ ok: true, ...r });
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2;url=/api/hub/owner/geo-check">
     <style>body{font:16px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:40px auto;padding:0 18px;color:#1b3a2b}</style>
     <p><b>Backfilled.</b> ${r.orders} orders, ${r.sites} sites, ${r.clients} clients.` +
    (r.failed.length ? ` ${r.failed.length} could not be resolved and were left alone.` : '') +
    `</p><p>Returning to the check…</p>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
};

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
    const missing = coverage ? coverage.orders_with_address - coverage.geocoded : 0;
    const cov = coverage
      ? `<p class="note">${coverage.geocoded} of ${coverage.orders_with_address} delivery addresses have coordinates.` +
        (missing > 0
          ? (g.ok
            // Same number, opposite conclusion depending on whether the key works. Saying "this is
            // what a broken key looks like" while the key demonstrably works would be wrong.
            ? ` The ${missing} without were saved while geocoding was failing — they will not fix themselves.</p>` +
              `<form method="POST"><button style="font:inherit;padding:10px 16px;border:1px solid #2c6b3f;background:#2c6b3f;color:#fff;border-radius:8px;cursor:pointer">Backfill the ${missing} missing now</button></form>`
            : ' None of them do, which is what a broken key looks like from the outside.</p>')
          : '</p>')
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
