// /api/hub/owner/marketing-attribution — GET only (owner-only).
//
// Answers the question the marketing cockpit could never answer before 0076: did a training
// rule, a campaign brief, a category, or a format actually correlate with better reach? Backed by
// functions/_lib/instagram_insights.js:attributionRollup, which is honest about sample size — a
// comparison with too few posts on either side comes back with enoughData:false rather than a
// confident-looking ranking built on noise. This route does no math of its own; it only gates
// access and forwards the rollup so the HUB card can render "not enough data yet" itself.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { attributionRollup } from '../../../_lib/instagram_insights.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const rollup = await attributionRollup(env);
  return json(rollup);
};
