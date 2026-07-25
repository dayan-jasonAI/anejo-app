-- 0047 — Marketing consent, kept DELIBERATELY SEPARATE from transactional consent.
--
-- The existing `sms_consent` flag was collected with wording about ORDER AND DELIVERY UPDATES.
-- That is transactional consent. Under the TCPA, sending a promotional SMS to that list is a
-- different category of message requiring its own express opt-in, at $500–$1,500 per message per
-- recipient. So marketing consent gets its own columns and NOBODY is grandfathered into them —
-- every marketing flag starts at 0 and is only ever set by someone ticking a box that says so.
--
-- Email is a different regime: CAN-SPAM permits sending to an existing business relationship
-- provided every message carries a working unsubscribe and a physical address. So
-- marketing_email_consent defaults to 1 for people who bought or asked to hear from us, and the
-- unsubscribe path (campaign_unsubscribes + email_suppressions) is what makes that lawful.

ALTER TABLE clients ADD COLUMN marketing_email_consent INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clients ADD COLUMN marketing_sms_consent   INTEGER NOT NULL DEFAULT 0;  -- express opt-in ONLY
ALTER TABLE clients ADD COLUMN marketing_sms_consent_at INTEGER;                    -- proof: when they ticked it
ALTER TABLE clients ADD COLUMN marketing_sms_consent_src TEXT;                      -- proof: which form

ALTER TABLE leads ADD COLUMN marketing_email_consent INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN marketing_sms_consent   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN marketing_sms_consent_at INTEGER;
ALTER TABLE leads ADD COLUMN marketing_sms_consent_src TEXT;

-- One row per person who opted out of marketing, by channel. Separate from email_suppressions
-- (which is deliverability: bounces + spam complaints) because an unsubscribe is a STANDING
-- INSTRUCTION from a customer and must survive anything we do to the suppression list.
CREATE TABLE IF NOT EXISTS campaign_unsubscribes (
  id          TEXT PRIMARY KEY,
  email       TEXT,
  phone       TEXT,
  channel     TEXT NOT NULL,           -- 'email' | 'sms' | 'all'
  reason      TEXT,
  source      TEXT,                    -- 'link' | 'reply_stop' | 'owner' | 'preference_page'
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unsub_email ON campaign_unsubscribes(email);
CREATE INDEX IF NOT EXISTS idx_unsub_phone ON campaign_unsubscribes(phone);

-- A campaign is drafted, previewed against a segment, then sent. Kept as rows (never just an
-- in-flight loop) so a send can be resumed, audited, and counted after the fact.
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,
  channel       TEXT NOT NULL DEFAULT 'email',   -- 'email' | 'sms'
  name          TEXT NOT NULL,
  subject       TEXT,
  body          TEXT,                            -- markdown-ish; rendered through emailShell
  segment       TEXT NOT NULL,                   -- 'launch_list' | 'past_customers' | 'subscribers' | 'all'
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | sending | sent | canceled
  recipients    INTEGER NOT NULL DEFAULT 0,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  sent_at       INTEGER
);

-- One row per recipient per campaign. UNIQUE(campaign_id,address) is the whole safety story:
-- a retried or double-clicked send can never message the same person twice.
CREATE TABLE IF NOT EXISTS campaign_sends (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  address      TEXT NOT NULL,          -- email or E.164 phone
  status       TEXT NOT NULL,          -- queued | sent | failed | skipped
  reason       TEXT,                   -- why skipped/failed
  created_at   INTEGER NOT NULL,
  UNIQUE (campaign_id, address)
);
CREATE INDEX IF NOT EXISTS idx_sends_campaign ON campaign_sends(campaign_id, status);
