-- Partner applications: the /affiliate page became application-only.
--
-- The first version published the commission terms. Dayan pulled them, for reasons worth
-- recording: a public rate ANCHORS every negotiation under a dial that is deliberately per-partner
-- (10-50% in the HUB); the renewals-included mechanic is the growth playbook and a public page
-- hands it to competitors; and curated programs read premium precisely because they do not post
-- terms. Terms now travel ONLY in the private welcome email at approval, where they always lived.
CREATE TABLE IF NOT EXISTS partner_applications (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL DEFAULT 'creator',   -- 'creator' | 'gym_trainer'
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  instagram     TEXT,
  other_socials TEXT,
  area          TEXT,                              -- city / part of South Florida
  audience_size TEXT,                              -- self-reported bracket, not verified
  heard_from    TEXT,                              -- how they found Añejo
  reason        TEXT,                              -- why they want to join
  status        TEXT NOT NULL DEFAULT 'new',       -- new | reviewed | approved | declined
  ip_hash       TEXT,                              -- salted hash, same privacy posture as link_clicks
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_apps_status ON partner_applications (status, created_at);
