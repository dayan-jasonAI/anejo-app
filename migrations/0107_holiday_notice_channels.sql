-- Holiday notices: one per SITE and per CHANNEL, and a place for the answer to land.
--
-- THE DEFECT THIS FIXES, found before a single notice had gone out. 0106 made the once-only guarantee
-- UNIQUE(account_id, holiday_key, observed_date, kind) — per ACCOUNT — while the planner builds one
-- notice per SITE. DGP is one account with two sites. Delray Beach's row would insert; Pompano
-- Beach's would collide on the index, the runner's catch would count it as "already sent", and
-- Pompano would never be asked whether it was open — with the job's own summary saying otherwise. A
-- constraint that silently swallows a legitimate second notice is not idempotence, it is data loss
-- that reports success. The index below keys on the site, so two sites are two questions.
--
-- CHANNEL. Dayan, 2026-09-15: the people who decide whether a program runs on a holiday are the site
-- coordinators on the ordering roster, and they live on their phones — the count, the six-digit
-- code and the receipt already reach them by text. The accounts-payable inbox that email falls back
-- to is the wrong person for this question. So a notice now goes by SMS to the site's primary
-- roster contact as well as by email, and each channel is its own row: its own once-only guarantee,
-- its own outcome, its own failure reason. One row carrying two channels would have to say "sent"
-- while one of them failed.
--
-- THE ANSWER. A coordinator who texts back CLOSED has told us something the kitchen needs, and a
-- reply that only lands in a generic inbox thread titled "SMS from 3642" is an answer nobody can act
-- on. reply_text keeps exactly what they wrote; reply_answer is filled ONLY on an unambiguous
-- OPEN/CLOSED (or ABIERTO/CERRADO) and stays NULL otherwise, so a sentence like "closed in the
-- morning only" is kept verbatim for a person to read rather than rounded to a yes or a no.
--
-- RE-RUNNING. The ALTERs come first because the new index depends on the column. A second run fails
-- on the first ALTER and stops there, which leaves an already-migrated table exactly as it was —
-- nothing half-applied. Applied to production with zero notice rows in the table (checked first).

ALTER TABLE contract_holiday_notices ADD COLUMN channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms'));
ALTER TABLE contract_holiday_notices ADD COLUMN recipient_phone TEXT;
ALTER TABLE contract_holiday_notices ADD COLUMN reply_text TEXT;
ALTER TABLE contract_holiday_notices ADD COLUMN reply_answer TEXT CHECK (reply_answer IN ('open', 'closed'));
ALTER TABLE contract_holiday_notices ADD COLUMN replied_at INTEGER;

DROP INDEX IF EXISTS ux_holiday_notice_once;
-- IFNULL because SQLite treats NULLs as distinct in a UNIQUE index: an account-level notice (no site)
-- would otherwise never collide with itself and could be sent every single day.
CREATE UNIQUE INDEX IF NOT EXISTS ux_holiday_notice_once_v2
  ON contract_holiday_notices (account_id, IFNULL(site_id, ''), holiday_key, observed_date, kind, channel);

-- The inbound webhook finds "the notice this person is answering" by phone.
CREATE INDEX IF NOT EXISTS ix_holiday_notice_phone
  ON contract_holiday_notices (channel, recipient_phone, sent_at);
