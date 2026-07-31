-- Governance gates (Brand Auditor + Claims Checker): every generated draft is scored BEFORE
-- the owner sees it. A planner caption once invented an ordering deadline, and Aña once let
-- model scaffolding reach a public reply — so drafts now carry their audit on the row itself,
-- next to the caption the owner is about to read.
-- Additive only. Existing rows read NULL = "predates the auditor", which surfaces must show
-- as UNSCORED, never as passed.

-- 0-100 brand score from the Haiku judge. NULL means never audited — distinct from 0, which
-- means audited and failed hard.
ALTER TABLE social_posts ADD COLUMN audit_score INTEGER;

-- JSON array of {type:'claim'|'voice'|'photo'|'audit_unavailable', detail}. WHY the verdict
-- is what it is, so the review screen can say "invented price" instead of a bare red mark.
ALTER TABLE social_posts ADD COLUMN audit_flags TEXT;

-- When the audit ran (epoch ms). An audit is a snapshot of the LIVE menu and ops dials at one
-- moment; the timestamp is what makes a verdict recognizably stale after a price change.
ALTER TABLE social_posts ADD COLUMN audit_at INTEGER;

-- The canonical yes/no the trust ledger's auto-publish gate reads. The two sibling modules were
-- built blind to each other and assumed different spellings (score/flags here, audit_status in
-- trust); this is the reconciliation: 'pass' | 'flag', NULL = never audited.
ALTER TABLE social_posts ADD COLUMN audit_status TEXT;
