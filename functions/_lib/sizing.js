// Añejo bowl-sizing + dynamic pricing model.
//
// One source of truth for the macro portal. The rule (set 2026-06):
//   - We ALWAYS recommend up to 12 bowls/week. plan_12 is the recommendation;
//     plan_5 and plan_10 stay selectable. The bowl COUNT never changes the bowl SIZE.
//   - Every bowl is portion-sized to the client's GOAL. A client whose daily target
//     is lighter than a standard Añejo bowl gets smaller bowls (their daily macros are
//     spread across the bowls they eat each day) — and pays less. A client who needs
//     more than standard gets larger bowls that hit their macros — and pays more.
//   - Price scales LINEARLY with portion size, clamped to a floor and a cap so bowls
//     never get impractically tiny or huge.
//
// Files under functions/_lib are not routed; import this where sizing is needed.

// The reference bowl: a standard 16 oz Añejo bowl (~550 kcal), averaged across the 7-bowl menu.
export const STANDARD_BOWL_OZ = 16;
export const STANDARD_BOWL = { kcal: 550, protein_g: 40, carbs_g: 36, fat_g: 26, fiber_g: 10 };

// Price of one standard 16 oz bowl. = $219 / 12 (our best per-bowl rate). All sizing scales from this.
// Production can override without a code change via env SQUARE-side config; this stays the quote anchor.
export const BASE_BOWL_PRICE_USD = 18.25;

// Portion bounds vs the standard bowl (linear pricing, with floor & cap).
export const SIZE_MIN = 0.6; // ~10 oz floor
export const SIZE_MAX = 1.8; // ~29 oz cap

// How many Añejo-sized meals/day the sizing assumes when spreading the daily macros.
// A standard bowl ≈ one of ~3 daily meals; we clamp the AI's suggestion to a sane range.
export const DEFAULT_MEALS_PER_DAY = 3;
export const MEALS_MIN = 2;
export const MEALS_MAX = 4;

// We always recommend 12; these are the selectable weekly counts.
export const RECOMMENDED_BOWL_COUNT = 12;
export const BOWL_COUNTS = [5, 10, 12];

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Descriptive size key (frontend localizes). Thresholds on the portion factor.
export function sizeLabel(factor) {
  if (factor < 0.85) return 'small';
  if (factor <= 1.15) return 'standard';
  if (factor <= 1.5) return 'large';
  return 'xl';
}

// Given daily calories + meals/day, return the full sizing + pricing block to merge onto a plan.
// `dailyCalories` is the authoritative driver; `mealsPerDay` is the AI's suggestion (clamped).
export function computeSizing(dailyCalories, mealsPerDay) {
  const meals = clamp(Math.round(Number(mealsPerDay) || DEFAULT_MEALS_PER_DAY), MEALS_MIN, MEALS_MAX);
  const kcal = Number(dailyCalories) > 0 ? Number(dailyCalories) : STANDARD_BOWL.kcal * meals;

  // Per-bowl calorie target = the day's calories spread across the day's bowls.
  const rawFactor = (kcal / meals) / STANDARD_BOWL.kcal;
  const factor = round2(clamp(rawFactor, SIZE_MIN, SIZE_MAX));

  const oz = Math.round(STANDARD_BOWL_OZ * factor);
  const perBowlMacros = {
    kcal: Math.round(STANDARD_BOWL.kcal * factor),
    protein_g: Math.round(STANDARD_BOWL.protein_g * factor),
    carbs_g: Math.round(STANDARD_BOWL.carbs_g * factor),
    fat_g: Math.round(STANDARD_BOWL.fat_g * factor),
    fiber_g: Math.round(STANDARD_BOWL.fiber_g * factor),
  };
  const perBowlPrice = round2(BASE_BOWL_PRICE_USD * factor);

  // Each weekly count is priced at the SAME sized per-bowl price — count only changes how many you get.
  const planOptions = BOWL_COUNTS.map((n) => ({
    tier: 'plan_' + n,
    bowls: n,
    weekly_price_usd: round2(perBowlPrice * n),
    recommended: n === RECOMMENDED_BOWL_COUNT,
  }));

  return {
    meals_per_day: meals,
    bowl_size_factor: factor,
    bowl_size_oz: oz,
    bowl_size_label: sizeLabel(factor),
    per_bowl_macros: perBowlMacros,
    per_bowl_price_usd: perBowlPrice,
    standard_bowl_oz: STANDARD_BOWL_OZ,
    base_bowl_price_usd: BASE_BOWL_PRICE_USD,
    recommended_bowl_count: RECOMMENDED_BOWL_COUNT,
    weekly_bowl_count: RECOMMENDED_BOWL_COUNT,
    meal_plan_tier: 'plan_' + RECOMMENDED_BOWL_COUNT,
    plan_options: planOptions,
  };
}
