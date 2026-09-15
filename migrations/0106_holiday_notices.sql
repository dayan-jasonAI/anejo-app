-- Holiday notices: one row per notice that has actually been attempted.
--
-- Dayan's policy, 2026-09-14, and it is stated in writing on the prospect landing page, which is why
-- it needs machinery rather than a diary: ahead of every US federal holiday Añejo writes to ask
-- whether the program is open that day, and if Añejo's own kitchen is closed for a holiday it
-- observes, the client hears it AT LEAST SEVEN DAYS beforehand.
--
-- WHY A TABLE AND NOT A FLAG. The scheduler runs daily, and a day can be retried, run twice, or
-- overlap itself. Without a record of exactly which notice has gone, an office manager gets the same
-- "will you be open on Thanksgiving?" email every morning for two weeks, and then stops reading all
-- of them — including the one that says the kitchen is shut. UNIQUE(account_id, holiday_key,
-- observed_date, kind) is the whole guarantee.
--
-- observed_date is in the key on purpose. The same holiday recurs every year, so `holiday_key` alone
-- would let a notice be sent once in 2026 and never again. The OBSERVED date is the right one to
-- pin: it is the day the office is actually shut, it is what the email names, and when a holiday
-- shifts for a weekend (5 U.S.C. §6103) it is the date that moves.
CREATE TABLE IF NOT EXISTS contract_holiday_notices (
  id             TEXT PRIMARY KEY,
  account_id     TEXT NOT NULL REFERENCES contract_accounts(id),
  site_id        TEXT,                       -- null when the account has no site breakdown
  holiday_key    TEXT NOT NULL,              -- 'thanksgiving' — see functions/_lib/holidays.js
  observed_date  TEXT NOT NULL,              -- 'YYYY-MM-DD', the day it is OBSERVED, not the date it falls on
  kind           TEXT NOT NULL CHECK(kind IN ('confirm_open', 'kitchen_closed')),
  -- Who it was addressed to, snapshotted. An address changes; the record of who was told must not.
  recipient_email TEXT,
  -- A notice with nowhere to go is still recorded, so the Hub can show "3 accounts have no
  -- operations address" instead of the notice silently never happening.
  outcome        TEXT NOT NULL DEFAULT 'sent' CHECK(outcome IN ('sent', 'failed', 'no_recipient', 'skipped')),
  failure_reason TEXT,
  sent_at        INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_holiday_notice_once
  ON contract_holiday_notices (account_id, holiday_key, observed_date, kind);
CREATE INDEX IF NOT EXISTS ix_holiday_notice_date
  ON contract_holiday_notices (observed_date);

-- ALTER LAST. Every statement above is idempotent; this one is not — SQLite has no
-- "ADD COLUMN IF NOT EXISTS", so a re-run fails here and only here, after the safe work is done.
--
-- WHY THE COLUMN IS NEEDED. contract_site_staff — the people who actually submit the count — holds
-- PHONE NUMBERS and no email at all; that roster was built for SMS codes and receipts. The only
-- address a contract account carries is billing_email, which is the accountant. Asking the
-- accounts-payable clerk whether the program is open on Thanksgiving is asking the wrong person, and
-- they are not the one who will be standing there on the morning. So a site can name the person who
-- runs lunch at that location, and the notice goes to them.
ALTER TABLE contract_sites ADD COLUMN ops_email TEXT;
