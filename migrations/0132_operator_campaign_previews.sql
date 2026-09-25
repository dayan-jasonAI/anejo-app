-- Owner-private, review-only generated strategy. Claims never auto-retry a provider call.
-- No links into team briefs, social posts, campaigns or activation queues.
CREATE TABLE IF NOT EXISTS operator_campaign_previews (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
 idea_id TEXT NOT NULL, topic TEXT NOT NULL, topic_sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('generating','succeeded','failed')),
 proposal_json TEXT, source_receipts_json TEXT, model TEXT, error_code TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_operator_campaign_owner ON operator_campaign_previews(owner_id,created_at);
