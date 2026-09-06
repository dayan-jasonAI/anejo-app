-- Private design files submitted with public catering quote requests.
-- Bytes live in the private MEDIA R2 bucket; D1 keeps the short-lived upload session
-- and the owner-only relationship back to the saved lead.
CREATE TABLE IF NOT EXISTS catering_upload_sessions (
  id              TEXT PRIMARY KEY,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  claimed_lead_id TEXT REFERENCES leads(id),
  claimed_at      INTEGER
);

CREATE TABLE IF NOT EXISTS catering_attachments (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES catering_upload_sessions(id),
  lead_id      TEXT REFERENCES leads(id),
  slot         INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
  r2_key       TEXT NOT NULL UNIQUE,
  filename     TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  byte_size    INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  created_at   INTEGER NOT NULL,
  UNIQUE(session_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_catering_attachments_session
ON catering_attachments(session_id);

CREATE INDEX IF NOT EXISTS idx_catering_attachments_lead
ON catering_attachments(lead_id);
