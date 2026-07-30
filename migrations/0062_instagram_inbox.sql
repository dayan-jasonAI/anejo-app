-- Instagram comments and DMs land in Añejo Comms, not a second inbox.
--
-- The threads/messages tables already are the inbox the team looks at. A separate Instagram
-- console would mean someone has to remember to check it, and the one that gets forgotten is
-- always the one the customer used.

-- Who this thread is with on the outside. For a DM that is the IGSID (Instagram-scoped user id,
-- which is per-app and NOT the public account id); for a comment thread it is the media id.
ALTER TABLE threads ADD COLUMN external_id TEXT;
ALTER TABLE threads ADD COLUMN external_username TEXT;

-- WHEN THEY LAST WROTE TO US. This is not bookkeeping — Meta allows a reply only within 24 hours
-- of an inbound message, so this column is what makes an outbound send legal. Without it we would
-- be guessing, and guessing wrong is a policy violation on the account itself.
ALTER TABLE threads ADD COLUMN last_inbound_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_threads_external ON threads (external_id);

-- Raw webhook receipts, for idempotency. Meta RETRIES deliveries, and a retry must not become a
-- second copy of the same DM in the inbox or a second reply to the same comment.
CREATE TABLE IF NOT EXISTS social_events (
  id           TEXT PRIMARY KEY,          -- the platform's own id for the event/message/comment
  platform     TEXT NOT NULL DEFAULT 'instagram',
  kind         TEXT NOT NULL,             -- 'message' | 'comment' | 'mention'
  thread_id    TEXT REFERENCES threads(id),
  from_id      TEXT,
  from_username TEXT,
  media_id     TEXT,
  text         TEXT,
  raw          TEXT,                      -- the payload, for diagnosing anything surprising
  handled      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_events_handled ON social_events (handled, created_at);
