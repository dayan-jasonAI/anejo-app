-- Frozen first-create identity prevents parallel or ambiguous duplicate pay links.
CREATE TABLE IF NOT EXISTS catering_quote_creations (
 creation_key TEXT PRIMARY KEY, lead_id TEXT UNIQUE, request_hash TEXT NOT NULL, quote_id TEXT NOT NULL UNIQUE,
 access_token TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 state TEXT NOT NULL CHECK(state IN ('pending','creating','complete','needs_review')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_error TEXT
);
-- Many obsolete duplicates may point to one canonical quote. The revision
-- table deliberately has a UNIQUE replacement ID and must not be repurposed.
CREATE TABLE IF NOT EXISTS catering_quote_duplicate_retirements (
 source_quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
 target_quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
 source_updated_at INTEGER NOT NULL,target_updated_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','retired','complete')),
 created_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catering_duplicate_target ON catering_quote_duplicate_retirements(target_quote_id,state);
