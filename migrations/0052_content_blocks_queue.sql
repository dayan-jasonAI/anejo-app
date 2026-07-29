-- A slot holds a QUEUE of announcements, not one row.
--
-- 0051 made `slot` the primary key, so a slot could hold exactly one message. That is the shape
-- that makes announcement bars fail in practice: the owner has to be at a keyboard at the moment
-- the message becomes true. "Closed July 4th" has to be written ON July 3rd, and taken down on the
-- 5th, or it is wrong in one direction or the other. Nobody writes them in advance because there
-- is nowhere to put one.
--
-- With many rows per slot, each carrying its own window, a month of announcements can be written
-- in one sitting and each appears and retires on its own. Live = whichever row's window contains
-- now (see pickLive in _lib/content.js for how a tie is broken).
--
-- SQLite cannot drop a PRIMARY KEY, so this is the standard table rebuild. The existing row is
-- carried over with a deterministic id, not regenerated — the announcement currently on the site
-- must survive the migration unchanged.

CREATE TABLE IF NOT EXISTS content_blocks_v2 (
  id          TEXT PRIMARY KEY,
  slot        TEXT NOT NULL,             -- e.g. 'announcement'; NO LONGER unique
  body_en     TEXT,
  body_es     TEXT,
  link_url    TEXT,
  link_label  TEXT,
  tone        TEXT NOT NULL DEFAULT 'info',   -- info | good | urgent (styling only)
  active      INTEGER NOT NULL DEFAULT 0,
  starts_at   INTEGER,
  ends_at     INTEGER,
  updated_by  TEXT,
  updated_at  INTEGER NOT NULL
);

INSERT OR IGNORE INTO content_blocks_v2
  (id, slot, body_en, body_es, link_url, link_label, tone, active, starts_at, ends_at, updated_by, updated_at)
SELECT 'cb_' || slot, slot, body_en, body_es, link_url, link_label, tone, active, starts_at, ends_at, updated_by, updated_at
  FROM content_blocks;

DROP TABLE content_blocks;
ALTER TABLE content_blocks_v2 RENAME TO content_blocks;

-- The public read is "every active row for a slot" on every page load; the owner read is "every
-- row for a slot".
CREATE INDEX IF NOT EXISTS idx_content_blocks_slot ON content_blocks (slot, active);
