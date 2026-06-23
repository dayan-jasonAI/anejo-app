-- Añejo — logistics: driver pay + driven miles on a route. Additive only.
--   pay_cents     : what the route/batch pays the driver (base + per-stop + per-mile, floored
--                   at a route minimum) — computed at assignment from the owner's pay settings.
--   total_meters  : optimized round-trip driving distance from the Routes API (kitchen → stops →
--                   kitchen); total_miles_est (already on routes) is derived from it for display.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0031_route_pay_miles.sql

ALTER TABLE routes ADD COLUMN pay_cents INTEGER;
ALTER TABLE routes ADD COLUMN total_meters INTEGER;
