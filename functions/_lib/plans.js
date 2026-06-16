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

// Delivery schedule is fixed PER TIER (data-driven — never hardcode in markup):
//   bowlsPerDay  — how many bowls drop each delivery day
//   days         — ISO weekdays the tier delivers (1=Mon … 6=Sat; Sun=0 never)
//   chooseWindow — true ⇒ 1 bowl/day, customer MUST pick Lunch OR Dinner;
//                  false ⇒ 2 bowls/day delivered as one lunch + one dinner (no choice)
// Invariant enforced below: bowlsPerDay × days.length === bowls.
export const PLAN_TIERS = {
  plan_5:  { label: 'Añejo Weekly · 5 bowls',  bowls: 5,  weeklyCents: 9900,  variationId: 'MBSQEV6FIF62QD6SWMWRZMNE',
             bowlsPerDay: 1, days: [1, 2, 3, 4, 5],    chooseWindow: true },   // Mon–Fri · pick a window
  plan_10: { label: 'Añejo Weekly · 10 bowls', bowls: 10, weeklyCents: 18900, variationId: 'GBA6POKJXSPTS2O7TMRXOQ75',
             bowlsPerDay: 2, days: [1, 2, 3, 4, 5],    chooseWindow: false },  // Mon–Fri · lunch + dinner
  plan_12: { label: 'Añejo Weekly · 12 bowls', bowls: 12, weeklyCents: 21900, variationId: 'TJ2Y7JYRZOSLESSCM3OX46OS',
             bowlsPerDay: 2, days: [1, 2, 3, 4, 5, 6], chooseWindow: false },  // Mon–Sat · lunch + dinner
};

// Fail fast if a tier's schedule can't produce its bowl count (12=2×6, 10=2×5, 5=1×5).
for (const [k, t] of Object.entries(PLAN_TIERS)) {
  if (t.bowlsPerDay * t.days.length !== t.bowls) {
    throw new Error(`PLAN_TIERS[${k}] schedule mismatch: ${t.bowlsPerDay}×${t.days.length} ≠ ${t.bowls}`);
  }
}

const DOW_LABEL = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

export function isPlanTier(key) {
  return Object.prototype.hasOwnProperty.call(PLAN_TIERS, key);
}

// Meal windows a subscription receives for a tier + (optional) customer choice.
// 2-bowl tiers always get both; 1-bowl tiers use the chosen window (default lunch).
export function tierWindows(key, chosenWindow) {
  const t = PLAN_TIERS[key];
  if (!t || !t.chooseWindow) return 'lunch,dinner';
  return chosenWindow === 'dinner' ? 'dinner' : 'lunch';
}

// Human-readable day span, e.g. "Mon–Sat" / "Mon–Fri".
export function tierDaysLabel(key) {
  const t = PLAN_TIERS[key];
  if (!t || !t.days.length) return '';
  return `${DOW_LABEL[t.days[0]]}–${DOW_LABEL[t.days[t.days.length - 1]]}`;
}

// Env override lets production swap in its own catalog variation IDs without a code change.
export function planVariationId(env, key) {
  const t = PLAN_TIERS[key];
  if (!t) return null;
  return env['SQUARE_' + key.toUpperCase() + '_VAR'] || t.variationId;
}
