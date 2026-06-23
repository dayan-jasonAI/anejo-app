// /api/hub/owner/pay-config — owner-configurable driver route-pay rates (stored in KV).
//   GET  → { ok, config:{base_cents, per_stop_cents, per_mile_cents, min_cents}, defaults }
//   POST { base_cents?, per_stop_cents?, per_mile_cents?, min_cents? } → saves, returns config.
// Owner-only. Rates take effect on the NEXT route assigned (existing routes keep their pay).
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { getPayConfig, setPayConfig, PAY_DEFAULTS } from '../../../_lib/pay.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, config: await getPayConfig(env), defaults: PAY_DEFAULTS });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const r = await setPayConfig(env, b || {});
  if (!r.ok) return bad(r.error || 'Could not save.', 400);
  return json({ ok: true, config: r.config });
};
