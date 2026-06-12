-- Delivery fulfillment loop: per-bowl pickup checkoff, per-stop lifecycle + notifications,
-- live-GPS ETA, MMS proof-of-delivery, smart feedback, driver availability.
-- All additive; safe to apply ahead of the code that uses it.

-- Orders: capture phone + SMS consent on à-la-carte checkout (customer_name already exists).
ALTER TABLE orders ADD COLUMN customer_phone TEXT;
ALTER TABLE orders ADD COLUMN sms_consent    INTEGER DEFAULT 0;

-- Route stops: full per-stop lifecycle. status extends to
--   pending | picked | en_route | arriving | delivered | failed
ALTER TABLE route_stops ADD COLUMN pickup_state   TEXT;       -- JSON { itemId: pickedQty }
ALTER TABLE route_stops ADD COLUMN picked_count   INTEGER DEFAULT 0;
ALTER TABLE route_stops ADD COLUMN picked_total   INTEGER DEFAULT 0;
ALTER TABLE route_stops ADD COLUMN picked_at      INTEGER;
ALTER TABLE route_stops ADD COLUMN pickup_flag    TEXT;       -- JSON missing/short items, if any
ALTER TABLE route_stops ADD COLUMN nav_started_at INTEGER;
ALTER TABLE route_stops ADD COLUMN on_the_way_at  INTEGER;    -- "on the way" text sent
ALTER TABLE route_stops ADD COLUMN arriving_at    INTEGER;    -- "arriving soon" text sent
ALTER TABLE route_stops ADD COLUMN arrived_at     INTEGER;
ALTER TABLE route_stops ADD COLUMN delivered_at   INTEGER;
-- (route_stops.eta_at already exists from an earlier migration — reused for the live ETA)

-- Routes: live driver location (foreground GPS) + which stop is active.
ALTER TABLE routes ADD COLUMN driver_lat     REAL;
ALTER TABLE routes ADD COLUMN driver_lng     REAL;
ALTER TABLE routes ADD COLUMN driver_loc_at  INTEGER;
ALTER TABLE routes ADD COLUMN current_seq    INTEGER DEFAULT 0;

-- Deliveries: proof_photo / fail_reason / geo already exist (0003). Add skip flag + a
-- per-delivery public token (unguessable) for the proof-photo URL and feedback page.
ALTER TABLE deliveries ADD COLUMN proof_skipped INTEGER DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN public_token  TEXT;
CREATE INDEX IF NOT EXISTS idx_deliveries_token ON deliveries(public_token);

-- Driver availability ("available for more orders" toggle).
ALTER TABLE staff ADD COLUMN available    INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN available_at INTEGER;

-- Smart post-delivery feedback (rating routes to Google review vs internal).
CREATE TABLE IF NOT EXISTS delivery_feedback (
  id            TEXT PRIMARY KEY,
  order_id      TEXT REFERENCES orders(id),
  delivery_id   TEXT REFERENCES deliveries(id),
  client_email  TEXT,
  rating        INTEGER,                 -- 1..5
  comment       TEXT,
  routed_to     TEXT,                    -- google | internal
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_order ON delivery_feedback(order_id);
