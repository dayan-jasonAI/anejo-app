// /api/hub/owner/social-icebreakers — publish Añejo's Instagram "Ice Breakers": the tappable
// starter buttons a user sees when they OPEN the DMs (compliant — it never messages first).
//   GET  → { ok, ice_breakers, configured }   preview the buttons + whether IG is connected
//   POST → publishes them to the connected IG account; returns { ok, ice_breakers } or an error
// Owner/marketing-desk only. Taps route into Aña's normal reply flow (see webhooks/instagram.js).
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { igConfigured } from '../../../_lib/instagram.js';
import { ICE_BREAKERS, publishIceBreakers } from '../../../_lib/instagram_icebreakers.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, ice_breakers: ICE_BREAKERS, configured: igConfigured(env) });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!igConfigured(env)) return bad('Instagram is not connected yet — add IG_ACCESS_TOKEN first.', 503);
  const r = await publishIceBreakers(env);
  if (!r.ok) return bad(r.error || 'Could not publish ice breakers.', 502);
  return json({ ok: true, ice_breakers: r.ice_breakers });
};
