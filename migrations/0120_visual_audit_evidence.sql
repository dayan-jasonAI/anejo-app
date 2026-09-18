-- Legacy evidence remains nullable: no invented rubric/context or approval origin.
ALTER TABLE social_posts ADD COLUMN audit_detail_json TEXT;
ALTER TABLE social_posts ADD COLUMN audit_context_snapshot TEXT;
ALTER TABLE social_posts ADD COLUMN auto_audit_required INTEGER CHECK (auto_audit_required IS NULL OR auto_audit_required=1);
