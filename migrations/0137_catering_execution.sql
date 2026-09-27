-- Execution is separate from quote/payment state and planning checklist ticks.
CREATE TABLE catering_execution (
 quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
 status TEXT NOT NULL DEFAULT 'planned', version INTEGER NOT NULL DEFAULT 0,
 delivery_mode TEXT, travel_minutes INTEGER, setup_minutes INTEGER,
 handling_confirmed INTEGER NOT NULL DEFAULT 0, packing_confirmed INTEGER NOT NULL DEFAULT 0,
 quote_snapshot TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE catering_execution_transitions (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
 idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL,
 from_status TEXT NOT NULL, to_status TEXT NOT NULL, version INTEGER NOT NULL,
 actor TEXT NOT NULL, note TEXT, recorded_at INTEGER NOT NULL,
 UNIQUE(quote_id,idempotency_key), UNIQUE(quote_id,version)
);
