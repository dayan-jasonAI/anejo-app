-- Publishing to Instagram from the HUB.
--
-- Creative Studio already generates on-brand captions and plate images; there was no way to get
-- them OUT of the building. Someone copied them into the app by hand, which is why the account has
-- six posts.
--
-- THE PUBLIC-TOKEN DESIGN, and why it is not a shortcut:
-- Instagram does not accept image bytes. It takes an `image_url` and its servers FETCH it,
-- anonymously. Our media route (/api/hub/media/*) is behind requireRole, so Instagram would get a
-- 401 — and the same R2 bucket holds delivery PROOF PHOTOS and RECEIPTS, so opening the bucket
-- would publish customer doorsteps and addresses to anyone who guessed a key.
--
-- So each post carries its own `public_token`: an unguessable string that makes exactly ONE object
-- readable, and only because a human staged that object for publication. Nothing else in the
-- bucket becomes reachable, and a token cannot be pointed at a different key later.
CREATE TABLE IF NOT EXISTS social_posts (
  id              TEXT PRIMARY KEY,
  platform        TEXT NOT NULL DEFAULT 'instagram',
  caption         TEXT,
  media_key       TEXT NOT NULL,             -- R2 key, e.g. studio/2026-07/abc.jpg
  public_token    TEXT NOT NULL UNIQUE,      -- the ONLY thing that makes media_key publicly readable
  -- draft → scheduled → publishing → published | failed
  -- 'publishing' exists because the Instagram flow is not atomic: create a container, POLL it until
  -- it is FINISHED, then publish. A crash between those steps must not look like a draft, or the
  -- next run would post the same thing twice.
  status          TEXT NOT NULL DEFAULT 'draft',
  scheduled_at    INTEGER,
  published_at    INTEGER,
  ig_container_id TEXT,                      -- Meta's creation_id; expires after 24h
  ig_media_id     TEXT,
  permalink       TEXT,                      -- read back AFTER publishing, as proof it is live
  error           TEXT,
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts (status, scheduled_at);
