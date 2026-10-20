-- Internal quote working copies. Saving never creates a checkout or contacts a customer.
CREATE TABLE IF NOT EXISTS catering_quote_drafts (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL CHECK(version>=1),
 state TEXT NOT NULL CHECK(state IN ('draft','prepared','archived')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 quote_id TEXT REFERENCES catering_quotes(id), prepared_quote_updated_at INTEGER,
 created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS catering_quote_drafts_state_updated ON catering_quote_drafts(state,updated_at DESC);
