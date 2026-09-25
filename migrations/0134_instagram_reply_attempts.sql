-- One claimed outbound attempt per inbound trigger; uncertain delivery never auto-retries.
ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT;
CREATE TABLE IF NOT EXISTS instagram_reply_attempts (
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE, thread_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('dm','comment')), trigger_id TEXT NOT NULL,
 followup_of TEXT NOT NULL DEFAULT '', recipient_id TEXT NOT NULL, body TEXT NOT NULL, body_sha256 TEXT NOT NULL,
 initiated_by TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('claimed','sent','failed','unknown')),
 provider_message_id TEXT, error_code TEXT, created_at INTEGER NOT NULL, completed_at INTEGER,
 UNIQUE(kind,trigger_id,followup_of)
);
CREATE INDEX IF NOT EXISTS idx_instagram_reply_attempt_thread ON instagram_reply_attempts(thread_id,created_at);
