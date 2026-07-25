-- 0044 — Campaign / creator source attribution on leads and orders. Additive only.
--
-- Until now nothing in the repo captured where a visitor came from: no utm_*, no gclid/fbclid,
-- no referrer. Every ad, flyer QR and creator post was therefore unmeasurable, and the affiliate
-- program (0042) could only attribute a sale when the customer actually TYPED a promo code —
-- which most followers never do. These columns record the click itself, so a per-creator link
-- like /launch?src=MARIA is attributable even when no code is redeemed.
--
--   src        : short campaign/creator token from ?src= (e.g. 'MARIA', 'QR-WELLINGTON')
--   utm_*      : standard campaign params, stored raw as sent
--   referrer   : external referring URL on first touch (leads only — orders inherit the session)
--
-- All nullable: a visit with no parameters stores NULLs and behaves exactly as before.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0044_source_attribution.sql

ALTER TABLE leads ADD COLUMN src TEXT;
ALTER TABLE leads ADD COLUMN utm_source TEXT;
ALTER TABLE leads ADD COLUMN utm_medium TEXT;
ALTER TABLE leads ADD COLUMN utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN referrer TEXT;

ALTER TABLE orders ADD COLUMN src TEXT;
ALTER TABLE orders ADD COLUMN utm_source TEXT;
ALTER TABLE orders ADD COLUMN utm_medium TEXT;
ALTER TABLE orders ADD COLUMN utm_campaign TEXT;

-- Reporting is "how did campaign X do" — always grouped by src/campaign, so index those.
CREATE INDEX IF NOT EXISTS idx_leads_src      ON leads(src);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_orders_src      ON orders(src);
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON orders(utm_campaign);
