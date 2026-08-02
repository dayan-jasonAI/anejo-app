// /api/hub/owner/social-cadence-config — owner-configurable social planner cadence (stored in KV).
//   GET  → { ok, config:{feed_per_week, stories_per_day_min, stories_per_day_max}, defaults }
//   POST { feed_per_week?, stories_per_day_min?, stories_per_day_max? } → saves, returns config.
// Owner-only. Takes effect on the NEXT social_plan run — the weekly Sunday tick or a manual
// re-run from the HUB (functions/api/hub/admin/*); nothing here re-runs the planner itself.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { getCadenceConfig, setCadenceConfig, CADENCE_DEFAULTS } from '../../../_lib/social_cadence.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, config: await getCadenceConfig(env), defaults: CADENCE_DEFAULTS });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const cur = await getCadenceConfig(env);
  const r = await setCadenceConfig(env, { ...cur, ...(b || {}) });
  if (!r.ok) return bad(r.error || 'Could not save.', 400);
  return json({ ok: true, config: r.config });
};
