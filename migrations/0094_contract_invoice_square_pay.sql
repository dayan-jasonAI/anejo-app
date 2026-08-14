-- Contract invoices: a real, live Square payment link so a B2B client can pay online — the same
-- mechanism the catering-deposit checkout already uses (functions/_lib/catering_deposit.js), reused
-- rather than reinvented. SQUARE_ENV already governs sandbox-vs-live for that flow, so this link is
-- live money the moment it's created in production (functions/_lib/square.js squareBase).
--
-- Mirrors catering_quotes' payment_link_id/payment_link_url pattern. square_order_id is what the
-- Square webhook matches on to flip the invoice to 'paid' automatically (functions/api/webhooks/
-- square.js), the same way it already flips a deposit quote — no manual "mark paid" needed once the
-- client actually pays through the link.

ALTER TABLE contract_invoices ADD COLUMN square_order_id    TEXT;
ALTER TABLE contract_invoices ADD COLUMN payment_link_id    TEXT;
ALTER TABLE contract_invoices ADD COLUMN payment_link_url   TEXT;
