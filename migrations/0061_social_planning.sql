-- Let the content planner queue a post that does not have its picture yet.
--
-- media_key was NOT NULL because every post so far was created by a human who had already picked
-- an image. A planned post is the other way round: the caption, the angle and the timing are
-- decided first, and the photo is made to match. Forcing a placeholder key would put a row in the
-- table that claims to point at an object that does not exist.
--
-- SQLite cannot drop NOT NULL with ALTER, so the table is rebuilt. Rows are carried across
-- explicitly rather than with SELECT * — a column-order surprise here would silently shuffle a
-- caption into a media key.
CREATE TABLE social_posts_new (
  id              TEXT PRIMARY KEY,
  platform        TEXT NOT NULL DEFAULT 'instagram',
  caption         TEXT,
  media_key       TEXT,                      -- NULL until an image is attached; publishing requires one
  public_token    TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'draft',
  scheduled_at    INTEGER,
  published_at    INTEGER,
  ig_container_id TEXT,
  ig_media_id     TEXT,
  permalink       TEXT,
  error           TEXT,
  -- The art direction the planner wrote, so Studio has something to generate FROM rather than the
  -- owner re-deriving the idea from the caption.
  image_brief     TEXT,
  -- 'owner' | 'planner'. Worth knowing which posts the business wrote and which it approved,
  -- both for tone review later and so an owner's own draft is never treated as disposable.
  source          TEXT NOT NULL DEFAULT 'owner',
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

INSERT INTO social_posts_new
  (id, platform, caption, media_key, public_token, status, scheduled_at, published_at,
   ig_container_id, ig_media_id, permalink, error, created_by, created_at, updated_at)
SELECT id, platform, caption, media_key, public_token, status, scheduled_at, published_at,
       ig_container_id, ig_media_id, permalink, error, created_by, created_at, updated_at
FROM social_posts;

DROP TABLE social_posts;
ALTER TABLE social_posts_new RENAME TO social_posts;

CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts (created_at DESC);
