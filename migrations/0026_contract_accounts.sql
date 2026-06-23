-- Añejo — B2B CONTRACT ACCOUNTS (corporate/office catering, e.g. DGP Health & Wellness).
-- A parent account has one or more sites; each site has its own daily-headcount intake link.
-- Each morning the site contact submits a count → the system creates that day's kitchen order
-- (count × price/lunch + per-site delivery fee, + a rush fee if past the cutoff), which flows
-- onto the kitchen board and into dispatch like any order, and into a per-site ledger for
-- biweekly QuickBooks invoicing. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0026_contract_accounts.sql

CREATE TABLE IF NOT EXISTS contract_accounts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  billing_email   TEXT,                 -- accountant / billing dept (for invoices)
  billing_contact TEXT,
  invoice_cadence TEXT DEFAULT 'biweekly', -- biweekly | monthly | weekly
  qbo_customer_id TEXT,                 -- QuickBooks customer id (set on first invoice)
  status          TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_sites (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL,
  name                  TEXT NOT NULL,            -- 'Delray Beach' / 'Pompano Beach'
  street TEXT, unit TEXT, city TEXT, state TEXT, zip TEXT,
  delivery_lat REAL, delivery_lng REAL,
  delivery_days         TEXT DEFAULT 'mon,tue,wed',
  window_label          TEXT DEFAULT '11:30–12:30',
  delivery_window       TEXT DEFAULT 'lunch',     -- maps to the kitchen/board window
  price_per_lunch_cents INTEGER DEFAULT 600,      -- $6 founding-client rate (configurable)
  delivery_fee_cents    INTEGER DEFAULT 2500,     -- per-site flat ($25)
  cutoff_time           TEXT DEFAULT '09:00',     -- ET HH:MM; after this, count is a RUSH
  rush_fee_cents        INTEGER DEFAULT 1500,     -- applied to counts submitted after cutoff
  intake_token          TEXT UNIQUE,              -- per-office headcount link (lazily minted)
  contact_name TEXT, contact_phone TEXT,
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_sites_account ON contract_sites(account_id);
CREATE INDEX IF NOT EXISTS idx_contract_sites_token ON contract_sites(intake_token);

-- Weekly rotating lunch menu (separate from the Fit bowls). rotation_week cycles 1..N.
CREATE TABLE IF NOT EXISTS contract_menu (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  rotation_week INTEGER DEFAULT 1,   -- which week in the rotation
  dow           INTEGER,             -- 1=Mon .. 7=Sun
  item_name     TEXT,
  notes         TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_menu ON contract_menu(account_id, rotation_week, dow);

-- Per-site daily count ledger (one row per site per service date; the source of truth for
-- invoicing + idempotent re-submits).
CREATE TABLE IF NOT EXISTS contract_orders (
  id                    TEXT PRIMARY KEY,
  site_id               TEXT NOT NULL,
  account_id            TEXT NOT NULL,
  service_date          TEXT NOT NULL,           -- YYYY-MM-DD
  headcount             INTEGER NOT NULL,
  item_name             TEXT,
  price_per_lunch_cents INTEGER,
  delivery_fee_cents    INTEGER,
  rush_fee_cents        INTEGER DEFAULT 0,
  total_cents           INTEGER,
  order_id              TEXT,                     -- the kitchen order this created
  submitted_by          TEXT,                     -- contact name / 'web'
  is_rush               INTEGER DEFAULT 0,
  invoiced              INTEGER DEFAULT 0,
  invoice_id            TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE(site_id, service_date)
);
CREATE INDEX IF NOT EXISTS idx_contract_orders_invoicing ON contract_orders(account_id, invoiced, service_date);

-- Link kitchen orders back to the contract site (so the board + dispatch can tag them).
ALTER TABLE orders ADD COLUMN contract_site_id TEXT;
ALTER TABLE orders ADD COLUMN headcount        INTEGER;
ALTER TABLE orders ADD COLUMN is_rush          INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_contract ON orders(contract_site_id);

-- Seed DGP Health & Wellness + its two founding sites (tokens minted lazily by the owner page).
INSERT OR IGNORE INTO contract_accounts (id, name, invoice_cadence, status, created_at, updated_at)
  VALUES ('acct_dgp', 'DGP Health & Wellness', 'biweekly', 'active', 0, 0);
INSERT OR IGNORE INTO contract_sites (id, account_id, name, street, city, state, zip, delivery_days, window_label, delivery_window, price_per_lunch_cents, delivery_fee_cents, cutoff_time, rush_fee_cents, active, created_at, updated_at)
  VALUES ('site_dgp_delray', 'acct_dgp', 'Delray Beach', '2226 W Atlantic Ave', 'Delray Beach', 'FL', '33445', 'mon,tue,wed', '11:30–12:30', 'lunch', 600, 2500, '09:00', 1500, 1, 0, 0);
INSERT OR IGNORE INTO contract_sites (id, account_id, name, street, city, state, zip, delivery_days, window_label, delivery_window, price_per_lunch_cents, delivery_fee_cents, cutoff_time, rush_fee_cents, active, created_at, updated_at)
  VALUES ('site_dgp_pompano', 'acct_dgp', 'Pompano Beach', '2100 Park Central Blvd N', 'Pompano Beach', 'FL', '33064', 'mon,tue,wed', '11:30–12:30', 'lunch', 600, 2500, '09:00', 1500, 1, 0, 0);
