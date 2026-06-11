-- Añejo HUB — Phase 4 tables: driver scheduling, inventory/par levels, web-push subscriptions.
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0009_phase4.sql

-- Driver shift scheduling (owner assigns shifts in advance; drivers only for now).
CREATE TABLE IF NOT EXISTS shift_schedule (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT NOT NULL REFERENCES staff(id),
  shift_date  TEXT NOT NULL,                 -- YYYY-MM-DD
  start_at    INTEGER,                        -- unix ms scheduled start
  end_at      INTEGER,                        -- unix ms scheduled end
  label       TEXT,                           -- e.g. 'Lunch route', 'Dinner route'
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'scheduled', -- scheduled|canceled
  created_by  TEXT REFERENCES staff(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_staff_date ON shift_schedule(staff_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_sched_date ON shift_schedule(shift_date);

-- Kitchen inventory with par levels (feeds real low_stock alerts + AI restock suggestions).
CREATE TABLE IF NOT EXISTS inventory_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT,                           -- lb|ea|case|gal|...
  on_hand     REAL DEFAULT 0,
  par_level   REAL DEFAULT 0,
  vendor_id   TEXT REFERENCES staff(id),
  active      INTEGER NOT NULL DEFAULT 1,
  updated_by  TEXT REFERENCES staff(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_active ON inventory_items(active);

-- Web-push subscriptions (per device/staff). VAPID send happens server-side.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  staff_id    TEXT REFERENCES staff(id),
  role        TEXT,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT,
  auth        TEXT,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL,
  last_seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_push_staff ON push_subscriptions(staff_id);
