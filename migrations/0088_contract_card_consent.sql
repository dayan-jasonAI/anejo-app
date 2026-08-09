-- Añejo — the CONSENT that has to sit next to a card on file. Additive only.
--
-- WHAT WAS TRUE BEFORE. 0086 added contract_accounts.square_customer_id / square_card_id /
-- card_brand / card_last4 / card_added_at, and _lib/autopay.js reads them at the fourth gate of
-- chargeContractInvoice. Nothing in the codebase ever WROTE any of them, so that gate refused
-- every account there has ever been: B2B autopay could not charge anybody, ever, no matter how
-- many switches were on.
--
-- The missing half was never the columns. It was the authorization. Storing a business's card and
-- charging it every fortnight without a recorded, dated, attributable agreement is the kind of
-- thing that produces a chargeback and a very short conversation with a payment processor.
--
-- SO THE CONSENT IS STORED AS TEXT, NOT AS A FLAG. `card_consent_text` holds the exact paragraph
-- the person read, `card_consent_version` says which revision it was, `card_consent_name` says who
-- typed their name under it and `card_consent_at` says when. Same discipline as
-- catering_quotes.terms_json (0085): editing the constant next year must not silently re-write
-- what somebody agreed to this year.
--
-- NO CARD DATA IS ADDED HERE AND NONE EVER WILL BE. Square holds the instrument. We hold an
-- opaque id, the brand, and the last four — enough for the owner to recognise which card is on
-- file and nothing that could be used to charge one anywhere else.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0088_contract_card_consent.sql

ALTER TABLE contract_accounts ADD COLUMN card_consent_at      INTEGER; -- when they agreed (ms)
ALTER TABLE contract_accounts ADD COLUMN card_consent_version TEXT;    -- '2026-08-v1'
ALTER TABLE contract_accounts ADD COLUMN card_consent_text    TEXT;    -- the FULL text they read
ALTER TABLE contract_accounts ADD COLUMN card_consent_name    TEXT;    -- who agreed, typed by them
ALTER TABLE contract_accounts ADD COLUMN card_consent_email   TEXT;    -- optional, for the receipt trail
ALTER TABLE contract_accounts ADD COLUMN card_consent_ip      TEXT;    -- where from, for the record
ALTER TABLE contract_accounts ADD COLUMN card_consent_src     TEXT;    -- which surface collected it

-- The third switch, alongside autopay.contracts_enabled / autopay.payouts_enabled from 0086.
-- It is NOT inserted here: an absent app_settings key reads as OFF (_lib/autopay.js isOn), and
-- that is exactly the default this switch wants. Applying this migration opens no door.
--   autopay.card_capture_enabled  — may the public card-on-file page accept a card at all?
