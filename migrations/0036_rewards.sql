-- Añejo Rewards (Phase 1): email-keyed points ledger.
-- Balance = SUM(delta) per email. Earns are tied to an order; tiers are DERIVED from
-- lifetime spend at read time (no stored tier), so thresholds/multipliers stay tunable.
CREATE TABLE IF NOT EXISTS points_ledger (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,          -- lowercased customer email (the CRM's unifying key)
  client_id  TEXT,                   -- optional FK to clients.id (null for guest buyers)
  delta      INTEGER NOT NULL,       -- +earn / -redeem / +/-adjust
  reason     TEXT NOT NULL,          -- 'earn' | 'redeem' | 'adjust'
  order_id   TEXT,                   -- source order for earns
  note       TEXT,                   -- e.g. "Legend x1.5"
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_points_email ON points_ledger(email);
-- Idempotency: at most one earn row per order, so duplicate Square webhook deliveries are no-ops.
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_earn_order ON points_ledger(order_id, reason) WHERE order_id IS NOT NULL;
