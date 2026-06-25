// GET /api/hub/owner/square-health — owner-only Square auth/config probe.
// Makes one authenticated GET /v2/locations and reports whether the token works and whether
// the configured SQUARE_LOCATION_ID belongs to that token's account. Returns NO secret values
// (only non-sensitive location ids/names). Handy for diagnosing "could not be authorized" and
// for verifying the sandbox→production flip at go-live.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { square, squareBase, squareConfigured } from '../../../_lib/square.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  const out = {
    env: env.SQUARE_ENV === 'production' ? 'production' : 'sandbox',
    host: squareBase(env),
    configured: squareConfigured(env),
    has_access_token: !!env.SQUARE_ACCESS_TOKEN,
    configured_location_id: env.SQUARE_LOCATION_ID || null,
  };
  if (!env.SQUARE_ACCESS_TOKEN) return json({ ...out, ok: false, error: 'SQUARE_ACCESS_TOKEN is not set.' });

  const r = await square(env, '/v2/locations');
  out.status = r.status;
  out.ok = r.ok;
  if (!r.ok) {
    // e.g. { category:'AUTHENTICATION_ERROR', code:'UNAUTHORIZED', detail:'This request could not be authorized.' }
    out.error = (r.data && r.data.errors && r.data.errors[0]) || { detail: 'Unknown Square error.' };
    out.hint = 'Token rejected by ' + out.host + '. Use the SANDBOX access token for sandbox, PRODUCTION for production — and redeploy after changing the secret.';
    return json(out);
  }

  const locs = (r.data && r.data.locations) || [];
  out.location_count = locs.length;
  out.location_ids = locs.map((l) => l.id);
  out.location_names = locs.map((l) => l.name);
  out.location_match = !!env.SQUARE_LOCATION_ID && locs.some((l) => l.id === env.SQUARE_LOCATION_ID);
  if (!out.location_match) out.hint = 'Token is valid, but SQUARE_LOCATION_ID is not one of this account’s locations — set it to one of location_ids above.';
  return json(out);
};
