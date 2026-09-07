-- Future-only draft; intentionally outside migrations/ so active migration runners do not apply it.
CREATE TABLE IF NOT EXISTS catering_request_idempotency (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  lead_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
