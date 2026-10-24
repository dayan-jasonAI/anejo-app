-- Reviewed final-payment drafts. Staging never authorizes a customer send.
ALTER TABLE catering_balance_reminders ADD COLUMN receipt_id TEXT;
ALTER TABLE catering_balance_reminders ADD COLUMN receipt_status TEXT;
ALTER TABLE catering_balance_reminders ADD COLUMN review_hash TEXT;

-- Preserve independently saved acceptance evidence from the previous reminder sender.
-- A timestamp alone is not a provider receipt, and acceptance is not delivery.
UPDATE catering_balance_reminders
SET receipt_id = (
  SELECT json_extract(a.properties,'$.receipt_id') FROM activity_log a
  WHERE a.id='balance_reminder_'||catering_balance_reminders.quote_id||'_'||catering_balance_reminders.kind
    AND a.event='catering.balance_reminder.accepted' AND json_valid(a.properties)
    AND json_extract(a.properties,'$.quote_id')=catering_balance_reminders.quote_id
    AND json_extract(a.properties,'$.kind')=catering_balance_reminders.kind
    AND json_extract(a.properties,'$.provider')='resend'
    AND typeof(json_extract(a.properties,'$.receipt_id'))='text'
    AND length(json_extract(a.properties,'$.receipt_id')) BETWEEN 1 AND 192
    AND json_extract(a.properties,'$.receipt_id') NOT GLOB '*[^a-zA-Z0-9_-]*'
), receipt_status='accepted'
WHERE sent_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM activity_log a
  WHERE a.id='balance_reminder_'||catering_balance_reminders.quote_id||'_'||catering_balance_reminders.kind
    AND a.event='catering.balance_reminder.accepted' AND json_valid(a.properties)
    AND json_extract(a.properties,'$.quote_id')=catering_balance_reminders.quote_id
    AND json_extract(a.properties,'$.kind')=catering_balance_reminders.kind
    AND json_extract(a.properties,'$.provider')='resend'
    AND typeof(json_extract(a.properties,'$.receipt_id'))='text'
    AND length(json_extract(a.properties,'$.receipt_id')) BETWEEN 1 AND 192
    AND json_extract(a.properties,'$.receipt_id') NOT GLOB '*[^a-zA-Z0-9_-]*'
);

CREATE TABLE IF NOT EXISTS catering_balance_collection_drafts (
  quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
  kind TEXT NOT NULL CHECK(kind IN ('due_soon','due_today')),
  review_hash TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged','sending','accepted','suppressed','unknown')),
  staged_by TEXT,
  approved_by TEXT,
  staged_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(quote_id,kind)
);

-- Per-language opt-in: a rendered English approval cannot authorize unseen Spanish copy.
CREATE TABLE IF NOT EXISTS catering_balance_collection_policy (
  lang TEXT PRIMARY KEY CHECK(lang IN ('en','es')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  template_hash TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  source_quote_id TEXT NOT NULL,
  source_review_hash TEXT NOT NULL
);
