-- Añejo — close two dead ends in the B2B contract flow. Additive only.
--
--   1) Contract terms were WRITE-ONCE: the owner could only set price/fees/cut-off during
--      activation, and there was nowhere to record a later renegotiation. contract_accounts
--      and contract_sites carry no "who changed what, when" columns, so the terms history
--      gets its own append-only table (same shape of guarantee as contract_order_events:
--      insert only, never updated or deleted — that is what makes it evidence).
--
--   2) Invoices were TERMINAL: contract_invoices could only ever be 'open' because there was
--      no column to record payment or delivery. status already allows open|sent|paid|void;
--      these columns are what the owner-side mark-paid / send actions write.
--
-- The HUB code that uses these degrades gracefully if this file has NOT been applied yet
-- (falls back to a status-only update and reports `degraded`), so shipping the code first
-- cannot take the contracts desk down — but the audit trail and paid/sent timestamps stay
-- empty until it IS applied.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0046_contract_terms_invoice_ops.sql

-- ---- 1) Terms-change audit ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contract_terms_events (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  site_id      TEXT,                 -- NULL = the change was applied to every site on the account
  event        TEXT NOT NULL,        -- 'activated' | 'terms_updated'
  changed_by   TEXT,                 -- staff email (or id) from the HUB session
  changed_role TEXT,
  before_json  TEXT,                 -- terms as they were, JSON: {price_per_lunch_cents,...}
  after_json   TEXT,                 -- terms as they now are
  note         TEXT,                 -- optional owner note ("renegotiated 7/25 call")
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cte_account ON contract_terms_events (account_id, created_at);

-- ---- 2) Invoice lifecycle -------------------------------------------------------------
ALTER TABLE contract_invoices ADD COLUMN paid_at   INTEGER;  -- epoch ms the owner marked it paid
ALTER TABLE contract_invoices ADD COLUMN paid_by   TEXT;     -- staff email (or id) who marked it
ALTER TABLE contract_invoices ADD COLUMN paid_ref  TEXT;     -- check #, ACH ref, 'Square', etc.
ALTER TABLE contract_invoices ADD COLUMN sent_at   INTEGER;  -- epoch ms the invoice email went out
ALTER TABLE contract_invoices ADD COLUMN sent_to   TEXT;     -- address it was emailed to
ALTER TABLE contract_invoices ADD COLUMN sent_by   TEXT;     -- staff email (or id) who sent it
