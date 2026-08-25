-- Contract accounts: card checkout becomes OPT-IN, per account.
--
-- WHY. sendInvoiceEmail (functions/api/hub/owner/contracts.js) minted a Square payment link for
-- EVERY unpaid invoice and the email rendered a "Pay $X now" button, unconditionally. On
-- 2026-08-25 invoice DGP-0004 went to a contract client whose signed vendor agreement is
-- direct deposit — the email offered them a card rail that contradicts the agreement and costs
-- ~2.7% on a $1,668 bill. Nothing malfunctioned; the button simply had no off switch.
--
-- DEFAULT 0 is the whole point: card checkout is now something the owner turns ON for an account
-- that asked for it, not something every client is handed. Existing rows take the default, so no
-- account silently keeps the button. contract_invoices.payment_link_url on already-sent invoices
-- is deliberately left alone — those links were real and may already be in a client's hands.

ALTER TABLE contract_accounts ADD COLUMN allow_card_payment INTEGER DEFAULT 0;  -- 1 = invoice email may carry a Square "Pay now" button
