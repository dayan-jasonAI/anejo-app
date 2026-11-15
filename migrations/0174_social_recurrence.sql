-- Durable rules and reviewed content for manually approved Instagram series.
CREATE TABLE IF NOT EXISTS social_recurrences (
  id TEXT PRIMARY KEY,
  source_post_id TEXT NOT NULL REFERENCES social_posts(id),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  rule_json TEXT NOT NULL CHECK (json_valid(rule_json)),
  status TEXT NOT NULL CHECK (status IN ('active','paused','ended','stopped')),
  next_at INTEGER,
  last_post_id TEXT REFERENCES social_posts(id) DEFERRABLE INITIALLY DEFERRED,
  missed_at INTEGER,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_social_recurrences_due ON social_recurrences(status,next_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_recurrences_open_source
  ON social_recurrences(source_post_id) WHERE status IN ('active','paused');

ALTER TABLE social_post_media ADD COLUMN recurring_etag TEXT;
