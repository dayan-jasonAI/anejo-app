-- Explicit owner review promotes one immutable private proposal into existing team planning.
CREATE TABLE IF NOT EXISTS operator_campaign_promotions (
 id TEXT PRIMARY KEY, preview_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
 brief_id TEXT NOT NULL UNIQUE, proposal_sha256 TEXT NOT NULL, proposal_json TEXT NOT NULL,
 source_receipts_json TEXT NOT NULL, authority_json TEXT NOT NULL,
 review_scope TEXT NOT NULL CHECK(review_scope='team_planning_only'),
 acknowledged_open_questions INTEGER NOT NULL CHECK(acknowledged_open_questions=1),
 created_at INTEGER NOT NULL, UNIQUE(owner_id,request_id)
);
