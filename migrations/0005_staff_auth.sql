-- Añejo HUB — staff PIN auth + manager/lead tier.
-- Adds credential + RBAC columns to the existing staff table (0003_hub.sql).
ALTER TABLE staff ADD COLUMN pin_hash         TEXT;
ALTER TABLE staff ADD COLUMN pin_salt         TEXT;
ALTER TABLE staff ADD COLUMN pin_set_at       INTEGER;
ALTER TABLE staff ADD COLUMN must_change_pin  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN is_lead          INTEGER NOT NULL DEFAULT 0;  -- team manager/lead
ALTER TABLE staff ADD COLUMN login_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff ADD COLUMN locked_until     INTEGER;                      -- unix-ms lockout
ALTER TABLE staff ADD COLUMN invited_by       TEXT;                         -- staff.id of owner/admin

CREATE INDEX IF NOT EXISTS idx_staff_phone ON staff(phone);
