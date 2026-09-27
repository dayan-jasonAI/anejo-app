-- Rebuild only execution; transition history references quotes, not this table.
-- Keep every v0137 execution row and its original timestamps/version.
CREATE TABLE catering_execution_driver (
 quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','preparing','ready','en_route','arrived','completed')),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
 delivery_mode TEXT CHECK(delivery_mode IN ('owner_self','pickup','staff_driver')),
 travel_minutes INTEGER CHECK(travel_minutes BETWEEN 0 AND 720), setup_minutes INTEGER CHECK(setup_minutes BETWEEN 0 AND 720),
 handling_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(handling_confirmed IN (0,1)),
 packing_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(packing_confirmed IN (0,1)),
 quote_snapshot TEXT, updated_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO catering_execution_driver SELECT * FROM catering_execution;
DROP TABLE catering_execution;
ALTER TABLE catering_execution_driver RENAME TO catering_execution;
CREATE TABLE catering_assignments (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
 driver_id TEXT NOT NULL REFERENCES staff(id),
 status TEXT NOT NULL CHECK(status IN ('assigned','accepted','declined','released','completed')),
 version INTEGER NOT NULL DEFAULT 1, quote_snapshot TEXT NOT NULL,
 pickup_execution_version INTEGER, assigned_by TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX catering_one_active_assignment ON catering_assignments(quote_id) WHERE status IN ('assigned','accepted');
CREATE INDEX catering_driver_assignments ON catering_assignments(driver_id,status);
CREATE TABLE catering_assignment_receipts (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), idempotency_key TEXT NOT NULL,
 assignment_id TEXT NOT NULL REFERENCES catering_assignments(id) DEFERRABLE INITIALLY DEFERRED,
 request_json TEXT NOT NULL, actor TEXT NOT NULL, success INTEGER NOT NULL DEFAULT 0,
 recorded_at INTEGER NOT NULL, PRIMARY KEY(quote_id,idempotency_key)
);
CREATE TABLE catering_assignment_events (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL REFERENCES catering_assignments(id),
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), actor TEXT NOT NULL, actor_role TEXT NOT NULL,
 operation TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
 version INTEGER NOT NULL, note TEXT, confirmed_line_keys TEXT, recorded_at INTEGER NOT NULL,
 UNIQUE(assignment_id,version)
);
