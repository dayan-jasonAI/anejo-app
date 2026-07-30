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
  return json({ ok: true, geocoding: result, coverage });
};
