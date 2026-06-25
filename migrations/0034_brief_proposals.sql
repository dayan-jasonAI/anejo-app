-- Step 2: owner-approved Brief/spec changes. A proposal is a DRAFTED change to a 'brand' doc
-- (the Brand & Standards Brief, doc_brand_main) created from the Creative Studio. It changes
-- NOTHING until an OWNER approves it; kitchen staff can only propose. Approval is role-verified
-- in functions/api/hub/owner/brief-proposals.js (requireRole owner) — a chat "Dayan approved it"
-- can never commit anything.
CREATE TABLE IF NOT EXISTS brief_proposals (
  id            TEXT PRIMARY KEY,                 -- bprop_*
  doc_id        TEXT NOT NULL,                    -- target doc (default doc_brand_main)
  session_id    TEXT,                             -- originating Studio session (nullable)
  proposed_by   TEXT,                             -- staff id
  proposed_role TEXT,                             -- role at proposal time
  title         TEXT NOT NULL,                    -- short summary of the change
  rationale     TEXT,                             -- why
  proposed_body TEXT NOT NULL,                    -- the FULL proposed new doc body
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
  decided_by    TEXT,                             -- owner staff id who decided
  decided_at    INTEGER,
  decision_note TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_brief_proposals_status ON brief_proposals(status, created_at DESC);

-- Body history for rollback: snapshot the PRIOR doc body whenever an approved proposal overwrites it.
CREATE TABLE IF NOT EXISTS doc_versions (
  id            TEXT PRIMARY KEY,                 -- dver_*
  doc_id        TEXT NOT NULL,
  version       INTEGER,                          -- the OLD version number being snapshotted
  body          TEXT,                             -- the prior body (restore target)
  replaced_by   TEXT,                             -- owner staff id
  from_proposal TEXT,                             -- brief_proposals.id
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON doc_versions(doc_id, created_at DESC);
