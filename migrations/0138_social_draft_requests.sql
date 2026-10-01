-- Durable actor-scoped receipts; retained even if a post is later deleted.
CREATE TABLE IF NOT EXISTS social_draft_requests (
 actor TEXT NOT NULL,
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 post_id TEXT NOT NULL,
 result_status TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(actor, request_id)
);
