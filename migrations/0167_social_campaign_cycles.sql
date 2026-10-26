-- Organic editorial cycles. An owner preview/review is distinct from a model audit pass.
CREATE TABLE IF NOT EXISTS social_campaign_cycles (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
 title TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
 timezone TEXT NOT NULL DEFAULT 'America/New_York', version INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','scheduled','paused','archived')),
 manifest_json TEXT NOT NULL, validation_json TEXT, active_review_id TEXT,
 generation_config_json TEXT NOT NULL DEFAULT '{"enabled":false}',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,request_id)
);
CREATE TABLE IF NOT EXISTS social_campaign_reviews (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES social_campaign_cycles(id), owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL, request_hash TEXT NOT NULL, campaign_version INTEGER NOT NULL,
 manifest_hash TEXT NOT NULL, review_mode TEXT NOT NULL CHECK(review_mode IN ('automated_pass','owner_reviewed_with_warnings')),
 snapshot_json TEXT NOT NULL, acknowledged_warnings_json TEXT NOT NULL,
 approved_at INTEGER NOT NULL, UNIQUE(owner_id,request_id)
);
CREATE TABLE IF NOT EXISTS social_campaign_actions (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES social_campaign_cycles(id), owner_id TEXT NOT NULL,
 request_id TEXT NOT NULL, op TEXT NOT NULL, payload_hash TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(owner_id,request_id)
);
CREATE TABLE IF NOT EXISTS social_campaign_jobs (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES social_campaign_cycles(id), campaign_version INTEGER NOT NULL,
 slot_id TEXT NOT NULL, request_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('claimed','succeeded','failed','unknown')),
 post_id TEXT, source_snapshot TEXT NOT NULL, error_code TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(campaign_id,campaign_version,slot_id), UNIQUE(campaign_id,request_id)
);
ALTER TABLE social_posts ADD COLUMN campaign_review_id TEXT;
ALTER TABLE social_posts ADD COLUMN campaign_cycle_id TEXT;
CREATE INDEX IF NOT EXISTS idx_social_campaign_owner ON social_campaign_cycles(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_campaign_review_post ON social_posts(campaign_review_id,status);
