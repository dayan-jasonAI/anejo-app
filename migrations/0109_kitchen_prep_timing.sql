-- 0109 — How long each item takes, so food is done on time: not early, not late.
--
-- Dayan, 2026-09-15: "according to the menu item, I want the kitchen to have like a clock or an
-- estimated cook time, like how long should it take to prep this."
--
--   menu_items.prep_minutes  The owner's estimate for one item, set in the HUB menu editor. NULL
--                            means "not set": the kitchen shows no timer rather than a made-up one.
--   orders.prep_started_at   When a cook actually started this order (Start prep, PIN-attributed).
--                            The old estimate used orders.updated_at, which any later write moves —
--                            an office count change, for one — so the timer needs its own stamp.
--
-- Window start times, the ready-before-delivery lead and the office-lunch estimate are owner
-- settings in app_settings under kitchen.* (functions/_lib/kitchen-timing.js), not columns.
--
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0109_kitchen_prep_timing.sql

ALTER TABLE menu_items ADD COLUMN prep_minutes INTEGER;
ALTER TABLE orders ADD COLUMN prep_started_at INTEGER;
