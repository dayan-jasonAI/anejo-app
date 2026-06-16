-- Añejo HUB — Phase 1: per-bowl kitchen production state. One row per PHYSICAL bowl in an
-- order, materialized from orders.items when the order enters PREP. Each bowl is checked off
-- during prep (PIN-attributed in Phase 2) and re-confirmed by the driver at pickup (Phase 3).
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0019_order_bowls.sql

CREATE TABLE IF NOT EXISTS order_bowls (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  seq           INTEGER NOT NULL,                 -- 1..N physical bowl index within the order
  bowl_name     TEXT,
  customization TEXT,                              -- JSON snapshot: size_oz, size_pct, macros, build,
                                                   --   ingredients, removals, addons, notes, avocado
  prep_state    TEXT NOT NULL DEFAULT 'pending',   -- pending|done
  prep_by       TEXT,                              -- staff id who checked it off (PIN-matched in Phase 2)
  prep_at       INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_bowls_order ON order_bowls(order_id);
-- Makes materialization idempotent (INSERT OR IGNORE on a fixed (order, seq)).
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_bowls_order_seq ON order_bowls(order_id, seq);
