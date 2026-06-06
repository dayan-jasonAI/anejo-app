-- Añejo — à-la-carte order log (so the kitchen can see/fulfill orders; Square remains payment source of truth).
CREATE TABLE IF NOT EXISTS orders (
  id                   TEXT PRIMARY KEY,
  square_order_id      TEXT,
  payment_link_id      TEXT,
  items                TEXT,            -- JSON [{id,name,qty,price_cents}]
  delivery_date        TEXT,            -- YYYY-MM-DD
  delivery_window      TEXT,            -- 'lunch' | 'dinner'
  subtotal_cents       INTEGER,
  fee_cents            INTEGER DEFAULT 0,
  tax_pct              REAL,
  total_estimate_cents INTEGER,
  status               TEXT DEFAULT 'pending',  -- pending | paid | fulfilled | canceled
  customer_name        TEXT,
  customer_email       TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_sqid ON orders(square_order_id);
