-- Execution is separate from quote/payment state and planning checklist ticks.
CREATE TABLE catering_execution (
 quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','preparing','ready','en_route','arrived','completed')),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
 delivery_mode TEXT CHECK(delivery_mode IN ('owner_self','pickup')),
 travel_minutes INTEGER CHECK(travel_minutes BETWEEN 0 AND 720), setup_minutes INTEGER CHECK(setup_minutes BETWEEN 0 AND 720),
 handling_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(handling_confirmed IN (0,1)),
 packing_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(packing_confirmed IN (0,1)),
 quote_snapshot TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE catering_execution_transitions (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
 idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL,
 from_status TEXT NOT NULL, to_status TEXT NOT NULL, version INTEGER NOT NULL,
 actor TEXT NOT NULL, note TEXT, recorded_at INTEGER NOT NULL,
 UNIQUE(quote_id,idempotency_key), UNIQUE(quote_id,version)
);
