-- Añejo Trainer SaaS — initial schema (Cloudflare D1 / SQLite)
-- Apply: wrangler d1 execute anejo --file=migrations/0001_init.sql   (see PROVISIONING.md)

CREATE TABLE IF NOT EXISTS trainers (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  gym_name      TEXT,
  gym_city      TEXT,
  affiliate_code TEXT UNIQUE,
  payout_method TEXT,                 -- 'zelle' | 'ach' | 'check'
  payout_details TEXT,                -- JSON
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  email         TEXT,
  name          TEXT NOT NULL,
  age           INTEGER,
  sex           TEXT,                 -- 'male' | 'female'
  height_cm     REAL,
  weight_kg     REAL,
  activity_level TEXT,
  primary_goal  TEXT,
  conditions    TEXT,                 -- JSON array
  allergens     TEXT,                 -- JSON array
  preferences   TEXT,
  lang          TEXT DEFAULT 'en',
  status        TEXT DEFAULT 'pending', -- pending|plan_sent|subscribed|paused|churned
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(trainer_id, email)
);
CREATE INDEX IF NOT EXISTS idx_clients_trainer ON clients(trainer_id);

CREATE TABLE IF NOT EXISTS plans (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL REFERENCES clients(id),
  version       INTEGER NOT NULL DEFAULT 1,
  daily_calories  INTEGER,
  daily_protein_g INTEGER,
  daily_carbs_g   INTEGER,
  daily_fat_g     INTEGER,
  daily_fiber_g   INTEGER,
  weekly_bowl_count INTEGER,
  meal_plan_tier  TEXT,               -- plan_5|plan_10|plan_12
  bowl_rotation   TEXT,               -- JSON
  rationale       TEXT,
  lifestyle_notes TEXT,               -- JSON array
  ai_model        TEXT,
  trainer_edited  INTEGER DEFAULT 0,
  trainer_notes   TEXT,
  status          TEXT DEFAULT 'draft', -- draft|sent|accepted|declined
  public_token    TEXT UNIQUE,        -- random token for the client view link
  sent_at         INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_client ON plans(client_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL REFERENCES clients(id),
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  plan_id       TEXT REFERENCES plans(id),
  provider      TEXT DEFAULT 'square', -- square
  provider_subscription_id TEXT UNIQUE,
  provider_customer_id     TEXT,
  status        TEXT,                 -- active|past_due|canceled|paused
  weekly_amount_cents INTEGER,
  trainer_share_pct   INTEGER DEFAULT 10,
  started_at    INTEGER,
  canceled_at   INTEGER,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_trainer ON subscriptions(trainer_id);

-- Trainer rev-share ledger: one row per paid invoice
CREATE TABLE IF NOT EXISTS rev_share_events (
  id            TEXT PRIMARY KEY,
  trainer_id    TEXT NOT NULL REFERENCES trainers(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  amount_cents  INTEGER NOT NULL,     -- gross invoice amount
  share_cents   INTEGER NOT NULL,     -- trainer's 10%
  occurred_at   INTEGER NOT NULL,
  payout_status TEXT DEFAULT 'pending' -- pending|paid
);
CREATE INDEX IF NOT EXISTS idx_revshare_trainer ON rev_share_events(trainer_id);

CREATE TABLE IF NOT EXISTS meal_logs (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id),
  date        TEXT NOT NULL,          -- YYYY-MM-DD
  bowl_name   TEXT,
  consumed    INTEGER NOT NULL,
  note        TEXT,
  logged_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meallogs_client ON meal_logs(client_id);

CREATE TABLE IF NOT EXISTS weight_logs (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id),
  date        TEXT NOT NULL,
  weight_kg   REAL NOT NULL,
  note        TEXT,
  logged_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weightlogs_client ON weight_logs(client_id);

-- Inbound leads from the tasting / wholesale forms.
CREATE TABLE IF NOT EXISTS leads (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,          -- 'tasting' | 'wholesale'
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  company     TEXT,
  interest    TEXT,
  message     TEXT,
  source_lang TEXT DEFAULT 'en',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- Magic-link tokens (short-lived). Sessions live in KV, not here.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token       TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL,
  user_type   TEXT NOT NULL,          -- trainer|client
  expires_at  INTEGER NOT NULL,
  used_at     INTEGER
);
