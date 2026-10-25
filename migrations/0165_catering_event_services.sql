CREATE TABLE catering_kitchen_calendar_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), calendar_id TEXT, confirmed_by TEXT, confirmed_at INTEGER
);
INSERT INTO catering_kitchen_calendar_settings(id) VALUES(1);
CREATE TABLE catering_kitchen_reservations (
 quote_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
 quote_updated_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','approved','booking','confirmed','needs_review','canceled')),
 calendar_id TEXT, provider_event_id TEXT, provider_verified_at INTEGER, error TEXT,
 approved_by TEXT, approved_at INTEGER, created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE catering_kitchen_calendar_locks (
 calendar_id TEXT PRIMARY KEY, holder TEXT NOT NULL, lease_until INTEGER NOT NULL
);
CREATE TABLE catering_label_drafts (
 quote_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1, theme TEXT NOT NULL,
 quote_updated_at INTEGER NOT NULL, snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL,
 approved_by TEXT, approved_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
