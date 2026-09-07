-- Atomic public intake, upload ownership, replay identity and durable notifications.
-- Additive only. A failed claim aborts the ENTIRE D1 batch, including its lead insert.
CREATE TABLE IF NOT EXISTS catering_requests (
  request_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id),
  upload_session_id TEXT REFERENCES catering_upload_sessions(id),
  attachment_ids TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(attachment_ids)),
  created_at INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS catering_request_claim_guard
BEFORE INSERT ON catering_requests
WHEN NEW.upload_session_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM catering_upload_sessions WHERE id=NEW.upload_session_id
      AND claimed_lead_id=NEW.lead_id AND expires_at>NEW.created_at
  ) THEN RAISE(ABORT, 'catering_upload_claim_conflict') END;
  SELECT CASE WHEN (SELECT COUNT(*) FROM catering_attachments
    WHERE session_id=NEW.upload_session_id AND lead_id=NEW.lead_id)
    != json_array_length(NEW.attachment_ids)
    OR EXISTS (SELECT 1 FROM catering_attachments
      WHERE session_id=NEW.upload_session_id AND
        (lead_id IS NOT NEW.lead_id OR id NOT IN (SELECT value FROM json_each(NEW.attachment_ids))))
    THEN RAISE(ABORT, 'catering_upload_claim_conflict') END;
END;

CREATE TABLE IF NOT EXISTS catering_notification_outbox (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES catering_requests(request_id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  channel TEXT NOT NULL CHECK(channel IN ('hub','email')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','accepted','needs_review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  first_attempt_at INTEGER,
  lease_token TEXT,
  lease_until INTEGER,
  receipt_id TEXT,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(request_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_catering_outbox_due
ON catering_notification_outbox(status, next_attempt_at, lease_until);
