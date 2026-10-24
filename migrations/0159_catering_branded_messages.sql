-- Reviewed, branded owner messages. Sending/unknown outcomes remain durable retry fences.
CREATE TABLE IF NOT EXISTS catering_message_drafts (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id), recipient TEXT NOT NULL,
 review_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'staged', receipt_id TEXT, error TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, actor TEXT
);
CREATE INDEX IF NOT EXISTS idx_catering_message_lead ON catering_message_drafts(lead_id,created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catering_message_content ON catering_message_drafts(lead_id,review_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catering_message_uncertain ON catering_message_drafts(lead_id) WHERE status IN ('sending','unknown');
