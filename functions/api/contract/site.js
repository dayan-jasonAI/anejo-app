// GET /api/contract/site?t=<site token>  — PUBLIC context for the intake page (site, date,
// delivery-today flag, cutoff state, price, and any count already submitted today).
import { json } from '../../_lib/util.js';
import { siteContext } from '../../_lib/contract.js';

export const onRequestGet = async ({ request, env }) => {
  const t = new URL(request.url).searchParams.get('t') || '';
  const r = await siteContext(env, t, undefined, { cookieHeader: request.headers.get('Cookie') || '' });
  return json(r);
};
