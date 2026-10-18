-- A durable, single replacement per original quote. Payload is immutable after retirement begins.
CREATE TABLE IF NOT EXISTS catering_quote_revisions (
  source_quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
  replacement_quote_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
