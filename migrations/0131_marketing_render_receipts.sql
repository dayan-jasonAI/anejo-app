-- Immutable browser declarations and server-observed byte associations; never approval.
-- No foreign-key cascade: history survives later draft/media removal.
CREATE TABLE IF NOT EXISTS marketing_render_receipts (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, request_id TEXT NOT NULL,
 request_hash TEXT NOT NULL, post_id TEXT NOT NULL, media_id TEXT NOT NULL,
 source_key TEXT NOT NULL, source_sha256 TEXT NOT NULL, source_bytes INTEGER NOT NULL,
 output_key TEXT NOT NULL UNIQUE, output_sha256 TEXT NOT NULL, output_bytes INTEGER NOT NULL,
 output_width INTEGER NOT NULL, output_height INTEGER NOT NULL,
 declaration_json TEXT NOT NULL, evidence_tier TEXT NOT NULL CHECK(evidence_tier='browser_declared'),
 state TEXT NOT NULL CHECK(state IN ('pending','attached')), created_at INTEGER NOT NULL, attached_at INTEGER,
 UNIQUE(actor_id,request_id)
);
CREATE INDEX IF NOT EXISTS idx_render_receipt_output ON marketing_render_receipts(output_sha256);
