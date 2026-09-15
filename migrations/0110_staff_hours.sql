-- Añejo — staff hours: a pay basis per person, an audit of every pay change, and an audit of
-- every owner correction to a shift. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0110_staff_hours.sql
--
-- The shifts table (0003) already records clock in/out, breaks and total_minutes; this does NOT
-- add a second clock. What was missing was everything needed to PAY from it.
--
--   staff.pay_basis : 'hourly' | 'per_route' | NULL.  The OWNER's decision, per person.
--       NULL keeps today's behavior: kitchen → hourly, driver → per_route (routes.pay_cents),
--       anyone else → hourly once they have shifts. A per_route person's shifts still show hours,
--       but never hourly pay — so nobody is paid for the same work twice.
--
--   staff_pay_log : one row per change to pay_rate_cents / pay_basis / employment_type —
--       who made it, when, old → new. A rate change is a money change.
--
--   shift_edits : one row per owner correction or forced close of a shift, with the reason
--       (required) and the old and new values as JSON. Nothing about a worked hour is changed
--       without leaving this trail.

ALTER TABLE staff ADD COLUMN pay_basis TEXT;

CREATE TABLE IF NOT EXISTS staff_pay_log (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT NOT NULL REFERENCES staff(id),
  field       TEXT NOT NULL,              -- pay_rate_cents | pay_basis | employment_type
  old_value   TEXT,
  new_value   TEXT,
  changed_by  TEXT,                       -- staff id of the owner who made the change
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_pay_log_staff ON staff_pay_log(staff_id, created_at);

CREATE TABLE IF NOT EXISTS shift_edits (
  id          TEXT PRIMARY KEY,
  shift_id    TEXT NOT NULL REFERENCES shifts(id),
  staff_id    TEXT,
  action      TEXT NOT NULL,              -- correct | close
  reason      TEXT NOT NULL,
  old_values  TEXT NOT NULL,              -- JSON {clock_in_at, clock_out_at, break_minutes, total_minutes, status}
  new_values  TEXT NOT NULL,              -- JSON, same shape
  edited_by   TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shift_edits_shift ON shift_edits(shift_id, created_at);

-- The weekly timesheet selects by person and clock-in time.
CREATE INDEX IF NOT EXISTS idx_shifts_staff_clock_in ON shifts(staff_id, clock_in_at);
