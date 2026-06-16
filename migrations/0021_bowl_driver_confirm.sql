-- Añejo HUB — Phase 3: driver pickup confirmation. The driver re-confirms each bowl the
-- kitchen prepped before leaving; an order can't go out for delivery until every bowl is
-- driver-confirmed. Confirmation is attributed to the driver (one PIN per order) + audited.
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0021_bowl_driver_confirm.sql

ALTER TABLE order_bowls ADD COLUMN driver_confirmed_by TEXT;     -- driver staff id (PIN-matched at pickup)
ALTER TABLE order_bowls ADD COLUMN driver_confirmed_at INTEGER;
