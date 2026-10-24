-- Per-booking reviewed service messages and private, scoped feedback links.
CREATE TABLE catering_experience_tokens (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), kind TEXT NOT NULL CHECK(kind IN ('pre_event_checkin','post_delivery_review')),
 token TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,kind)
);
CREATE TABLE catering_experience_outbox (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), kind TEXT NOT NULL CHECK(kind IN ('pre_event_checkin','post_delivery_review')),
 review_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','approved','sending','accepted','suppressed','unknown')),
 approved_hash TEXT, approved_by TEXT, approved_at INTEGER,
 receipt_id TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,kind)
);
CREATE UNIQUE INDEX catering_experience_uncertain ON catering_experience_outbox(quote_id) WHERE status IN ('sending','unknown');
CREATE TABLE catering_experience_feedback (
 quote_id TEXT NOT NULL REFERENCES catering_quotes(id), kind TEXT NOT NULL,
 rating INTEGER CHECK(rating BETWEEN 1 AND 10), mood TEXT CHECK(mood IN ('sad','neutral','happy')),
 would_again INTEGER CHECK(would_again IN (0,1)), comment TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 PRIMARY KEY(quote_id,kind)
);
CREATE TABLE catering_lifecycle_runtime (
 id TEXT PRIMARY KEY, last_tick INTEGER, last_success INTEGER, last_error TEXT, considered INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0
);
