-- Añejo — B2B contract billing models + self-registration. A business signs up on the site,
-- picks how they want to order/pay, and the system creates a PENDING account; the owner sets
-- the negotiated price/terms and activates it (pricing is never self-serve). Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0027_contract_billing_model.sql

ALTER TABLE contract_accounts ADD COLUMN billing_model      TEXT DEFAULT 'biweekly'; -- weekly_autopay | biweekly | monthly | same_day
ALTER TABLE contract_accounts ADD COLUMN square_customer_id TEXT;   -- card-on-file (autopay/same-day) — set in Phase 3
ALTER TABLE contract_accounts ADD COLUMN square_card_id     TEXT;
ALTER TABLE contract_accounts ADD COLUMN signup_at          INTEGER; -- when the business self-registered

-- Reuse contract_accounts.status: 'pending' (just signed up, awaiting owner terms+activation)
--   | 'active' (live) | 'paused' | 'declined'. Sites stay inactive-for-ordering until active.
