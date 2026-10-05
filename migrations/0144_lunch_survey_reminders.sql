ALTER TABLE contract_lunch_feedback ADD COLUMN delivery_id TEXT;
CREATE TABLE IF NOT EXISTS contract_survey_reminders (
 id TEXT PRIMARY KEY, contract_order_id TEXT NOT NULL, site_id TEXT NOT NULL,
 delivery_id TEXT NOT NULL, completed_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
 to_number TEXT NOT NULL,
 link_token TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'queued', provider_sid TEXT,
 error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(contract_order_id,to_number)
);
CREATE INDEX IF NOT EXISTS idx_survey_reminder_due ON contract_survey_reminders(status,due_at);
