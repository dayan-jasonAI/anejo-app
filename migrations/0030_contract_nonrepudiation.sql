-- Añejo — non-repudiation for contract head-count orders. Two additive pieces:
--   1) contract_order_events: an APPEND-ONLY audit trail. Every submit / change / device
--      verification writes a NEW row that is never updated or deleted — the tamper-evident
--      record of exactly who submitted what, when, from where, and whether it was verified.
--   2) contract_intake_devices: the trusted-device registry for "verify once per device"
--      (a 6-digit SMS code on first use; the device is then remembered via a signed cookie).
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0030_contract_nonrepudiation.sql

CREATE TABLE IF NOT EXISTS contract_order_events (
  id               TEXT PRIMARY KEY,
  site_id          TEXT NOT NULL,
  account_id       TEXT,
  service_date     TEXT NOT NULL,            -- YYYY-MM-DD (ET) the order is for
  order_id         TEXT,                     -- the kitchen order this affected (octr_...)
  event            TEXT NOT NULL,            -- 'created' | 'updated' | 'verified'
  headcount        INTEGER,
  total_cents      INTEGER,
  notes            TEXT,                     -- allergies / special requests at the time
  submitted_by_name  TEXT,                   -- the person who entered it (as typed)
  submitted_by_phone TEXT,                   -- the number the code/receipt went to
  verified         INTEGER DEFAULT 0,        -- 1 = submitted from a verified/trusted device
  device_id        TEXT,                     -- contract_intake_devices.id, if any
  confirmation_no  TEXT,                     -- ANJ-XXXXXX receipt number
  ip               TEXT,                     -- CF-Connecting-IP at submit time
  user_agent       TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coe_site_date ON contract_order_events (site_id, service_date);
CREATE INDEX IF NOT EXISTS idx_coe_account   ON contract_order_events (account_id, created_at);

CREATE TABLE IF NOT EXISTS contract_intake_devices (
  id            TEXT PRIMARY KEY,            -- random bearer token, stored in the cookie
  site_id       TEXT NOT NULL,
  account_id    TEXT,
  contact_name  TEXT,                        -- staffer name captured at enrollment
  phone         TEXT,                        -- number the verification code was sent to
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  revoked       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cid_site ON contract_intake_devices (site_id);
