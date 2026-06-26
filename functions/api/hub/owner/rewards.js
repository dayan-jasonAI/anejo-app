// /api/hub/owner/rewards — owner Rewards admin: program stats + tunable config.
//   GET  → { ok, config, stats:{outstanding,earned,redeemed,redemptions,members,tiers}, top[], recent[] }
//   POST { earn_per_dollar?, redeem_per_dollar?, thresholds?, mults?, free_delivery_min_tier? } → saves.
// Owner-only. Config is KV-backed and consumed by _lib/rewards.js across earn/redeem/display.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { getRewardsConfig, setRewardsConfig, tierForSpend } from '../../../_lib/rewards.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const config = await getRewardsConfig(env);

  let outstanding = 0, earned = 0, redeemed = 0, redemptions = 0, members = 0;
  try {
    const t = await env.DB.prepare(
      "SELECT COALESCE(SUM(delta),0) AS outstanding, " +
      "COALESCE(SUM(CASE WHEN reason='earn' THEN delta ELSE 0 END),0) AS earned, " +
      "COALESCE(SUM(CASE WHEN reason='redeem' THEN -delta ELSE 0 END),0) AS redeemed, " +
      "COALESCE(SUM(CASE WHEN reason='redeem' THEN 1 ELSE 0 END),0) AS redemptions, " +
      "COUNT(DISTINCT email) AS members FROM points_ledger"
    ).first();
    if (t) { outstanding = t.outstanding; earned = t.earned; redeemed = t.redeemed; redemptions = t.redemptions; members = t.members; }
  } catch { /* table may be empty */ }

  const tiers = { vital: 0, thriving: 0, legend: 0, immortal: 0 };
  try {
    const rows = (await env.DB.prepare(
      "SELECT SUM(total_estimate_cents) AS spend FROM orders " +
      "WHERE customer_email IS NOT NULL AND TRIM(customer_email)<>'' AND status IN ('paid','fulfilled') " +
      "GROUP BY LOWER(TRIM(customer_email))"
    ).all()).results || [];
    for (const r of rows) { const k = tierForSpend(r.spend || 0, config).key; tiers[k] = (tiers[k] || 0) + 1; }
  } catch { /* ignore */ }

  let top = [], recent = [];
  try {
    top = ((await env.DB.prepare(
      "SELECT email, SUM(delta) AS bal FROM points_ledger GROUP BY email HAVING bal > 0 ORDER BY bal DESC LIMIT 8"
    ).all()).results) || [];
  } catch { top = []; }
  try {
    recent = ((await env.DB.prepare(
      "SELECT email, delta, reason, note, created_at FROM points_ledger ORDER BY created_at DESC LIMIT 12"
    ).all()).results) || [];
  } catch { recent = []; }

  return json({ ok: true, config, stats: { outstanding, earned, redeemed, redemptions, members, tiers }, top, recent });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const r = await setRewardsConfig(env, b || {});
  if (!r.ok) return bad(r.error || 'Could not save rewards settings.', 400);
  return json({ ok: true, config: r.config });
};
