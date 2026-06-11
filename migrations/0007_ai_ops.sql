-- Añejo HUB — Phase 3 AI ops: automation suggestions + thread read receipts.
-- Apply: wrangler d1 execute anejo --file=migrations/0007_ai_ops.sql
-- Style matches 0004_owner_alerts.sql: TEXT PRIMARY KEY ids, INTEGER unix-ms timestamps, JSON-as-TEXT.

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  suggestion_type TEXT NOT NULL,          -- restock_suggest|route_optimize|payroll_prep|...
  summary TEXT,
  payload TEXT,                           -- JSON the accept-action consumes
  status TEXT NOT NULL DEFAULT 'pending', -- pending|accepted|dismissed|expired
  source_run_id TEXT,
  actioned_by TEXT REFERENCES staff(id),
  actioned_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE TABLE IF NOT EXISTS thread_reads (
  thread_id TEXT NOT NULL REFERENCES threads(id),
  reader_id TEXT NOT NULL,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, reader_id)
);
