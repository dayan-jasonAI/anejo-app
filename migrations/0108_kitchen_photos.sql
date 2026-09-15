-- 0108 — Two photos before an order can be marked ready.
--
-- Dayan, 2026-09-15: before the cook marks an order ready for pickup, they snap the food INSIDE the
-- open bowl, tray or box, and then the container CLOSED. "If I don't get those two pictures, the
-- order cannot be set as ready." The driver's drop-off photo is unchanged.
--
-- One row per photo taken. A retake does not delete the earlier row: it stamps superseded_at, so
-- the owner can still see what was photographed before. Only rows with superseded_at IS NULL count
-- toward the gate (functions/_lib/kitchen-ready.js). When an office raises its count after the
-- photos were taken, contract.js supersedes them: the food inside changed, so the photos must too.
--
-- The image itself lives in R2 under kitchen/<yyyy-mm>/… and is served only to staff roles
-- (functions/api/hub/media/[[path]].js). These photos never get a public link.
--
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0108_kitchen_photos.sql

CREATE TABLE IF NOT EXISTS kitchen_photos (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('contents', 'packed')),  -- inside the open container | closed and packed
  media_key      TEXT NOT NULL,                                          -- R2 key under kitchen/
  taken_by       TEXT,                                                   -- staff id of the signed-in cook
  taken_by_name  TEXT,                                                   -- snapshot for display
  taken_at       INTEGER NOT NULL,
  superseded_at  INTEGER                                                 -- set by a retake or a count change
);
CREATE INDEX IF NOT EXISTS idx_kitchen_photos_order ON kitchen_photos(order_id, kind, superseded_at);
