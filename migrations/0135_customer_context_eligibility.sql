-- Customer-facing grounding is an explicit owner grant. Existing and new sources remain internal.
ALTER TABLE training_rules ADD COLUMN customer_eligible INTEGER NOT NULL DEFAULT 0 CHECK (customer_eligible IN (0, 1));
ALTER TABLE training_rules ADD COLUMN customer_eligible_by TEXT;
ALTER TABLE training_rules ADD COLUMN customer_eligible_at INTEGER;
ALTER TABLE training_rules ADD COLUMN customer_eligible_source_updated_at INTEGER;
ALTER TABLE training_rules ADD COLUMN customer_context_decision_by TEXT;
ALTER TABLE training_rules ADD COLUMN customer_context_decision_at INTEGER;
ALTER TABLE kb_documents ADD COLUMN customer_eligible INTEGER NOT NULL DEFAULT 0 CHECK (customer_eligible IN (0, 1));
ALTER TABLE kb_documents ADD COLUMN customer_eligible_by TEXT;
ALTER TABLE kb_documents ADD COLUMN customer_eligible_at INTEGER;
ALTER TABLE kb_documents ADD COLUMN customer_eligible_source_updated_at INTEGER;
ALTER TABLE kb_documents ADD COLUMN customer_context_decision_by TEXT;
ALTER TABLE kb_documents ADD COLUMN customer_context_decision_at INTEGER;

CREATE TABLE customer_context_eligibility_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('training_rule', 'knowledge_document')),
  source_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant', 'revoke')),
  actor TEXT NOT NULL,
  decided_at INTEGER NOT NULL,
  source_updated_at INTEGER NOT NULL,
  resulting_updated_at INTEGER NOT NULL
);

CREATE TRIGGER audit_training_customer_eligibility
AFTER UPDATE OF customer_eligible ON training_rules
WHEN NEW.customer_eligible <> OLD.customer_eligible
BEGIN
  INSERT INTO customer_context_eligibility_audit
    (source_kind, source_id, action, actor, decided_at, source_updated_at, resulting_updated_at)
  VALUES ('training_rule', NEW.id, CASE WHEN NEW.customer_eligible = 1 THEN 'grant' ELSE 'revoke' END,
    COALESCE(NEW.customer_context_decision_by, 'database'),
    COALESCE(NEW.customer_context_decision_at, NEW.updated_at), OLD.updated_at, NEW.updated_at);
END;

CREATE TRIGGER audit_knowledge_customer_eligibility
AFTER UPDATE OF customer_eligible ON kb_documents
WHEN NEW.customer_eligible <> OLD.customer_eligible
BEGIN
  INSERT INTO customer_context_eligibility_audit
    (source_kind, source_id, action, actor, decided_at, source_updated_at, resulting_updated_at)
  VALUES ('knowledge_document', NEW.id, CASE WHEN NEW.customer_eligible = 1 THEN 'grant' ELSE 'revoke' END,
    COALESCE(NEW.customer_context_decision_by, 'database'),
    COALESCE(NEW.customer_context_decision_at, NEW.updated_at), OLD.updated_at, NEW.updated_at);
END;
