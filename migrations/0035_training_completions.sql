-- Training completion + compliance. One row per (staff, role-module) when a staffer finishes the
-- tutorial. Lets the owner see who has completed their training and who hasn't.
CREATE TABLE IF NOT EXISTS training_completions (
  id            TEXT PRIMARY KEY,        -- tc_*
  staff_id      TEXT NOT NULL,
  module        TEXT NOT NULL,           -- role module key (owner|kitchen|driver|vendor)
  lang          TEXT,                    -- language completed in (en|es)
  completed_at  INTEGER NOT NULL,
  UNIQUE(staff_id, module)
);
CREATE INDEX IF NOT EXISTS idx_training_completions_staff ON training_completions(staff_id);
