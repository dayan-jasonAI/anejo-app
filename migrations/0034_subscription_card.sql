-- Añejo — store the Square card id a subscription charges (set when a member updates their card).
-- Mirror only; the source of truth is Square. Additive.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0034_subscription_card.sql

ALTER TABLE subscriptions ADD COLUMN square_card_id TEXT;
