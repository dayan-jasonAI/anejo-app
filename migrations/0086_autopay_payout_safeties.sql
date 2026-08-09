-- Añejo — B2B contract AUTOPAY and driver/affiliate PAYOUTS, with both safeties Dayan asked for.
-- Additive only.
--
-- WHAT WAS TRUE BEFORE. `weekly_autopay` was a LABEL. _lib/contract.js listed it as a billing
-- model, contract invoices were generated and emailed, and no code anywhere ever charged a card.
-- Payouts were the mirror image: routes could be flagged paid and rev-share rows flipped to
-- 'paid', with no record of anyone approving the number first.
--
-- THE TWO SAFETIES, both required, neither sufficient alone:
--
--   1. A VISIBLE OWNER TOGGLE. app_settings keys 'autopay.contracts_enabled' and
--      'autopay.payouts_enabled', surfaced in the HUB finance page. BOTH DEFAULT OFF — an unset
--      key reads as off, so applying this migration changes no behaviour by itself.
--
--   2. AN APPROVAL ON THE AMOUNT. The toggle says "automatic charging is allowed at all"; the
--      approval says "this specific dollar figure is allowed". They are different questions and a
--      toggle alone answers only the first. The approval is bound to the exact cents approved:
--      if the invoice total moves after approval, the approval no longer matches and the charge
--      refuses rather than charging the new number. Re-approval is a deliberate act.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0086_autopay_payout_safeties.sql

-- ---- 1) Card on file for a contract account -------------------------------------------------
-- Square customer + card id. There is no card data here and never will be — Square holds the
-- instrument, we hold an opaque id and the last four for the owner to recognise it by.
ALTER TABLE contract_accounts ADD COLUMN square_customer_id TEXT;
ALTER TABLE contract_accounts ADD COLUMN square_card_id     TEXT;
ALTER TABLE contract_accounts ADD COLUMN card_brand         TEXT;
ALTER TABLE contract_accounts ADD COLUMN card_last4         TEXT;
ALTER TABLE contract_accounts ADD COLUMN card_added_at      INTEGER;

-- ---- 2) Approval + charge state on an invoice -----------------------------------------------
ALTER TABLE contract_invoices ADD COLUMN autopay_approved_at    INTEGER;
ALTER TABLE contract_invoices ADD COLUMN autopay_approved_by    TEXT;
ALTER TABLE contract_invoices ADD COLUMN autopay_approved_cents INTEGER; -- MUST equal total_cents
ALTER TABLE contract_invoices ADD COLUMN autopay_status         TEXT;    -- charged | failed | NULL
ALTER TABLE contract_invoices ADD COLUMN autopay_charged_at     INTEGER;
ALTER TABLE contract_invoices ADD COLUMN autopay_payment_id     TEXT;    -- Square payment id
ALTER TABLE contract_invoices ADD COLUMN autopay_error          TEXT;

-- ---- 3) Payout approvals --------------------------------------------------------------------
-- Append-only, one row per approved payout amount. `consumed_at` is stamped when the payout it
-- authorises is actually marked paid, so an approval can never authorise two payouts.
CREATE TABLE IF NOT EXISTS payout_approvals (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,          -- 'driver' | 'partner'
  subject_id    TEXT NOT NULL,          -- driver_id (staff.id) or trainer_id
  amount_cents  INTEGER NOT NULL,       -- the EXACT figure approved
  scope_json    TEXT,                   -- what it covers: {route_ids:[…]} or {days:14}
  approved_by   TEXT,
  approved_at   INTEGER NOT NULL,
  consumed_at   INTEGER,
  consumed_ref  TEXT
);
CREATE INDEX IF NOT EXISTS idx_payout_appr_subject ON payout_approvals (kind, subject_id, consumed_at);

-- ---- 4) Money-movement audit ----------------------------------------------------------------
-- Every automatic charge and every marked payout writes one row here, including the refusals.
-- A refusal ("autopay was off", "the amount was never approved") is the evidence that the safety
-- worked, and is exactly what you want to read after someone asks why a client was not charged.
CREATE TABLE IF NOT EXISTS money_movements (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,          -- 'contract_autopay' | 'driver_payout' | 'partner_payout'
  ref_type      TEXT,
  ref_id        TEXT,
  amount_cents  INTEGER,
  outcome       TEXT NOT NULL,          -- 'charged' | 'paid' | 'refused' | 'failed'
  reason        TEXT,                   -- refusal/failure reason, machine-readable
  actor         TEXT,                   -- staff email, or 'cron'
  detail        TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_money_moves ON money_movements (kind, created_at DESC);
