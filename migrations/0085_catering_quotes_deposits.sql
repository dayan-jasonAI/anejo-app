-- Añejo — catering QUOTES and their 25% booking deposit. Additive only.
--
-- WHY THIS EXISTS. _lib/quote.js could compute a deposit (depositFor) since it was written, and
-- nothing in the app could take one. There was no row to attach a deposit to, no Square link to
-- pay it with, and no record of what the customer was told when they paid. A quote engine whose
-- deposit is a number on a screen is a dead end: the owner still had to chase the money by hand,
-- and the terms lived in whatever he typed into that particular email.
--
-- TERMS ARE STORED WITH THE QUOTE, not looked up later. If the standard terms change next year,
-- an event booked this year is still governed by the text that was on the customer's screen when
-- they paid. That is the whole reason terms_version + terms_json are columns and not a constant:
-- a cancellation argument is settled by what they agreed to, not by what the file says today.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0085_catering_quotes_deposits.sql

CREATE TABLE IF NOT EXISTS catering_quotes (
  id                 TEXT PRIMARY KEY,
  -- Who and what
  customer_name      TEXT,
  customer_email     TEXT,
  customer_phone     TEXT,
  event_date         TEXT,              -- YYYY-MM-DD (the event, not the booking)
  guests             INTEGER NOT NULL,
  -- Money, INTEGER CENTS end to end (same discipline as orders/contract_invoices)
  total_cents        INTEGER NOT NULL,  -- the full quoted event total
  deposit_pct        REAL    NOT NULL,  -- 0.25 — stored per quote, never assumed at read time
  deposit_cents      INTEGER NOT NULL,  -- what the deposit link charges
  balance_cents      INTEGER NOT NULL,  -- total - deposit; what is still owed after it clears
  -- Deposit lifecycle
  deposit_status     TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | paid | void
  deposit_paid_at    INTEGER,
  deposit_paid_cents INTEGER,           -- what Square actually captured (may differ from quoted)
  square_order_id    TEXT,              -- the deposit payment link's Square order
  payment_link_id    TEXT,
  payment_link_url   TEXT,
  -- Balance lifecycle (the deposit is half the story; the balance is the other half)
  balance_status     TEXT NOT NULL DEFAULT 'due',     -- due | paid | waived
  balance_paid_at    INTEGER,
  balance_due_date   TEXT,              -- YYYY-MM-DD, derived from the terms at quote time
  final_count_due    TEXT,              -- YYYY-MM-DD, the headcount deadline from the terms
  -- What the customer was shown and agreed to
  terms_version      TEXT NOT NULL,
  terms_json         TEXT NOT NULL,     -- full machine-readable snapshot of the terms
  quote_json         TEXT,              -- buildQuote() breakdown, so every dollar stays traceable
  note               TEXT,
  created_by         TEXT,              -- owner/staff email that built the quote
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catering_quotes_sq    ON catering_quotes (square_order_id);
CREATE INDEX IF NOT EXISTS idx_catering_quotes_email ON catering_quotes (customer_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catering_quotes_date  ON catering_quotes (event_date);
