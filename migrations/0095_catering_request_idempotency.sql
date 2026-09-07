-- Cajita lead retries: drafted only; apply remotely only after review.
CREATE TABLE IF NOT EXISTS catering_request_idempotency (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  lead_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
