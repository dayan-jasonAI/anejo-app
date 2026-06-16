-- Añejo — per-delivery ADD-ON upsell. Morning of each subscription delivery day, the
-- client is invited (SMS + email + in-app) to add a drink, protein shake, or an extra
-- bowl for a friend → Square checkout (paid now) → the paid add-on attaches to that day's
-- order so the kitchen + driver see it. Additive only. Gated by env ADDONS_ENABLED until
-- prices/copy are confirmed. Apply: wrangler d1 execute anejo --remote --file=migrations/0017_order_addons.sql

ALTER TABLE orders ADD COLUMN addon_token TEXT;         -- public token for the add-on page (per delivery order)
ALTER TABLE orders ADD COLUMN addon_offered_at INTEGER; -- when the morning add-on invite was sent (idempotency)
CREATE INDEX IF NOT EXISTS idx_orders_addon_token ON orders(addon_token);

CREATE TABLE IF NOT EXISTS order_addons (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL,            -- the delivery order this add-on attaches to
  subscription_id TEXT,
  client_id       TEXT,
  delivery_date   TEXT,
  delivery_window TEXT,
  kind            TEXT,                     -- drink|shake|bowl|other
  name            TEXT,
  qty             INTEGER DEFAULT 1,
  amount_cents    INTEGER NOT NULL,         -- unit price * qty
  status          TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment|paid|canceled
  square_order_id TEXT,                     -- Square order id from the payment link (webhook matches this)
  payment_link_url TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  paid_at         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_order_addons_order ON order_addons(order_id);
CREATE INDEX IF NOT EXISTS idx_order_addons_sqorder ON order_addons(square_order_id);
