-- Añejo — subscription → DAILY fresh-prep kitchen orders. Additive only.
-- Model (owner-confirmed): a subscription stays ONE thing the owner sees; the kitchen
-- gets one "Subscription"-tagged order per chosen window (lunch and/or dinner) for each
-- delivery day Mon–Sat the sub is active, one rotating bowl each, scaled to the client's
-- macros. Generated on a rolling 7-day horizon by a daily tick. Plans start next Monday.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0016_subscription_prep.sql

-- Which meal windows this subscriber receives. CSV of 'lunch'/'dinner' (both = 2 bowls/day).
ALTER TABLE subscriptions ADD COLUMN windows TEXT DEFAULT 'lunch,dinner';
-- Last YYYY-MM-DD the rolling materializer has covered for this sub (bookkeeping/visibility).
ALTER TABLE subscriptions ADD COLUMN prep_through_date TEXT;

-- Links a generated daily kitchen order back to its subscription. NON-NULL ⇒ this is a
-- subscription prep order → the kitchen shows the "Subscription" tag. Deterministic order
-- ids (osub_<subId>_<date>_<window>) keep daily generation idempotent (INSERT OR IGNORE).
ALTER TABLE orders ADD COLUMN subscription_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_subscription ON orders(subscription_id);
