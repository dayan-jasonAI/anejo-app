-- Null on existing drafts: historical caption-only scores are not visual approval.
ALTER TABLE social_posts ADD COLUMN audit_scope TEXT;
ALTER TABLE social_posts ADD COLUMN audit_snapshot TEXT;
