-- Contract invoices: void tracking + a picked-period marker.
--
-- WHY. The invoice generator (functions/_lib/contract.js generateInvoice) supports a from/to date
-- range, but the HUB's "Generate invoice" button never sent one — it always billed EVERY un-invoiced
-- day for the account, silently pulling the current week into whatever period the owner meant to
-- close (e.g. GDP's Jul 27 – Aug 5 catch-up invoice also grabbed the days since). Fixing the button
-- to send a real range (contracts.html) closes that going forward; this migration adds what "editing"
-- a wrongly-generated invoice needs: VOID it (releases its days back to un-invoiced so the right
-- range can be re-generated), and record whether a period was picked on purpose.
--
-- voided_at/voided_by mirror the shape paid_at/paid_by already have (migrations/0046) — same pattern,
-- new lifecycle branch. picked_period distinguishes "the owner chose this exact range" from "we
-- picked up whatever was un-invoiced", useful for auditing an invoice's origin later.

ALTER TABLE contract_invoices ADD COLUMN voided_at INTEGER;   -- epoch ms the invoice was voided
ALTER TABLE contract_invoices ADD COLUMN voided_by TEXT;      -- staff email (or id) who voided it
ALTER TABLE contract_invoices ADD COLUMN picked_period INTEGER NOT NULL DEFAULT 0;  -- 1 = owner chose from/to explicitly
