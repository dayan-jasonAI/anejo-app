-- Actual attendance only. Planning/reservations remain in their separate tables.
CREATE TABLE commissary_usage_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), profile_json TEXT NOT NULL DEFAULT '{}',
 version INTEGER NOT NULL DEFAULT 0, updated_by TEXT, updated_at INTEGER
);
INSERT INTO commissary_usage_settings(id) VALUES(1);
CREATE TABLE commissary_visits (
 id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id), staff_name TEXT NOT NULL,
 quote_id TEXT REFERENCES catering_quotes(id), started_at INTEGER NOT NULL, ended_at INTEGER,
 services_json TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', profile_json TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, reviewed_by TEXT, reviewed_at INTEGER,
 external_status TEXT NOT NULL DEFAULT 'not_recorded'
  CHECK(external_status IN ('not_recorded','user_reported_submitted')),
 external_reported_by TEXT, external_reported_at INTEGER, external_reference TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(ended_at IS NULL OR ended_at>started_at)
);
CREATE UNIQUE INDEX commissary_one_open_visit ON commissary_visits(staff_id) WHERE ended_at IS NULL;
CREATE INDEX commissary_month_visits ON commissary_visits(started_at,ended_at);
CREATE TABLE commissary_usage_receipts (
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL, request_json TEXT NOT NULL,
 visit_id TEXT, succeeded INTEGER NOT NULL DEFAULT 1 CHECK(succeeded=1), recorded_at INTEGER NOT NULL,
 PRIMARY KEY(actor_id,request_id)
);
CREATE TABLE commissary_usage_events (
 id TEXT PRIMARY KEY, visit_id TEXT REFERENCES commissary_visits(id), operation TEXT NOT NULL,
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL,
 reason TEXT, recorded_at INTEGER NOT NULL, UNIQUE(actor_id,request_id)
);
CREATE TRIGGER commissary_events_no_update BEFORE UPDATE ON commissary_usage_events BEGIN
 SELECT RAISE(ABORT,'Commissary audit events are append-only');
END;
CREATE TRIGGER commissary_events_no_delete BEFORE DELETE ON commissary_usage_events BEGIN
 SELECT RAISE(ABORT,'Commissary audit events are append-only');
END;
