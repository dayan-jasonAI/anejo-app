-- Añejo — kitchen "hand-off / clear" (the 3rd PIN). When a ready order is built and handed to
-- loadout, a cook clears it OFF the kitchen board with their PIN. We keep status='ready' (so the
-- routing/delivery flow is untouched) and instead stamp who cleared it + when. The action is also
-- written to kitchen_audit, so it's fully traceable in the owner Order History view.
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0021_kitchen_clear.sql

ALTER TABLE orders ADD COLUMN kitchen_cleared_at INTEGER;
ALTER TABLE orders ADD COLUMN kitchen_cleared_by TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_cleared ON orders(kitchen_cleared_at);
