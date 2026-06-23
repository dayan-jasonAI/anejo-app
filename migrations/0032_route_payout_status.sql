-- Añejo — driver payout tracking. Each route's pay can be marked paid on payday so the owner
-- sees exactly who is owed what. Additive only.
--   pay_status : 'unpaid' (default) | 'paid'
--   paid_at    : unix-ms the route's pay was marked paid
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0032_route_payout_status.sql

ALTER TABLE routes ADD COLUMN pay_status TEXT DEFAULT 'unpaid';
ALTER TABLE routes ADD COLUMN paid_at INTEGER;
