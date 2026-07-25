-- 0045 — The weekly SUBSCRIPTION price becomes data.
--
-- 0043 moved the à-la-carte menu into D1; the meal-plan tiers were left behind, so the weekly
-- price still lived only in functions/_lib/plans.js PLAN_TIERS.weeklyCents (and, until now, in a
-- hand-kept copy inside public/subscribe.html). Repricing a plan meant a code edit + a deploy.
--
-- No new table: a tier price is one key → cents, exactly what menu_modifier_prices already is, and
-- reusing it means the HUB owner menu editor (update_modifier) can change these with zero new UI
-- and the same menu_price_log audit trail as every other price change.
--
-- functions/_lib/plans.js loadPlanTiers(env) reads these; PLAN_TIERS stays the fallback for an
-- unreachable D1, a missing row, or a value outside the sizing floor/cap. Seeded with the exact
-- values live on 2026-07-25, so applying this changes no price and no subscriber's charge.
--
-- NOTE: subscriptions that carry bowl SIZING are still priced perBowlCents × bowls from
-- sizing.js BASE_BOWL_PRICE_USD (a code constant). These rows set the STANDARD, unsized price.

INSERT OR IGNORE INTO menu_modifier_prices (key, cents, label, updated_at) VALUES
  ('plan_5_weekly',   9900, 'Meal plan · 5 bowls/week (weekly charge)',  1785000000000),
  ('plan_10_weekly', 18900, 'Meal plan · 10 bowls/week (weekly charge)', 1785000000000),
  ('plan_12_weekly', 21900, 'Meal plan · 12 bowls/week (weekly charge)', 1785000000000);
