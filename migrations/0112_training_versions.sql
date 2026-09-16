-- 0112 — Training that can go OUT OF DATE, so a process change reaches the person who does the work.
--
-- Dayan, 2026-09-16, the morning the two kitchen photos shipped: make it "a training update task for
-- the kitchen staff so she gets notified in her next login to complete that training first so she
-- knows about this new process update."
--
-- Until now a training_completions row was permanent: one row per (staff, role-module), completed
-- once, true forever. That is exactly wrong for a living product — the cook "completed kitchen
-- training" in a month when Mark ready had no photo gate and no prep clock, and nothing anywhere
-- knew her completion was stale.
--
--   version     WHICH version of the module was completed (functions/_lib/training_modules.js owns
--               the strings). NULL means "completed before versioning existed" — deliberately NOT
--               backfilled to the current version: nobody has seen the photo gate, so every existing
--               kitchen row must read as out of date, which is the truth.
--   updated_at  When the row last changed. completed_at already moves on a re-completion, but it is
--               the staffer's fact ("I finished this"); updated_at is the row's fact, and keeps the
--               table readable next to every other table here.
--
-- Additive only — no backfill, no default. Apply:
--   wrangler d1 execute anejo --remote --file=migrations/0112_training_versions.sql

ALTER TABLE training_completions ADD COLUMN version TEXT;
ALTER TABLE training_completions ADD COLUMN updated_at INTEGER;
