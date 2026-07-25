-- 0048 — Marketing SMS consent captured at checkout.
--
-- 0047 put the marketing-consent columns on `clients` and `leads`, i.e. on PEOPLE. But a guest
-- checkout creates neither: /order takes a first name, a phone and an address, and writes exactly
-- one row — into `orders`. Without these columns the second checkbox on /order would have nowhere
-- to land, so the highest-intent audience we have (people who just paid) could never opt in.
--
-- Same rule as 0047 and for the same reason: the existing orders.sms_consent was collected with
-- ORDER AND DELIVERY wording, which is transactional. A promotional text needs its own express
-- opt-in under the TCPA ($500–$1,500 per message, per recipient), so this starts at 0 for every
-- existing row — NOBODY is grandfathered — and the _at/_src columns are the proof of consent.
--
-- !! APPLY THIS BEFORE DEPLOYING functions/api/checkout.js !!
-- checkout.js writes these three columns in the order-log INSERT, and that INSERT sits inside a
-- try/catch that swallows failures so a logging problem can never fail a payment. If the code
-- ships first, every order still charges but SILENTLY STOPS BEING LOGGED — the kitchen sees
-- nothing. Migration first, deploy second.

ALTER TABLE orders ADD COLUMN marketing_sms_consent     INTEGER NOT NULL DEFAULT 0;  -- express opt-in ONLY
ALTER TABLE orders ADD COLUMN marketing_sms_consent_at  INTEGER;                     -- proof: when they ticked it
ALTER TABLE orders ADD COLUMN marketing_sms_consent_src TEXT;                        -- proof: which form
