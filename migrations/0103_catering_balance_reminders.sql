-- Scheduled balance reminders: one row per reminder that has actually been sent.
--
-- Dayan, 2026-09-14, asked for automatic reminders on the two days before a catering balance is
-- due. This table is the thing that makes them safe to automate.
--
-- WHY A TABLE AND NOT A FLAG ON THE QUOTE. The scheduler runs every day, and a day can be
-- retried, run twice, or overlap itself. Without a record of exactly which reminder has gone, a
-- customer gets the same "your balance is due" email three mornings running, which reads as
-- dunning rather than a courtesy. The UNIQUE(quote_id, kind) below is the whole guarantee: a
-- given quote can receive each reminder once, ever, and a second attempt is a no-op rather than
-- a second email.
--
-- `kind` is the beat, not the date: 'due_soon' is the day before the balance is due, 'due_today'
-- is the day itself. Naming them by meaning rather than by '2026-09-24' keeps the table useful
-- for every future quote instead of only Karina's.
CREATE TABLE IF NOT EXISTS catering_balance_reminders (
  id         TEXT PRIMARY KEY,
  quote_id   TEXT NOT NULL REFERENCES catering_quotes(id),
  kind       TEXT NOT NULL CHECK(kind IN ('due_soon', 'due_today')),
  -- What was owed when the reminder went, so a later argument about the amount can be settled
  -- from the record rather than from today's row.
  amount_cents INTEGER NOT NULL,
  channel    TEXT NOT NULL DEFAULT 'email',
  sent_at    INTEGER,
  -- A send that failed is still recorded, so the next run can see it was attempted and why,
  -- rather than silently trying forever.
  error      TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(quote_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_balance_reminders_quote
  ON catering_balance_reminders(quote_id, kind);
