-- An owner-approved email cannot race checkout retirement. Unknown sends retain
-- the lock until provider reconciliation; never expire it into an automatic retry.
CREATE TABLE IF NOT EXISTS catering_quote_send_reviews (
  quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
  claim_id TEXT NOT NULL UNIQUE,
  review_hash TEXT NOT NULL,
  expected_updated_at INTEGER NOT NULL,
  sms_authorized INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK(state IN ('sending','unknown','accepted','nosend')),
  outcome_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
