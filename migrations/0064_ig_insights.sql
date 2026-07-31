-- The learning loop's memory: what every Instagram post actually did.
--
-- ONE ROW PER POST PER DAY, not a mutable latest-value — reach on day 2 versus day 7 is the
-- difference between "died instantly" and "slow burner", and an upsert would erase exactly that.
-- The sweep covers the WHOLE account's media, not just posts our pipeline published: the 6
-- pre-pipeline posts are the only performance history the brand has, and skipping them would
-- throw away the entire training set on day one.
CREATE TABLE IF NOT EXISTS ig_media_metrics (
  media_id     TEXT NOT NULL,               -- Meta's id for the post
  capture_date TEXT NOT NULL,               -- ET calendar day of the snapshot
  post_id      TEXT,                        -- our social_posts row when the post is ours, else NULL
  media_type   TEXT,                        -- IMAGE | CAROUSEL_ALBUM | VIDEO
  caption      TEXT,                        -- first 300 chars, so learning can see WHAT was said
  permalink    TEXT,
  posted_at    INTEGER,                     -- when it went up on Instagram (epoch ms)
  likes        INTEGER,
  comments     INTEGER,
  reach        INTEGER,
  saved        INTEGER,
  shares       INTEGER,
  views        INTEGER,
  total_interactions INTEGER,
  captured_at  INTEGER NOT NULL,
  PRIMARY KEY (media_id, capture_date)
);
CREATE INDEX IF NOT EXISTS idx_ig_metrics_date ON ig_media_metrics (capture_date);

-- The account itself, daily: followers is the number the whole engine is ultimately judged on,
-- and a single daily row makes the trend queryable with no math.
CREATE TABLE IF NOT EXISTS ig_account_metrics (
  capture_date TEXT PRIMARY KEY,
  followers    INTEGER,
  media_count  INTEGER,
  captured_at  INTEGER NOT NULL
);
