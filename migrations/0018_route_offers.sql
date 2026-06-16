-- Añejo — route assignment becomes a driver OFFER (accept/deny). Owner picks the first
-- driver; that driver gets a push + text and Accept/Deny buttons in the HUB. A DENY or
-- ~2 minutes of silence auto-offers the route to the next AVAILABLE driver. When no
-- available driver remains, the route goes 'unfilled' and the owner is alerted. Each
-- driver's accept/decline/miss tally is kept on their card. Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0018_route_offers.sql

-- routes.driver_id holds the CURRENT offeree (or the accepted driver). Legacy rows default
-- to 'accepted' so nothing already out there is affected.
ALTER TABLE routes ADD COLUMN offer_status TEXT DEFAULT 'accepted'; -- pending|accepted|declined|unfilled
ALTER TABLE routes ADD COLUMN offered_at   INTEGER;                  -- when the current offer was sent
ALTER TABLE routes ADD COLUMN declined_ids TEXT DEFAULT '[]';        -- JSON array of staff who declined/missed
CREATE INDEX IF NOT EXISTS idx_routes_offer ON routes(offer_status, offered_at);

-- Driver reliability counters (shown on the driver card).
ALTER TABLE staff ADD COLUMN offers_accepted INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN offers_declined INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN offers_missed   INTEGER DEFAULT 0;

-- Per-offer audit log.
CREATE TABLE IF NOT EXISTS route_offers (
  id          TEXT PRIMARY KEY,
  route_id    TEXT NOT NULL,
  driver_id   TEXT,
  outcome     TEXT NOT NULL,   -- offered|accepted|declined|missed|unfilled
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_route_offers_route ON route_offers(route_id);
