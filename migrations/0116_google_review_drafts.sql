-- Private manual working drafts only. No Google connection or publication state.
CREATE TABLE IF NOT EXISTS google_review_drafts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  review_text TEXT NOT NULL,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  source_url TEXT,
  proposed_reply TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'manual_unverified' CHECK (source_kind = 'manual_unverified'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','dismissed')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_google_review_drafts_updated ON google_review_drafts(updated_at DESC);
