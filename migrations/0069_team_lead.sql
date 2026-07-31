-- The marketing Team Lead's desk: the conversation, the briefs it writes, and the intel it asks for.
--
-- team_messages is the transcript of the owner talking strategy with the Lead. It is a RECORD,
-- not a queue: nothing executes from here. When the Lead's reply carried an action block, the
-- deterministic result of executing it is written into actions_json alongside the words — so six
-- months from now "why does this brief exist" has an answer in the same row that proposed it.
CREATE TABLE IF NOT EXISTS team_messages (
  id           TEXT PRIMARY KEY,
  role         TEXT NOT NULL CHECK (role IN ('owner','lead')),
  body         TEXT NOT NULL,
  actions_json TEXT,                          -- the parsed action + what actually happened, or NULL
  created_at   INTEGER NOT NULL
);
-- The chat reads "last 40 by time" on every page load; without this that is a sort of the table.
CREATE INDEX IF NOT EXISTS idx_team_messages_created ON team_messages (created_at);

-- A campaign brief is the Lead's unit of work: one idea, argued for, with its success metric
-- written down BEFORE the posts exist. status is the owner's dial — the Lead only ever creates
-- 'draft'; 'approved' and 'archived' are human decisions (decision #1: the AI proposes, the
-- owner disposes).
CREATE TABLE IF NOT EXISTS team_briefs (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  objective      TEXT,
  audience       TEXT,
  angle          TEXT,
  channels       TEXT,                        -- JSON array of channel names ('instagram', 'email', ...)
  assets_json    TEXT,                        -- proposed captions / image briefs, if the Lead drafted any
  cadence        TEXT,
  success_metric TEXT,                        -- named up front so "did it work" is checkable, not vibes
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  created_by     TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_briefs_created ON team_briefs (created_at);

-- Questions the Lead cannot answer from its spine and refuses to guess at (the invented-deadline
-- lesson: a fact the model does not have is a fact it must ask for, not make up). Shared with the
-- intel module — IF NOT EXISTS on purpose, so 0069 and the intel migration are safe to land in
-- either order and whichever runs second is a no-op.
CREATE TABLE IF NOT EXISTS intel_requests (
  id           TEXT PRIMARY KEY,
  question     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_by TEXT,                          -- 'lead' when it came out of a team chat
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intel_requests_status ON intel_requests (status);
