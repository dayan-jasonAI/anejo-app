-- On-demand (same-day, make-now) ordering.
-- Adds a fulfillment mode to each order so the kitchen, the daily per-bowl production cap,
-- and reporting can tell an ASAP order apart from a scheduled delivery. Additive + safe to
-- apply ahead of the code that uses it (defaults every existing row to 'scheduled').
ALTER TABLE orders ADD COLUMN fulfillment_mode TEXT DEFAULT 'scheduled';  -- scheduled | on_demand

-- Counting today's on-demand bowls against the cap filters on (mode, date); index it.
CREATE INDEX IF NOT EXISTS idx_orders_mode_date ON orders(fulfillment_mode, delivery_date);
