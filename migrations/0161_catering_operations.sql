-- Actual kitchen work is separate from planning checkboxes, and stays attached to the quote.
CREATE TABLE catering_operations_activation (
 quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id), quote_snapshot TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, activated_by TEXT NOT NULL, activated_at INTEGER NOT NULL
);
CREATE TABLE catering_line_progress (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), line_key TEXT NOT NULL,
 quote_snapshot TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('preparing','cooked','packed')),
 actual_qty REAL, version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,line_key)
);
CREATE TABLE catering_purchase_items (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), item_key TEXT NOT NULL,
 quote_snapshot TEXT NOT NULL, item TEXT NOT NULL, qty TEXT NOT NULL, note TEXT,
 status TEXT NOT NULL CHECK(status IN ('needed','purchased','removed')),
 version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,item_key)
);
CREATE TABLE catering_handling_readings (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), line_key TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('packing','pickup','delivery')), quote_snapshot TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('hot','cold','ambient')), temperature_f REAL,
 carrier TEXT NOT NULL,note TEXT,version INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,line_key,stage)
);
CREATE TABLE catering_operation_receipts (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), request_id TEXT NOT NULL,
 request_json TEXT NOT NULL, actor_id TEXT NOT NULL, recorded_at INTEGER NOT NULL,
 success INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(quote_id,request_id)
);
CREATE TABLE catering_operation_events (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
 operation TEXT NOT NULL,record_key TEXT NOT NULL,version INTEGER NOT NULL,
 actor_id TEXT NOT NULL,details_json TEXT NOT NULL,recorded_at INTEGER NOT NULL
);
