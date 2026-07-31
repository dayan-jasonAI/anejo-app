-- Carousels: a post can carry up to 10 images, each with its OWN public token.
--
-- The one-time media window (the only thing that makes an R2 object publicly readable) has always
-- been per-post because a post had one image. A carousel breaks that: Instagram fetches every
-- slide separately and anonymously, so each image needs its own unguessable token, and the window
-- must close for all of them when the post goes live. Hence a child table, not a JSON column —
-- the public route resolves a token with one indexed lookup, and slide ORDER is real data (seq),
-- not the accident of array position in a blob.
CREATE TABLE IF NOT EXISTS social_post_media (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES social_posts(id),
  seq          INTEGER NOT NULL DEFAULT 0,       -- slide order, 0-based
  media_key    TEXT NOT NULL,                    -- R2 key
  public_token TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_post_media_post ON social_post_media (post_id, seq);

-- Backfill: every existing image becomes slide 0 of its post, CARRYING ITS EXISTING TOKEN.
-- Minting new tokens here would break any container Instagram is mid-fetch on, and the deploy
-- window runs old code on this new schema — old code reads social_posts.media_key/public_token,
-- which this migration deliberately leaves in place (additive only, nothing dropped).
INSERT OR IGNORE INTO social_post_media (id, post_id, seq, media_key, public_token, created_at)
SELECT 'spm_' || id, id, 0, media_key, public_token, created_at
FROM social_posts
WHERE media_key IS NOT NULL;
