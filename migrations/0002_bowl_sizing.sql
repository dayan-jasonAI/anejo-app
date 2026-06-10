-- Añejo — dynamic bowl-sizing model (2026-06).
-- Plans now always recommend 12 bowls/week; each bowl is portion-sized to the client's
-- goal, and per-bowl price scales with size. Persist the sizing so saved/shared plans and
-- the trainer dashboard show the same numbers the calculator quoted.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0002_bowl_sizing.sql

ALTER TABLE plans ADD COLUMN meals_per_day      INTEGER;        -- bowls/day the daily macros are spread across
ALTER TABLE plans ADD COLUMN bowl_size_oz       INTEGER;        -- portioned bowl size in ounces (standard = 16)
ALTER TABLE plans ADD COLUMN bowl_size_factor   REAL;           -- portion multiplier vs the standard 16 oz bowl
ALTER TABLE plans ADD COLUMN per_bowl_price_cents INTEGER;      -- sized per-bowl price (cents)
ALTER TABLE plans ADD COLUMN recommended_bowl_count INTEGER;    -- always 12 under the current model
