-- Añejo Rewards (Phase 2): redemption columns on orders.
-- redeem_points = points the customer chose to spend; discount_cents = the $ value applied
-- to the Square order. The negative ledger row is written on PAID (idempotent), like earning.
ALTER TABLE orders ADD COLUMN redeem_points INTEGER;
ALTER TABLE orders ADD COLUMN discount_cents INTEGER;
