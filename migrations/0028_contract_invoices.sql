-- Añejo — B2B contract invoicing. The owner closes a period for an account → all un-invoiced
-- daily-count ledger rows roll into one invoice (branded, print-to-PDF; QuickBooks push when
-- the QBO connection is configured). Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0028_contract_invoices.sql

CREATE TABLE IF NOT EXISTS contract_invoices (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL,
  number         TEXT,
  period_from    TEXT,
  period_to      TEXT,
  lunches        INTEGER,
  subtotal_cents INTEGER,   -- lunches × price
  delivery_cents INTEGER,
  rush_cents     INTEGER,
  total_cents    INTEGER,
  line_items     TEXT,       -- JSON: per-site + per-day breakdown
  status         TEXT NOT NULL DEFAULT 'open', -- open | sent | paid | void
  qbo_invoice_id TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_invoices_account ON contract_invoices(account_id, created_at);
