-- Inert until owner provides availability, duration, production OAuth and explicit activation.
ALTER TABLE catering_callback_settings ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catering_callback_settings ADD COLUMN enabled_at INTEGER;
ALTER TABLE catering_callback_settings ADD COLUMN customer_emails_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catering_callback_settings ADD COLUMN email_template_version TEXT;
ALTER TABLE catering_callback_settings ADD COLUMN availability_json TEXT;
ALTER TABLE catering_callback_requests ADD COLUMN calendar_event_id TEXT;
ALTER TABLE catering_callback_requests ADD COLUMN calendar_confirmed_at INTEGER;
ALTER TABLE catering_callback_requests ADD COLUMN duration_minutes INTEGER;
ALTER TABLE catering_callback_requests ADD COLUMN booked_end_at INTEGER;
CREATE TABLE catering_callback_jobs (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES catering_callback_requests(id),
 kind TEXT NOT NULL CHECK(kind IN ('calendar','confirmation','reminder')),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), due_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','verified','accepted','needs_review','suppressed')),
 lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0, first_attempt_at INTEGER,
 next_attempt_at INTEGER NOT NULL DEFAULT 0, provider_id TEXT, last_error TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(request_id,kind)
);
CREATE INDEX catering_callback_jobs_due ON catering_callback_jobs(status,next_attempt_at,due_at);
CREATE TABLE catering_callback_calendar_locks(calendar_id TEXT PRIMARY KEY,holder TEXT NOT NULL,lease_until INTEGER NOT NULL);
-- Retained even when a provider result is uncertain: another request cannot take that slot.
CREATE TABLE catering_callback_slots (
 request_id TEXT PRIMARY KEY REFERENCES catering_callback_requests(id),calendar_id TEXT NOT NULL,
 start_at INTEGER NOT NULL,end_at INTEGER NOT NULL,created_at INTEGER NOT NULL
);
