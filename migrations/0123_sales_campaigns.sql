-- 0123 — CAMPAIGNS and REPLIES: the two things that made the pipeline need a human for every step.
--
-- Dayan, 2026-09-21: make the Sales OS "10x better, and autonomous".
--
-- A campaign is not a new sending path. Enrolling twelve adult day care centers in one action is
-- the same enrollment the Hub already does one prospect at a time, with a name on it — so the
-- follow-up schedule that already exists can run without the owner starting each one by hand, and
-- so "what happened to the twelve I sent in October" is a question with an answer.
--
-- Replies were the other stall: reply detection is manual, and a hot reply that nobody marks keeps
-- a sequence talking over a buyer who already answered. sales_replies stores what they actually
-- said, classified, and that record is what stops the sequence and drafts the answer.
--
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0123_sales_campaigns.sql

CREATE TABLE IF NOT EXISTS sales_campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT,                     -- the ICP category this campaign targets, when it has one
  goal          TEXT,                     -- what the owner is trying to learn or win, in his words
  status        TEXT NOT NULL DEFAULT 'active',   -- active | paused | done
  -- What was true about Añejo's readiness when the owner launched it. A campaign approved while the
  -- dietitian signature was missing is a fact worth keeping, not a state to reconstruct later.
  readiness_note TEXT,
  created_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Which campaign an enrollment belongs to. NULL is the ordinary one-off enrollment.
ALTER TABLE sales_enrollments ADD COLUMN campaign_id TEXT;
CREATE INDEX IF NOT EXISTS idx_enrollments_campaign ON sales_enrollments(campaign_id);

CREATE TABLE IF NOT EXISTS sales_replies (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  opportunity_id  TEXT,
  outreach_id     TEXT,                   -- the email they replied to, when known
  contact_id      TEXT,
  channel         TEXT NOT NULL DEFAULT 'email',   -- email | phone | text | in_person | referral
  body            TEXT NOT NULL,          -- what they actually said, verbatim
  classification  TEXT,                   -- interested | question | not_now | not_interested | unsubscribe | other
  confidence      TEXT,                   -- high | medium | low
  signals         TEXT,                   -- JSON: the phrases the classifier keyed on, so it can be checked
  handled         INTEGER NOT NULL DEFAULT 0,
  drafted_outreach_id TEXT,               -- the answer this reply produced, once drafted
  logged_by       TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_replies_org ON sales_replies(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_replies_handled ON sales_replies(handled, created_at);
