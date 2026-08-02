-- Team Training: lets the owner teach the marketing team from the HUB — no local file edit,
-- no `node scripts/build-brand-context.mjs`, no redeploy.
--
-- WHY THIS EXISTS. Today "teaching the team" means editing docs/brand-standards-brief.md on a
-- laptop and pushing a deploy. `tools/cardgen/references/` LOOKS like a training folder but
-- nothing reads it at runtime — a training folder nobody reads is not training, it is a folder.
-- This gives the owner two inputs the marketing prompts can actually see:
--   · training_rules    — plain-language guidance ("always show food in the first slide")
--   · training_examples — a reference photo + the owner's note ("this is the look I want" /
--                          "never do this"), image in R2 (functions/_lib/media.js), note here.
-- functions/_lib/training.js renders both into prompt-ready text under a hard character budget,
-- the same discipline knowledge.js/studio_context.js already use — a library that grows without
-- bound must never silently blow the prompt window (or worse, silently drop the newest guidance).

CREATE TABLE IF NOT EXISTS training_rules (
  id          TEXT PRIMARY KEY,
  text        TEXT NOT NULL,            -- the instruction itself, in the owner's own words
  active      INTEGER NOT NULL DEFAULT 1,   -- delete = 0, not a row removal; keeps created_at honest
  created_by  TEXT,                     -- owner session email/id — "who wrote it"
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL          -- bumped on every edit; trainingContext() sorts newest-edited first
);
CREATE INDEX IF NOT EXISTS idx_training_rules_active ON training_rules(active, updated_at);

CREATE TABLE IF NOT EXISTS training_examples (
  id          TEXT PRIMARY KEY,
  media_key   TEXT NOT NULL,            -- R2 key under training/ (see functions/_lib/media.js putMedia)
  note        TEXT NOT NULL,            -- the owner's plain-language explanation of the example
  flag        TEXT NOT NULL DEFAULT 'good' CHECK (flag IN ('good','bad')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_examples_active ON training_examples(active, updated_at);
