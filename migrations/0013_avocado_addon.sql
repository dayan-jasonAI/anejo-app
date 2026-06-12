-- Añejo — avocado add-on (+$2/bowl) flag on subscriptions, so recurring weekly deliveries
-- (created by the Square webhook on each paid invoice) keep adding ½ avocado to every bowl.
-- The per-bowl macros/ingredients the kitchen sees are computed from the bowl spec at delivery time.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0009_avocado_addon.sql

ALTER TABLE subscriptions ADD COLUMN avocado INTEGER DEFAULT 0;
