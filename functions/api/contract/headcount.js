// POST /api/contract/headcount  { t: <site token>, count: <int>, by?: <name> }
//   PUBLIC (token-gated): a site contact submits today's head count → creates/updates the
//   day's kitchen order + ledger row. Rate-limited. ok:false is returned 200 with a message
//   so the intake page can show it inline.
import { json, bad } from '../../_lib/util.js';
import { submitHeadcount } from '../../_lib/contract.js';
import { limitOr429 } from '../../_lib/ratelimit.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const limited = await limitOr429(env, request, { name: 'contract-headcount', limit: 20, windowSec: 60 });
  if (limited) return limited;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const r = await submitHeadcount(env, { token: b && b.t, count: b && b.count, submittedBy: b && b.by });
  return json(r);
};
