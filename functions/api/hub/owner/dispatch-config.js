// /api/hub/owner/dispatch-config — owner settings for automated dispatch (stored in KV).
//   GET  → { ok, config:{ enabled, time_et, windows[], max_per_route } }
//   POST { enabled?, time_et?, windows?, max_per_route? } → saves, returns config.
// Owner-only. When enabled, the minutely tick auto-builds + offers the day's routes at time_et.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { getAutoConfig, setAutoConfig } from '../../../_lib/autodispatch.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, config: await getAutoConfig(env) });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const r = await setAutoConfig(env, b || {});
  if (!r.ok) return bad(r.error || 'Could not save.', 400);
  return json({ ok: true, config: r.config });
};
