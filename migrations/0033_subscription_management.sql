-- Añejo — member subscription self-management. Additive only.
--   paused_at    : unix-ms when the member paused (NULL = active). Display + audit.
--   skip_through : YYYY-MM-DD of the last skipped delivery day. Materialization won't create
--                  orders on/before this date for the sub (used by "skip next week").
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0033_subscription_management.sql

ALTER TABLE subscriptions ADD COLUMN paused_at INTEGER;
ALTER TABLE subscriptions ADD COLUMN skip_through TEXT;
