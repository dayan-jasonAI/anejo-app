-- 0072 — Trust ledger: per-category graduated autonomy for the social planner. Additive only.
--
-- Owner decision #1/#4: everything Aña drafts is approved by a human at first, and a category
-- only EARNS auto-publish after 5 clean approvals — "clean" meaning the owner scheduled or
-- published the draft without touching a word. The count is a streak, not a total: one edit
-- says the drafts in that category still need eyes, so the streak resets to zero. Nothing here
-- flips auto_publish by itself — at 5 the HUB shows "eligible" and the OWNER flips the toggle.
--
-- social_posts gains the two columns the streak math needs:
--   · category               — which lane the planner filed the post under (fixed five below)
--   · original_caption_hash  — hash of the caption AS DRAFTED. Approval compares the caption at
--                              schedule/publish time against this; equal = clean, different =
--                              the owner had to fix it, and the category's streak restarts.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0072_trust_cockpit.sql

ALTER TABLE social_posts ADD COLUMN category TEXT;
ALTER TABLE social_posts ADD COLUMN original_caption_hash TEXT;

CREATE TABLE IF NOT EXISTS trust_ledger (
  category       TEXT PRIMARY KEY,            -- menu | macro_portal | catering | brand_story | promo
  approved_clean INTEGER NOT NULL DEFAULT 0,  -- current CLEAN streak (resets on any edit)
  auto_publish   INTEGER NOT NULL DEFAULT 0,  -- the owner's toggle; never set by code
  updated_at     INTEGER
);

-- Seed the five fixed categories so the cockpit shows every lane from day one — an empty table
-- would read as "no trust system" rather than "no approvals yet".
INSERT OR IGNORE INTO trust_ledger (category, approved_clean, auto_publish, updated_at) VALUES
  ('menu',         0, 0, NULL),
  ('macro_portal', 0, 0, NULL),
  ('catering',     0, 0, NULL),
  ('brand_story',  0, 0, NULL),
  ('promo',        0, 0, NULL);
