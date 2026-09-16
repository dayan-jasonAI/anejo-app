-- Añejo — WEEKLY OFFICE MENUS. The owner sets each contract account's rotating lunch menu and,
-- optionally, a price for a particular dish. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0111_contract_weekly_menus.sql
--
-- contract_menu has existed since 0026 but nothing ever wrote it, so every office order went out
-- as "<Account> Lunch — <Day>". The owner desk now writes it (op menu_save on
-- functions/api/hub/owner/contracts.js).
--
-- WHY AN ANCHOR. The old rotation counted 7-day blocks from 1 Jan 1970, a Thursday, so "week 2"
-- began on a Thursday and nobody could say which date was week 1. A rotation is now counted in
-- whole weeks from a Monday the owner can see and change. Unset, the first save anchors it to the
-- Monday of that week (America/New_York calendar).

-- How many weeks the rotation cycles through (1..8). NULL = no menu set yet.
ALTER TABLE contract_accounts ADD COLUMN rotation_weeks INTEGER;
-- The Monday (YYYY-MM-DD) that is Week 1. Dates before it are Week 1.
ALTER TABLE contract_accounts ADD COLUMN rotation_start_date TEXT;

-- The Spanish name, for the pages that already speak Spanish.
ALTER TABLE contract_menu ADD COLUMN item_name_es TEXT;
-- A price for THIS dish on this day, in cents. NULL = the site's price_per_lunch_cents applies,
-- which is exactly what every order was charged before this migration. contract_orders snapshots
-- the price actually used, so invoices follow without any change of their own.
ALTER TABLE contract_menu ADD COLUMN price_per_lunch_cents INTEGER;
ALTER TABLE contract_menu ADD COLUMN updated_at INTEGER;
ALTER TABLE contract_menu ADD COLUMN updated_by TEXT;
