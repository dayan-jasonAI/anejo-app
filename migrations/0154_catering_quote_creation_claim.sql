-- Frozen first-create identity prevents parallel or ambiguous duplicate pay links.
CREATE TABLE IF NOT EXISTS catering_quote_creations (
 creation_key TEXT PRIMARY KEY, lead_id TEXT UNIQUE, request_hash TEXT NOT NULL, quote_id TEXT NOT NULL UNIQUE,
 access_token TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 state TEXT NOT NULL CHECK(state IN ('pending','creating','complete','needs_review')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_error TEXT
);
