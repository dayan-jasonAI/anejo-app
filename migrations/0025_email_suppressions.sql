-- Email suppression list (Resend bounces / spam complaints / Resend-side suppressions).
-- Mirrors the SendGrid "suppressions" concept: we never email an address that hard-bounced or
-- filed a spam complaint, protecting sender reputation. Populated by the Resend webhook
-- (/api/webhooks/resend); the pre-send guard in functions/_lib/email.js checks it before sending.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email      TEXT PRIMARY KEY,   -- lowercased recipient address
  reason     TEXT NOT NULL,      -- 'bounced' | 'complained' | 'suppressed' | 'manual'
  detail     TEXT,               -- raw bounce subtype / source / owner note
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_suppressions_created ON email_suppressions (created_at DESC);
