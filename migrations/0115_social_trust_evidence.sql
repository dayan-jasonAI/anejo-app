-- Visual trust starts from evidenced, distinct human approvals. Owner toggles are preserved.
ALTER TABLE social_posts ADD COLUMN original_design_snapshot TEXT;
CREATE TABLE social_trust_approvals (
  post_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('clean','edited')),
  revision TEXT NOT NULL,
  category TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, decision, revision)
);
CREATE UNIQUE INDEX social_trust_one_clean ON social_trust_approvals(post_id) WHERE decision='clean';
-- Historical caption-only counts cannot certify visual design quality.
UPDATE trust_ledger SET approved_clean=0;
