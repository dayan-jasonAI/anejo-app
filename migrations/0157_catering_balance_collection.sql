-- Reviewed final-payment drafts. Staging never authorizes a customer send.
ALTER TABLE catering_balance_reminders ADD COLUMN receipt_id TEXT;
ALTER TABLE catering_balance_reminders ADD COLUMN receipt_status TEXT;
ALTER TABLE catering_balance_reminders ADD COLUMN review_hash TEXT;

CREATE TABLE IF NOT EXISTS catering_balance_collection_drafts (
  quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
  kind TEXT NOT NULL CHECK(kind IN ('due_soon','due_today')),
  review_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','sending','accepted','suppressed','unknown')),
  staged_by TEXT,
  approved_by TEXT,
  staged_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(quote_id,kind)
);
