-- Private owner-supplied ideas are deliberately separate from team_briefs:
-- existing planner/Lead readers consume draft team briefs as directing context.
-- No activation, approval, generation, or public-action state exists here.
CREATE TABLE IF NOT EXISTS operator_brief_ideas (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 objective TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK (status = 'draft'),
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
