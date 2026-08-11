-- Añejo — persist the Team Lead's planned per-slide overlay wording on each carousel slide, so
-- the branding tool pre-fills the wording box for that slide (no retyping). Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0091_social_media_overlay_wording.sql

ALTER TABLE social_post_media ADD COLUMN overlay_headline TEXT;
ALTER TABLE social_post_media ADD COLUMN overlay_sub TEXT;
