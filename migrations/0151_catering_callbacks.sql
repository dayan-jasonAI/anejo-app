-- Preferred times, not booked appointments. No Google credential or customer-send activation.
CREATE TABLE IF NOT EXISTS catering_callback_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), calendar_email TEXT NOT NULL DEFAULT 'dayan@anejocateringco.com',
 timezone TEXT NOT NULL DEFAULT 'America/New_York', duration_minutes INTEGER,
 availability_note TEXT, updated_at INTEGER NOT NULL DEFAULT 0, updated_by TEXT
);
INSERT OR IGNORE INTO catering_callback_settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS catering_callback_requests (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES catering_quotes(id), request_key TEXT NOT NULL,
 requested_start_at INTEGER NOT NULL, timezone TEXT NOT NULL, phone TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','canceled','needs_review')),
 owner_note TEXT, owner_alert_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(quote_id,request_key)
);
CREATE INDEX IF NOT EXISTS catering_callback_dates ON catering_callback_requests(requested_start_at,status);
CREATE TABLE IF NOT EXISTS catering_callback_outbox (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES catering_callback_requests(id),
 kind TEXT NOT NULL CHECK(kind IN ('calendar','confirmation','reminder')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 status TEXT NOT NULL DEFAULT 'queued_disabled' CHECK(status IN ('queued_disabled','needs_review')),
 provider_id TEXT, last_error TEXT, created_at INTEGER NOT NULL, UNIQUE(request_id,kind)
);
