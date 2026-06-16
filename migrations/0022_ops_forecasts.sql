-- Añejo HUB — Phase 4a: "Añejo Ops" demand forecast + production plan. The agent forecasts
-- demand (known subscriptions + predicted on-demand) and converts it into a kitchen prep
-- sheet. Numbers are DETERMINISTIC (trustworthy + explainable); Claude only adds narrative.
-- forecast_accuracy stores predicted-vs-actual so trust is earned with evidence (Phase 4c).
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0022_ops_forecasts.sql

CREATE TABLE IF NOT EXISTS forecasts (
  id                 TEXT PRIMARY KEY,
  forecast_date      TEXT NOT NULL,        -- the date being forecast (YYYY-MM-DD)
  horizon            TEXT NOT NULL,        -- next_day | week
  total_bowls        INTEGER,
  subscription_bowls INTEGER,              -- known/deterministic component
  ondemand_bowls     INTEGER,              -- predicted component
  lunch_bowls        INTEGER,
  dinner_bowls       INTEGER,
  bowl_mix           TEXT,                 -- JSON { BOWL: count }
  confidence         REAL,                 -- 0..1
  drivers            TEXT,                 -- JSON/text: what's driving the forecast
  generated_at       INTEGER NOT NULL,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forecasts_date ON forecasts(forecast_date, horizon);

CREATE TABLE IF NOT EXISTS prep_plans (
  id            TEXT PRIMARY KEY,
  plan_date     TEXT NOT NULL,             -- the production day (YYYY-MM-DD)
  horizon       TEXT NOT NULL,             -- next_day | week
  forecast_id   TEXT,
  bowl_counts   TEXT,                      -- JSON { BOWL: count } the kitchen should prep
  total_bowls   INTEGER,
  buffer_pct    INTEGER DEFAULT 0,         -- safety buffer applied to the on-demand component
  notes         TEXT,
  generated_at  INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prep_plans_date ON prep_plans(plan_date, horizon);

CREATE TABLE IF NOT EXISTS forecast_accuracy (
  id              TEXT PRIMARY KEY,
  forecast_date   TEXT NOT NULL,
  predicted_total INTEGER,
  actual_total    INTEGER,
  abs_error       INTEGER,
  pct_error       REAL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forecast_accuracy_date ON forecast_accuracy(forecast_date);
