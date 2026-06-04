// Square meal-plan subscription tiers. Variation IDs are ENVIRONMENT-SPECIFIC — the ones
// below are SANDBOX (created 2026-06-04). At go-live, recreate the plans in the production
// Square catalog and override each via env (SQUARE_PLAN_5_VAR / _10_VAR / _12_VAR).
// Files under functions/_lib are not routed.

export const PLAN_TIERS = {
  plan_5:  { label: 'Añejo Weekly · 5 bowls',  bowls: 5,  weeklyCents: 9900,  variationId: 'MBSQEV6FIF62QD6SWMWRZMNE' },
  plan_10: { label: 'Añejo Weekly · 10 bowls', bowls: 10, weeklyCents: 18900, variationId: 'GBA6POKJXSPTS2O7TMRXOQ75' },
  plan_12: { label: 'Añejo Weekly · 12 bowls', bowls: 12, weeklyCents: 21900, variationId: 'TJ2Y7JYRZOSLESSCM3OX46OS' },
};

export function isPlanTier(key) {
  return Object.prototype.hasOwnProperty.call(PLAN_TIERS, key);
}

// Env override lets production swap in its own catalog variation IDs without a code change.
export function planVariationId(env, key) {
  const t = PLAN_TIERS[key];
  if (!t) return null;
  return env['SQUARE_' + key.toUpperCase() + '_VAR'] || t.variationId;
}
