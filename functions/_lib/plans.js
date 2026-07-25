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

// Per-bowl floor/cap of the sizing model — reused below to sanity-check a D1 weekly price.
import { PER_BOWL_CENTS_MIN, PER_BOWL_CENTS_MAX } from './sizing.js';

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

// ---- Weekly price, as data ---------------------------------------------------------------------
// The à-la-carte menu became data in migration 0043 so the owner could reprice without a deploy.
// A weekly tier price is the same kind of number, so it lives in the same place: one row in
// menu_modifier_prices per tier, key `plan_<n>_weekly`, cents = the weekly charge.
//
// Money must never depend on a D1 read succeeding. An unreachable D1, a missing row, or a value
// outside the sizing model's per-bowl floor/cap all fall back to weeklyCents above. Rejecting an
// out-of-band row rather than clamping it means a fat-fingered edit bills the last known-good
// price instead of one nobody chose.
//
// Unlike menu.js this DOES fall back per tier rather than all-or-nothing. There the concern was a
// bowl the owner had deactivated staying purchasable; tiers are fixed in code and can't be
// deactivated, so a missing row only ever means "this one hasn't been moved to D1 yet".
//
// CAVEAT: this only moves the STANDARD (unsized) weekly price. A subscription with bowl sizing is
// priced perBowlCents × bowls from sizing.js BASE_BOWL_PRICE_USD, which is still a code constant.

/** D1 key holding a tier's weekly price. plan_12 -> plan_12_weekly */
export const planPriceKey = (tierKey) => tierKey + '_weekly';

/**
 * The price the Square CATALOG VARIATION was actually provisioned at.
 *
 * This is the number every "do we need an ad-hoc variation?" decision must compare against —
 * NOT the D1-resolved tier. Square subscription variations are STATIC: `swap-plan` and
 * `CreateSubscription` charge whatever the variation says, and Square has no price-override field.
 * So if a caller compares the amount it intends to charge against a D1-resolved tier, the two match
 * whenever D1 changed the price, the override never fires, and Square keeps billing the OLD catalog
 * amount forever while /subscribe displays the new one. Comparing against this constant makes a D1
 * price change behave exactly like a sized bowl: it mints a variation at the real amount.
 *
 * loadPlanTiers() copies PLAN_TIERS rather than mutating it, so this stays the provisioned price.
 */
export const catalogWeeklyCents = (tierKey) => (PLAN_TIERS[tierKey] || {}).weeklyCents;

// A weekly price is only believable inside the same per-bowl band the sizing model already
// enforces — anything else is a typo (or a wrong-units edit) and is ignored.
function usableWeeklyCents(tier, cents) {
  const c = Number(cents);
  if (!Number.isInteger(c)) return null;
  if (c < PER_BOWL_CENTS_MIN * tier.bowls || c > PER_BOWL_CENTS_MAX * tier.bowls) return null;
  return c;
}

/**
 * PLAN_TIERS with weeklyCents resolved against D1.
 * Returns { tiers, source: 'd1' | 'fallback' } — 'd1' only when at least one row was applied.
 * Callers get the same tier shape as PLAN_TIERS, so this is a drop-in for it on the money path.
 */
export async function loadPlanTiers(env) {
  const tiers = {};
  for (const [k, t] of Object.entries(PLAN_TIERS)) tiers[k] = { ...t };
  if (!env || !env.DB) return { tiers, source: 'fallback' };

  let rows = [];
  try {
    const r = await env.DB.prepare('SELECT key, cents FROM menu_modifier_prices').all();
    rows = (r && r.results) || [];
  } catch {
    return { tiers, source: 'fallback' };    // table missing / D1 down → last known good
  }

  const byKey = new Map(rows.map((r) => [r.key, r.cents]));
  let applied = 0;
  for (const [k, t] of Object.entries(tiers)) {
    const cents = usableWeeklyCents(t, byKey.get(planPriceKey(k)));
    if (cents != null) { t.weeklyCents = cents; applied += 1; }
  }
  return { tiers, source: applied ? 'd1' : 'fallback' };
}
