// Square meal-plan subscription tiers. Variation IDs are ENVIRONMENT-SPECIFIC — the ones
// below are SANDBOX (created 2026-06-04). At go-live, recreate the plans in the production
// Square catalog and override each via env (SQUARE_PLAN_5_VAR / _10_VAR / _12_VAR).
// Files under functions/_lib are not routed.
//
// NOTE (dynamic bowl sizing, 2026-06): bowls are portion-sized per client and priced from
// functions/_lib/sizing.js. These plan variations now serve only as the CADENCE anchor (weekly) +
// bowl COUNT (5/10/12); subscriptions/create.js overrides the phase price with the member's sized
// weekly amount (STATIC pricing) so Square charges the same number shown on /subscribe. weeklyCents
// below is the standard-bowl fallback used only when a subscription has no sizing.
// Go-live: recreate these variations in the PRODUCTION catalog and verify phase-price override in
// sandbox first (covered by PROVISIONING).

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
