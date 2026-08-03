-- Who is allowed to place a site's daily lunch order -- more than one person.
--
-- THE INCIDENT (2026-08-03, Pompano Beach). The registered contact was out. Another staffer
-- opened the intake link, typed her own name and her own mobile, and the 6-digit code went to the
-- absent contact's phone anyway -- so nobody could order, the day went unrecorded, and the count
-- had to travel by text message to the owner, who had no way to enter it either.
--
-- The cause was one line in _lib/contract.js: `const dest = onFile || normalizePhone(phone)`.
-- A site's contact_phone, once set, was the ONLY number a code could ever reach; the phone a
-- person typed was used solely on a site's very first use, to self-enroll. contract_intake_devices
-- already allowed MANY trusted devices per site -- the roster was never the limit. The single
-- enrollment phone was.
--
-- This table makes "who may order for this site" a real list instead of one column.
--   active = 1  -- authorized: appears in the intake page's picker, can receive a code
--   active = 0  -- either removed, or a STAND-IN awaiting approval (added_by = 'stand_in').
--                  A stand-in could order (verified by a code to their own phone, recorded under
--                  their own name), but does NOT silently become authorized: promoting them is a
--                  deliberate act by the owner or the site's primary contact.
--
-- contract_sites.contact_phone / contact_name STAY as they are and keep their meaning: the site's
-- PRIMARY contact, who is copied on every receipt so the office keeps its record even when
-- somebody else ordered. This table is additive; nothing reads less than it did before.
CREATE TABLE IF NOT EXISTS contract_site_staff (
  id           TEXT PRIMARY KEY,
  site_id      TEXT NOT NULL,
  account_id   TEXT,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,             -- normalized E.164; the code and receipt go here
  is_primary   INTEGER NOT NULL DEFAULT 0,-- mirrors contract_sites.contact_phone
  added_by     TEXT,                      -- 'owner' | 'site_contact' | 'stand_in' | 'seed'
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
-- One row per number per site: re-verifying an existing phone must update it, never duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_css_site_phone ON contract_site_staff (site_id, phone);
CREATE INDEX IF NOT EXISTS idx_css_site ON contract_site_staff (site_id, active);

-- Seed every site that already has a contact as its own primary, so the picker is never empty on
-- the first load after deploy and no site loses the person who has always ordered for it. The id
-- is derived from the site id (not random) so re-running this migration is a no-op.
INSERT OR IGNORE INTO contract_site_staff (id, site_id, account_id, name, phone, is_primary, added_by, active, created_at)
SELECT 'cst_primary_' || s.id, s.id, s.account_id,
       COALESCE(NULLIF(TRIM(s.contact_name), ''), 'Office contact'), s.contact_phone,
       1, 'seed', 1, COALESCE(s.updated_at, strftime('%s','now') * 1000)
FROM contract_sites s
WHERE s.contact_phone IS NOT NULL AND TRIM(s.contact_phone) <> '';
