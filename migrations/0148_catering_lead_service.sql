-- Owner follow-up state and reviewed, opt-in acknowledgement template. No customer sends on migration.
CREATE TABLE IF NOT EXISTS catering_service_config (
 id INTEGER PRIMARY KEY CHECK(id=1), ack_enabled INTEGER NOT NULL DEFAULT 0,
 ack_template_version TEXT, activated_at INTEGER, updated_at INTEGER NOT NULL, updated_by TEXT
);
INSERT OR IGNORE INTO catering_service_config(id,updated_at) VALUES(1,0);
CREATE TABLE IF NOT EXISTS catering_lead_service (
 lead_id TEXT PRIMARY KEY REFERENCES leads(id), state TEXT NOT NULL DEFAULT 'open'
 CHECK(state IN ('open','contacted','won','lost')), note TEXT,
 next_followup_at INTEGER, last_escalated_at INTEGER, last_notification_json TEXT,
 updated_at INTEGER NOT NULL, updated_by TEXT
);
CREATE TABLE IF NOT EXISTS catering_acknowledgements (
 lead_id TEXT PRIMARY KEY REFERENCES leads(id), template_version TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','leased','accepted','needs_review')),
 attempts INTEGER NOT NULL DEFAULT 0, first_attempt_at INTEGER, lease_until INTEGER,
 receipt_id TEXT, last_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
