-- Store each subscription's tier so fulfillment (suborders.js) can look up the fixed
-- per-tier delivery schedule (which weekdays, bowls/day) from PLAN_TIERS. Additive + safe.
ALTER TABLE subscriptions ADD COLUMN tier TEXT;  -- plan_5 | plan_10 | plan_12
