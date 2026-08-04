-- Repair intel_requests: production is missing two columns the code has always written.
--
-- ROOT CAUSE — a CREATE TABLE IF NOT EXISTS that silently lost an argument.
-- 0069_team_lead.sql creates `intel_requests` with (id, question, status, requested_by,
-- created_at). 0070_intel.sql ALSO declares `intel_requests`, with two extra columns
-- (answer_intel_id, updated_at) — but as CREATE TABLE **IF NOT EXISTS**, and by then the table
-- already existed. So 0070 was a no-op against the live database, and production has carried the
-- 0069 shape ever since while every reader was written against the 0070 shape.
--
-- WHAT THAT BROKE, verified against production 2026-08-04:
--   · intel-tick.js "UPDATE intel_requests SET status='done', answer_intel_id=?, updated_at=?"
--     → `no such column: updated_at` — so a researched answer could never be attached, and the
--       request could never leave 'pending'.
--   · owner/intel.js SELECT of answer_intel_id/updated_at → `no such column: answer_intel_id`.
--   · owner/intel.js INSERT (owner-filed question) → threw; that is why every intel_requests row
--     in production has requested_by='lead' and not one was ever filed by the owner.
-- Three real questions have sat 'pending' since 2026-07-31 for exactly this reason. The owner's
-- report — "there is no way to input an answer" — was a true observation of a real defect, not a
-- missing feature.
--
-- Both columns are added NULLABLE on purpose. 0070 declares updated_at as NOT NULL, but SQLite
-- cannot add a NOT NULL column to a table that already has rows without a constant default, and
-- inventing a default timestamp for three historical rows would be fabricating data. Every writer
-- supplies both values explicitly, so nullable costs nothing here; the backfill below gives the
-- existing rows an honest updated_at (their own created_at) rather than a made-up "now".
ALTER TABLE intel_requests ADD COLUMN answer_intel_id TEXT;
ALTER TABLE intel_requests ADD COLUMN updated_at INTEGER;

-- Honest backfill: a row last changed when it was created, because nothing has been able to
-- update it since. Do not use CURRENT_TIMESTAMP here — it would claim these rows were touched
-- today, which is the opposite of what happened.
UPDATE intel_requests SET updated_at = created_at WHERE updated_at IS NULL;
