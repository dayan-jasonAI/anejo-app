-- The Marketing Expert's desk (role 'marketing', added 2026-08-11).
--
-- WHY THIS EXISTS. Dayan hired a marketing expert to take over the marketing system: run it,
-- test it, and tell him what needs changing. Two of those three are jobs the app could already
-- support — the marketing workspace exists, and widening a guard lets her in. The third had
-- nowhere to live. "She will be running it daily to ensure consistent output" and "providing
-- live feedback to the owner" are not features of the workspace; they are a record of whether
-- the system was checked today and what it said. Without a record, "consistent output" is a
-- claim nobody can audit, and feedback is whatever was said in a text message.
--
-- So: one row per day, holding the outcome of each check on the daily run, plus the note she
-- leaves for Dayan. It is deliberately NOT a task list — the checks themselves are defined in
-- code (functions/_lib/marketing_run.js) so they can change with the product without a
-- migration, and this table only stores what happened.
--
-- Her feedback to the owner does NOT get a table: it is raised through _lib/alerts.js as
-- alert_type 'marketing_feedback', so it lands in the SAME feed Dayan already reads every
-- morning on /hub/owner/. A second inbox he has to remember to open is a message not delivered.
--
-- Note there is no change to `staff` here. staff.role has never had a CHECK constraint (see
-- migrations/0003_hub.sql) — the role vocabulary is enforced in functions/_lib/roles.js — so
-- 'marketing' is storable the moment the app accepts it. Nothing to migrate for her login.

CREATE TABLE IF NOT EXISTS marketing_daily_runs (
  id            TEXT PRIMARY KEY,
  run_date      TEXT NOT NULL,            -- YYYY-MM-DD in America/New_York (hub.js today())
  staff_id      TEXT,                     -- who ran it; null if the row was opened by the system
  checks        TEXT NOT NULL DEFAULT '{}',  -- JSON { checkKey: 'ok' | 'issue' | 'skip' }
  issues        INTEGER NOT NULL DEFAULT 0,  -- denormalised count of 'issue' results, for the
                                             -- owner's compliance read (avoids parsing JSON in SQL)
  note          TEXT,                     -- what she wants Dayan to know about today
  submitted_at  INTEGER,                  -- null while the run is still in progress
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- One run per day for the desk. The marketing desk is a single seat by design; if a second
-- marketing seat is ever added, they share the day's run rather than each filing their own —
-- the question the owner asks is "was the system checked today", not "did each person check it".
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_daily_runs_date ON marketing_daily_runs(run_date);
CREATE INDEX IF NOT EXISTS idx_marketing_daily_runs_submitted ON marketing_daily_runs(submitted_at);
