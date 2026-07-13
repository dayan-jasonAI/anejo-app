-- Añejo HUB — Recipe COGS v1: estimated food cost per recipe. A kitchen/owner action
-- (POST /api/hub/kitchen/recipe/cost) matches a recipe's ingredients against
-- inventory_items.unit_cost_cents (fuzzy name matching) and writes the result here.
-- Unmatched ingredients are never assumed to cost $0 — they're listed in cost_breakdown
-- with matched_item:null so the estimate stays honest about its own gaps. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0039_recipe_cogs.sql

ALTER TABLE recipes ADD COLUMN est_cost_cents  INTEGER;  -- sum of matched ingredient costs, in cents
ALTER TABLE recipes ADD COLUMN cost_updated_at INTEGER;  -- unix ms of the last /recipe/cost run
ALTER TABLE recipes ADD COLUMN cost_breakdown  TEXT;     -- JSON [{ingredient, matched_item, unit_cost_cents}], unmatched → matched_item:null
