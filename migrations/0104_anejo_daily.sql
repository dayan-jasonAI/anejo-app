-- Añejo Daily — one featured lunch per day, sold from a per-date PUBLIC allocation, sharing one
-- meal definition with institutional (DGP/clinic) production. Additive only.
--
-- NUMBERED 0104, not 0103: 0103 is taken by the separate Sales OS branch (feat/sales-os). Two
-- branches each shipping a different 0103 would collide by number the day both merge. Filenames
-- apply in order; nothing here depends on 0103.
--
-- THE MODEL, in three pieces that already existed plus two tables:
--   · A MEAL DEFINITION is a menu_items row with kind = 'daily' (the dish, its price tier, what is
--     included, its approved photo). It is not listed in the general catalog; it is sold only
--     through a dated schedule row. The SAME row is what the institutional rotating menu points at
--     (contract_menu.menu_item_id), which is what makes "DGP Wednesday" and "Añejo Daily Wednesday"
--     the same dish in the kitchen without merging their orders or their billing.
--   · daily_schedule: which meal is Añejo Daily on a given service date, and how many PUBLIC
--     portions are allocated. One row per date.
--   · daily_claims: every public portion reserved against a date. A claim is inserted by ONE
--     guarded statement that only succeeds while confirmed + unexpired-held portions still fit the
--     allocation (functions/_lib/daily.js claimPortions) — so two customers cannot buy the last one.
--   Institutional headcount NEVER consumes the public allocation: DGP counts live in orders /
--   contract_orders, and the allocation counts only daily_claims.
--
-- NO CHECK CONSTRAINTS (statuses validated in code), same rule as the rest of this schema history.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0104_anejo_daily.sql
--        (NOT applied to production — requires Dayan's explicit deployment approval.)

CREATE TABLE IF NOT EXISTS daily_schedule (
  service_date TEXT PRIMARY KEY,                   -- YYYY-MM-DD (ET)
  menu_item_id TEXT NOT NULL,                      -- menu_items.id, kind = 'daily'
  allocation   INTEGER NOT NULL DEFAULT 10,        -- public portions for this date; owner-set
  cutoff_time  TEXT,                               -- HH:MM ET override; NULL = the daily.cutoff_time setting
  status       TEXT NOT NULL DEFAULT 'active',     -- active | canceled
  note         TEXT,
  updated_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_claims (
  id           TEXT PRIMARY KEY,                   -- dcl_*
  service_date TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  qty          INTEGER NOT NULL,
  checkout_key TEXT,                               -- one per checkout attempt; a retry reuses it
  buyer_hash   TEXT,                               -- SHA-256 of the buyer's email: a checkout_key
                                                   -- alone must never hand a Square link (with its
                                                   -- prefilled name and phone) to someone else
  order_id     TEXT,                               -- orders.id (set before the Square call)
  payment_url  TEXT,                               -- the Square link this claim was minted for
  status       TEXT NOT NULL DEFAULT 'held',       -- held | confirmed | released
  expires_at   INTEGER NOT NULL,                   -- a 'held' claim stops counting after this
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
-- A retried or double-clicked checkout carries the same key and can never consume twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_claims_key ON daily_claims (checkout_key) WHERE checkout_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_daily_claims_date  ON daily_claims (service_date, status);
CREATE INDEX IF NOT EXISTS idx_daily_claims_order ON daily_claims (order_id);

-- One dish per account per rotation week per weekday. contract_menu is empty in production
-- (verified 2026-09-10), so this cannot fail on existing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS ux_contract_menu_slot ON contract_menu (account_id, rotation_week, dow);

-- Trust lanes for the product families the team now covers. Auto-publish stays OFF (0) — only the
-- owner can turn a lane on, after five clean approvals.
INSERT OR IGNORE INTO trust_ledger (category, approved_clean, auto_publish, updated_at) VALUES
  ('daily', 0, 0, NULL), ('traditional', 0, 0, NULL), ('cajita', 0, 0, NULL);

-- ---------------------------------------------------------------------------------------------
-- THE ALTER TABLEs COME LAST, DELIBERATELY.
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so these four are the only statements in this file
-- that cannot be run twice — everything above is CREATE … IF NOT EXISTS or INSERT OR IGNORE.
-- `wrangler d1 execute --file` stops at the first error and is not transactional across a file, so
-- if these ran first, a re-run would die on line 1 with "duplicate column name" and never reach the
-- tables — a failure that reads like "already applied" while daily_schedule does not exist.
-- Run last, a re-run creates everything that is missing and then stops on a column that is already
-- there, which is the harmless half.
-- ---------------------------------------------------------------------------------------------

-- Per-item supplier cost, owner-entered. NULL = unknown (never required to sell). Snapshotted onto
-- each order line at checkout so historical margin does not move when a cost changes later.
ALTER TABLE menu_items ADD COLUMN unit_cost_cents INTEGER;
-- Storefront grouping for drinks: hydrate | cuban | classic. NULL = ungrouped.
ALTER TABLE menu_items ADD COLUMN group_key TEXT;
-- The institutional rotating menu names a real meal definition, not just free text.
ALTER TABLE contract_menu ADD COLUMN menu_item_id TEXT;
-- Marketing: the approved catalog image a draft should use (a menu illustration, never presented
-- as documentary). The owner's browser stages a JPEG derivative of it — the canonical asset is
-- untouched and Instagram's JPEG-only rule is met.
ALTER TABLE social_posts ADD COLUMN catalog_image TEXT;
