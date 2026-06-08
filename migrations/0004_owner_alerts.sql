-- Añejo HUB — Owner Command Center alerts (Cloudflare D1 / SQLite)
-- Apply: wrangler d1 execute anejo --file=migrations/0004_owner_alerts.sql
-- Style matches 0003_hub.sql: TEXT PRIMARY KEY ids, INTEGER unix-ms timestamps, JSON-as-TEXT.
-- Alerts are mostly system-generated (automations + other surfaces) and surfaced to the owner.
-- The tracking-plan events alert.triggered / alert.acknowledged are mirrored here.

CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  alert_type    TEXT NOT NULL,             -- eod_missing|temp_excursion|delivery_failed|late_clock_in|expense_pending|low_stock|negative_sentiment
  severity      TEXT NOT NULL DEFAULT 'warning', -- info|warning|critical
  title         TEXT,
  body          TEXT,
  team          TEXT,                       -- kitchen|delivery|front_office|vendors|null
  ref_type      TEXT,                       -- delivery|shift|expense|temp_log|restock_order|eod_report|ticket|null
  ref_id        TEXT,
  source        TEXT NOT NULL DEFAULT 'system', -- system|automation|surface
  dedupe_key    TEXT,                       -- optional key to avoid duplicate open alerts
  status        TEXT NOT NULL DEFAULT 'open',    -- open|acknowledged
  acknowledged_by TEXT REFERENCES staff(id),
  acknowledged_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
-- Open alerts should be unique per dedupe_key so automations can re-run idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_dedupe_open
  ON alerts(dedupe_key) WHERE status = 'open' AND dedupe_key IS NOT NULL;
