-- Post provenance: what CAUSED a post to look the way it does — which owner training rules were
-- in force, which campaign brief (if any) directed it, its category, and its format. Without this,
-- "reach went up this week" and "the owner wrote a rule last week" are two facts nobody can ever
-- connect — the whole point of the training surface (0075) and campaign briefs (0069) is that they
-- should be checkable against results, and today nothing records the link between the two.
--
-- ONE ROW PER POST, written by functions/_lib/post_provenance.js:stampPostProvenance — best-effort,
-- called by whatever creates or finishes a post (the weekly planner, and later Creative Studio
-- once a carousel's slide count is actually known). Never part of the same transaction as the
-- INSERT INTO social_posts: a provenance write must never be able to sink the post it describes.
--
-- THE UNKNOWN-VS-KNOWN-EMPTY DISTINCTION THIS SCHEMA EXISTS TO PRESERVE:
-- A post from before this table existed has NO ROW here at all — that must read as "we don't know
-- what rules were in force," never as "zero rules were in force." Those are different claims, and
-- an analysis that cannot tell them apart would quietly credit (or blame) the training system for
-- posts it never touched. So the presence of a row is itself the "recorded" signal:
--   · no row for post_id            → UNKNOWN (predates provenance, or the stamp call never ran)
--   · row exists, rule_ids = '[]'   → KNOWN: confirmed zero training rules were active
--   · row exists, rule_ids = '[...]' → KNOWN: exactly these rule ids were active
-- The same convention applies to brief_id / category / format: NULL inside a row that DOES exist
-- means "recorded, and confirmed not applicable" — not "we never asked."
--
-- stampPostProvenance is called with only the fields known at that moment (format in particular
-- is often decided later, once Creative Studio has actually built a single image or a carousel),
-- so this is an upsert: a later call fills in more columns without erasing what an earlier call
-- already recorded. See post_provenance.js for the exact merge contract.
CREATE TABLE IF NOT EXISTS post_provenance (
  post_id     TEXT PRIMARY KEY REFERENCES social_posts(id),
  rule_ids    TEXT,                              -- JSON array of training_rules.id; NULL = not recorded
  brief_id    TEXT REFERENCES team_briefs(id),   -- the campaign brief that directed this post, or NULL = recorded as "none"
  category    TEXT,                              -- one of TRUST_CATEGORIES (trust_ledger.js), or NULL
  format      TEXT CHECK (format IS NULL OR format IN ('single', 'carousel')),
  slide_count INTEGER,                           -- carousel slide count; NULL for a single image or when not yet known
  created_at  INTEGER NOT NULL,                  -- when the first stamp landed (post creation, typically)
  updated_at  INTEGER NOT NULL                   -- bumped on every stamp, including later partial ones
);
