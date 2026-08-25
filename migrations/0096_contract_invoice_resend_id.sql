-- Contract invoices: keep Resend's message id.
--
-- WHY. sendEmail returns Resend's JSON (which carries `id`) and every caller dropped it. When
-- DGP-0004 went out on 2026-08-25 the only way to prove the mail had actually left the building
-- was to log in to Resend and search — delivery could not be answered from inside the product.
-- Stored alongside sent_at/sent_to so "who did we email, when, and what is the receipt" is one row.

ALTER TABLE contract_invoices ADD COLUMN resend_message_id TEXT;  -- Resend message id from the send that set sent_at
