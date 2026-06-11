-- Delivery addresses + routing data.
-- Until now no drop-off address was stored anywhere (Square collected it on its hosted
-- checkout and we never kept it; subscriptions never collected one). We now capture the
-- address in our own forms and store it on the order (snapshot) and on the client (a
-- subscriber's reusable default). Geocoding + optimized ETAs are layered on top.

-- Per-order delivery address snapshot (à-la-carte + each subscription delivery).
ALTER TABLE orders ADD COLUMN delivery_street  TEXT;
ALTER TABLE orders ADD COLUMN delivery_unit    TEXT;
ALTER TABLE orders ADD COLUMN delivery_city    TEXT;
ALTER TABLE orders ADD COLUMN delivery_state   TEXT;
ALTER TABLE orders ADD COLUMN delivery_zip     TEXT;
ALTER TABLE orders ADD COLUMN delivery_notes   TEXT;   -- gate code / instructions / "leave at door"
ALTER TABLE orders ADD COLUMN delivery_lat     REAL;
ALTER TABLE orders ADD COLUMN delivery_lng     REAL;
ALTER TABLE orders ADD COLUMN geocoded_at      INTEGER;

-- A subscriber's default delivery address (reused for each weekly auto-generated order).
ALTER TABLE clients ADD COLUMN delivery_street TEXT;
ALTER TABLE clients ADD COLUMN delivery_unit   TEXT;
ALTER TABLE clients ADD COLUMN delivery_city   TEXT;
ALTER TABLE clients ADD COLUMN delivery_state  TEXT;
ALTER TABLE clients ADD COLUMN delivery_zip    TEXT;
ALTER TABLE clients ADD COLUMN delivery_notes  TEXT;
ALTER TABLE clients ADD COLUMN delivery_lat    REAL;
ALTER TABLE clients ADD COLUMN delivery_lng    REAL;

-- Denormalized address snapshot on each stop (so a route is stable even if the order changes),
-- plus a per-route planned departure and estimated completion for the driver hand-off.
ALTER TABLE route_stops ADD COLUMN address TEXT;
ALTER TABLE routes ADD COLUMN depart_at      INTEGER;   -- planned start (ms epoch)
ALTER TABLE routes ADD COLUMN eta_complete_at INTEGER;  -- estimated finish (ms epoch)
