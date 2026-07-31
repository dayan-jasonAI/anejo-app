-- The Intel Bench: what the market is actually doing, written down where the team can read it.
--
-- market_intel is the shelf of finished briefs — each row is one researched answer with the web
-- sources it stands on. sources_json exists because a brief with no sources is an opinion: the
-- owner (and the next model run) must be able to see WHERE a price signal or a competitor claim
-- came from before acting on it.
--
-- intel_requests is the queue in front of the shelf. It is SHARED with the team-lead module
-- (the lead files questions here too), which is why both tables are IF NOT EXISTS: whichever
-- migration lands first wins, and the second is a no-op instead of a failed deploy.
CREATE TABLE IF NOT EXISTS market_intel (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,            -- 'competitor' | 'market' | 'platform' | 'adhoc'
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,            -- the researched brief, plain text/markdown
  sources_json TEXT,                     -- JSON array of cited URLs — the evidence, not decoration
  created_at   INTEGER NOT NULL
);
-- "Newest brief of this kind" is the read every consumer makes (the tick's 21-day staleness
-- check, the owner page, the lead's context pull) — index it so none of them scan the shelf.
CREATE INDEX IF NOT EXISTS idx_market_intel_kind ON market_intel (kind, created_at);

CREATE TABLE IF NOT EXISTS intel_requests (
  id              TEXT PRIMARY KEY,
  question        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'failed'
  requested_by    TEXT,                             -- who asked (owner id, 'team_lead', ...)
  answer_intel_id TEXT,                             -- market_intel.id once answered
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intel_requests_status ON intel_requests (status, created_at);
