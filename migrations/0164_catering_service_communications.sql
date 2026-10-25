-- Reviewed templates activate only for future real execution transitions.
CREATE TABLE catering_service_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
 template_version TEXT, enabled_at INTEGER, approved_by TEXT, approved_at INTEGER
);
INSERT INTO catering_service_settings(id) VALUES(1);
CREATE TABLE catering_service_messages (
 quote_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('en_route','completed')),
 channel TEXT NOT NULL CHECK(channel IN ('email','sms')), transition_version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','sending','accepted','unknown','suppressed','failed')),
 provider_id TEXT, sms_log_id TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,kind,channel)
);
CREATE INDEX catering_service_pending ON catering_service_messages(status,created_at);
CREATE TABLE catering_email_receipts (
 provider_id TEXT PRIMARY KEY, status TEXT NOT NULL, observed_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('signed_webhook','provider_readback'))
);
