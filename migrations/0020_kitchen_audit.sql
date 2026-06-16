-- Añejo HUB — Phase 2: kitchen PIN audit trail. Every PIN-gated kitchen action (bowl
-- check-off, Mark Ready, and the Phase-3 driver confirm) records WHO (the PIN-matched staff)
-- did WHAT, to which order/bowl, and WHEN. staff_name is snapshotted for a stable log.
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0020_kitchen_audit.sql

CREATE TABLE IF NOT EXISTS kitchen_audit (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,          -- bowl_checked | bowl_unchecked | mark_ready | driver_confirm
  order_id    TEXT,
  bowl_id     TEXT,
  staff_id    TEXT,                   -- the PIN-matched staff member
  staff_name  TEXT,                   -- snapshot for display even if the staff row changes later
  via_pin     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kitchen_audit_order ON kitchen_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_audit_staff ON kitchen_audit(staff_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_audit_created ON kitchen_audit(created_at);
