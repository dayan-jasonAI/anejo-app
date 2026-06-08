-- Añejo HUB — internal operations schema (Cloudflare D1 / SQLite)
-- Apply: wrangler d1 execute anejo --file=migrations/0003_hub.sql   (see PROVISIONING.md)
-- Style matches 0001_init.sql: TEXT PRIMARY KEY ids, INTEGER unix-ms timestamps,
-- JSON stored as TEXT, FKs to existing tables (orders, clients, trainers) where the model calls for it.

-- ============================================================
-- People & workforce
-- ============================================================

-- Staff (kitchen/driver/owner) — a NEW user_type alongside trainer/client.
-- Magic-link auth + KV sessions are reused; this row is the staff profile.
CREATE TABLE IF NOT EXISTS staff (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  phone           TEXT,
  role            TEXT NOT NULL,          -- owner|kitchen|driver|vendor
  team            TEXT,                   -- kitchen|delivery|training|front_office|vendors
  employment_type TEXT,                   -- w2|contractor|external
  pay_rate_cents  INTEGER,
  lang            TEXT DEFAULT 'en',
  active          INTEGER NOT NULL DEFAULT 1,
  invited_at      INTEGER,
  activated_at    INTEGER,
  last_active_at  INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_team ON staff(team);

-- Shifts: clock in/out, breaks, geo, computed minutes.
CREATE TABLE IF NOT EXISTS shifts (
  id             TEXT PRIMARY KEY,
  staff_id       TEXT NOT NULL REFERENCES staff(id),
  team           TEXT,
  clock_in_at    INTEGER NOT NULL,
  clock_out_at   INTEGER,
  clock_in_geo   TEXT,                    -- JSON {lat,lng,acc}
  clock_out_geo  TEXT,                    -- JSON {lat,lng,acc}
  geo_captured   INTEGER DEFAULT 0,
  scheduled      INTEGER DEFAULT 0,
  minutes_late   INTEGER,
  break_minutes  INTEGER DEFAULT 0,
  breaks         TEXT,                    -- JSON [{start,stop,minutes}]
  total_minutes  INTEGER,
  status         TEXT DEFAULT 'open',     -- open|closed
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shifts_staff ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);

-- ============================================================
-- Delivery / driver
-- ============================================================

-- Routes assigned to a driver (often AI-optimized).
CREATE TABLE IF NOT EXISTS routes (
  id              TEXT PRIMARY KEY,
  driver_id       TEXT REFERENCES staff(id),
  route_date      TEXT,                   -- YYYY-MM-DD
  stop_count      INTEGER DEFAULT 0,
  ai_optimized    INTEGER DEFAULT 0,
  total_miles_est REAL,
  status          TEXT DEFAULT 'assigned', -- assigned|started|completed|canceled
  started_at      INTEGER,
  completed_at    INTEGER,
  stops_completed INTEGER DEFAULT 0,
  stops_failed    INTEGER DEFAULT 0,
  total_minutes   INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routes_driver ON routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_routes_date ON routes(route_date);

-- A stop on a route; usually maps to an order/delivery.
CREATE TABLE IF NOT EXISTS route_stops (
  id           TEXT PRIMARY KEY,
  route_id     TEXT NOT NULL REFERENCES routes(id),
  order_id     TEXT REFERENCES orders(id),
  seq          INTEGER DEFAULT 0,
  label        TEXT,                      -- customer label, never a public street address in code
  geo          TEXT,                      -- JSON {lat,lng}
  status       TEXT DEFAULT 'pending',    -- pending|arrived|done|failed
  eta_at       INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routestops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_routestops_order ON route_stops(order_id);

-- A single delivery drop-off, linked to an order.
CREATE TABLE IF NOT EXISTS deliveries (
  id             TEXT PRIMARY KEY,
  order_id       TEXT REFERENCES orders(id),
  route_id       TEXT REFERENCES routes(id),
  driver_id      TEXT REFERENCES staff(id),
  status         TEXT DEFAULT 'pending',  -- pending|completed|failed
  proof_photo    TEXT,                    -- asset key/url
  signature      TEXT,                    -- asset key/data
  fail_reason    TEXT,                    -- no_answer|wrong_address|refused|damaged|other
  on_time        INTEGER,
  geo            TEXT,                    -- JSON {lat,lng}
  completed_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);

-- ============================================================
-- Checklists & temperature (cold-chain) compliance
-- ============================================================

-- Checklist templates (delivery, kitchen procedure, opening/closing).
CREATE TABLE IF NOT EXISTS checklists (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  checklist_type TEXT NOT NULL,           -- opening|closing|prep|sanitation|procedure|vehicle|loadout|dropoff
  team           TEXT,                    -- kitchen|delivery
  items          TEXT,                    -- JSON [{key,label,requires_photo,requires_temp}]
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklists_type ON checklists(checklist_type);

-- A run of a checklist by a staff member.
CREATE TABLE IF NOT EXISTS checklist_runs (
  id             TEXT PRIMARY KEY,
  checklist_id   TEXT NOT NULL REFERENCES checklists(id),
  staff_id       TEXT REFERENCES staff(id),
  checklist_type TEXT,
  team           TEXT,
  ref_type       TEXT,                    -- delivery|shift|order|null
  ref_id         TEXT,
  items_total    INTEGER DEFAULT 0,
  items_failed   INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'open',     -- open|completed
  completed_at   INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklistruns_staff ON checklist_runs(staff_id);
CREATE INDEX IF NOT EXISTS idx_checklistruns_checklist ON checklist_runs(checklist_id);

-- Individual item results within a run.
CREATE TABLE IF NOT EXISTS checklist_items (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES checklist_runs(id),
  item_key     TEXT,
  label        TEXT,
  checked      INTEGER DEFAULT 0,
  passed       INTEGER DEFAULT 1,
  note         TEXT,
  photo        TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklistitems_run ON checklist_items(run_id);

-- Temperature logs (cold-chain).
CREATE TABLE IF NOT EXISTS temp_logs (
  id             TEXT PRIMARY KEY,
  staff_id       TEXT REFERENCES staff(id),
  ref_type       TEXT,                    -- delivery|order|shift|equipment
  ref_id         TEXT,
  item           TEXT,
  temp_f         REAL NOT NULL,
  threshold_min  REAL,
  threshold_max  REAL,
  in_range       INTEGER NOT NULL,
  context        TEXT,                    -- loadout|transit|dropoff|kitchen
  photo          TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_templogs_ref ON temp_logs(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_templogs_created ON temp_logs(created_at);

-- ============================================================
-- Tickets / issues
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
  id           TEXT PRIMARY KEY,
  ticket_type  TEXT NOT NULL,             -- complaint|equipment|safety|scheduling|other
  severity     TEXT NOT NULL DEFAULT 'low', -- low|medium|high|urgent
  status       TEXT NOT NULL DEFAULT 'open', -- open|in_progress|resolved|closed
  title        TEXT,
  body         TEXT,
  created_by   TEXT REFERENCES staff(id),
  assignee_id  TEXT REFERENCES staff(id),
  order_id     TEXT REFERENCES orders(id),
  client_id    TEXT REFERENCES clients(id),
  ai_triaged   INTEGER DEFAULT 0,
  resolution   TEXT,
  resolved_at  INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);

-- ============================================================
-- Expenses & mileage (reimbursements)
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT NOT NULL REFERENCES staff(id),
  expense_type  TEXT NOT NULL,            -- fuel|supplies|maintenance|other
  amount_cents  INTEGER NOT NULL,
  receipt_photo TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  reviewed_by   TEXT REFERENCES staff(id),
  reviewed_at   INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_staff ON expenses(staff_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);

CREATE TABLE IF NOT EXISTS mileage (
  id             TEXT PRIMARY KEY,
  staff_id       TEXT NOT NULL REFERENCES staff(id),
  route_id       TEXT REFERENCES routes(id),
  miles          REAL NOT NULL,
  auto_calculated INTEGER DEFAULT 0,
  log_date       TEXT,                    -- YYYY-MM-DD
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mileage_staff ON mileage(staff_id);

-- ============================================================
-- Restocking / purchase orders (kitchen → vendor)
-- ============================================================

CREATE TABLE IF NOT EXISTS restock_orders (
  id            TEXT PRIMARY KEY,
  created_by    TEXT REFERENCES staff(id),
  vendor_id     TEXT REFERENCES staff(id), -- vendors are staff rows with role=vendor
  status        TEXT NOT NULL DEFAULT 'draft', -- draft|submitted|acknowledged|delivered|canceled
  ai_suggested  INTEGER DEFAULT 0,
  line_item_count INTEGER DEFAULT 0,
  total_cents   INTEGER,
  note          TEXT,
  submitted_at  INTEGER,
  acknowledged_at INTEGER,
  delivered_at  INTEGER,
  received_complete INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_restockorders_status ON restock_orders(status);
CREATE INDEX IF NOT EXISTS idx_restockorders_vendor ON restock_orders(vendor_id);

CREATE TABLE IF NOT EXISTS restock_items (
  id              TEXT PRIMARY KEY,
  restock_order_id TEXT NOT NULL REFERENCES restock_orders(id),
  name            TEXT NOT NULL,
  qty             REAL,
  unit            TEXT,
  unit_cost_cents INTEGER,
  received_qty    REAL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_restockitems_order ON restock_items(restock_order_id);

-- ============================================================
-- Reminders (scheduled kitchen/staff nudges)
-- ============================================================

CREATE TABLE IF NOT EXISTS reminders (
  id             TEXT PRIMARY KEY,
  reminder_type  TEXT NOT NULL,           -- prep|sanitation|order_cutoff|temp_check|custom
  title          TEXT,
  body           TEXT,
  team           TEXT,
  target_staff_id TEXT REFERENCES staff(id),
  due_at         INTEGER,
  recurrence     TEXT,                    -- JSON {freq,at} or null
  acknowledged   INTEGER DEFAULT 0,
  acknowledged_by TEXT REFERENCES staff(id),
  acknowledged_at INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_at);

-- ============================================================
-- Docs library (manuals, policies, procedures, recipes index)
-- ============================================================

CREATE TABLE IF NOT EXISTS docs (
  id           TEXT PRIMARY KEY,
  doc_type     TEXT NOT NULL,             -- manual|policy|procedure|recipe
  title        TEXT NOT NULL,
  body         TEXT,                      -- markdown/html
  recipe_id    TEXT REFERENCES recipes(id),
  role_scope   TEXT,                      -- JSON array of roles allowed to view
  version      INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  created_by   TEXT REFERENCES staff(id),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_type ON docs(doc_type);

-- ============================================================
-- Creative Studio (AI recipe generation)
-- ============================================================

CREATE TABLE IF NOT EXISTS recipes (
  id            TEXT PRIMARY KEY,
  session_id    TEXT,                     -- recipe_sessions.id this was finalized from
  name          TEXT NOT NULL,
  summary       TEXT,
  ingredients   TEXT,                     -- JSON array
  steps         TEXT,                     -- JSON array
  nutrition     TEXT,                     -- JSON object
  tags          TEXT,                     -- JSON array
  hero_photo    TEXT,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft|published
  created_by    TEXT REFERENCES staff(id),
  published_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status);

CREATE TABLE IF NOT EXISTS recipe_sessions (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT REFERENCES staff(id),
  mode          TEXT NOT NULL DEFAULT 'mixed', -- voice|text|mixed
  title         TEXT,
  status        TEXT NOT NULL DEFAULT 'active', -- active|finalized|abandoned
  media_count   INTEGER DEFAULT 0,
  ai_assist_count INTEGER DEFAULT 0,
  recipe_id     TEXT REFERENCES recipes(id),
  started_at    INTEGER NOT NULL,
  finalized_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipesessions_staff ON recipe_sessions(staff_id);

-- Live session transcript: voice clips, photos, AI turns, human turns.
CREATE TABLE IF NOT EXISTS recipe_session_events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES recipe_sessions(id),
  kind         TEXT NOT NULL,             -- voice|photo|user_text|ai_text|ai_assist
  assist_type  TEXT,                      -- guidance|research|substitution|scaling|critique
  media_type   TEXT,                      -- voice|photo
  content      TEXT,                      -- text or asset key
  meta         TEXT,                      -- JSON
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rsevents_session ON recipe_session_events(session_id);

-- ============================================================
-- Communications (in-app + Twilio bridge)
-- ============================================================

CREATE TABLE IF NOT EXISTS threads (
  id           TEXT PRIMARY KEY,
  audience     TEXT NOT NULL,             -- kitchen|driver|client|trainer|vendor|broadcast
  subject      TEXT,
  created_by   TEXT,                      -- staff/trainer id (actor)
  client_id    TEXT REFERENCES clients(id),
  trainer_id   TEXT REFERENCES trainers(id),
  last_message_at INTEGER,
  status       TEXT NOT NULL DEFAULT 'open', -- open|closed
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_threads_audience ON threads(audience);
CREATE INDEX IF NOT EXISTS idx_threads_last ON threads(last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL REFERENCES threads(id),
  direction    TEXT NOT NULL DEFAULT 'outbound', -- outbound|inbound
  channel      TEXT NOT NULL DEFAULT 'in_app',   -- in_app|sms|whatsapp
  sender_id    TEXT,
  sender_role  TEXT,
  body         TEXT,
  ai_drafted   INTEGER DEFAULT 0,
  sms_log_id   TEXT REFERENCES sms_log(id),
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);

-- Twilio inbound/outbound bridge. Rows are written even in sandbox (no-op send).
CREATE TABLE IF NOT EXISTS sms_log (
  id           TEXT PRIMARY KEY,
  direction    TEXT NOT NULL,             -- outbound|inbound
  channel      TEXT NOT NULL DEFAULT 'sms', -- sms|whatsapp
  to_number    TEXT,
  from_number  TEXT,
  body         TEXT,
  thread_id    TEXT REFERENCES threads(id),
  status       TEXT NOT NULL DEFAULT 'queued', -- queued|sent|delivered|failed|noop
  provider_sid TEXT,
  error        TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_smslog_thread ON sms_log(thread_id);
CREATE INDEX IF NOT EXISTS idx_smslog_created ON sms_log(created_at);

-- ============================================================
-- End-of-day accountability reports
-- ============================================================

CREATE TABLE IF NOT EXISTS eod_reports (
  id           TEXT PRIMARY KEY,
  staff_id     TEXT NOT NULL REFERENCES staff(id),
  report_date  TEXT NOT NULL,             -- YYYY-MM-DD
  role         TEXT,
  shift_id     TEXT REFERENCES shifts(id),
  summary      TEXT,
  structured   TEXT,                      -- JSON {tasks_done,issues,counts,...}
  has_blockers INTEGER DEFAULT 0,
  blockers     TEXT,
  on_time      INTEGER DEFAULT 1,
  ai_drafted   INTEGER DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'submitted', -- submitted|missed
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(staff_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_eod_staff ON eod_reports(staff_id);
CREATE INDEX IF NOT EXISTS idx_eod_date ON eod_reports(report_date);

-- ============================================================
-- AI automation registry + execution log
-- ============================================================

CREATE TABLE IF NOT EXISTS automations (
  id              TEXT PRIMARY KEY,
  automation_type TEXT NOT NULL,          -- route_optimize|daily_summary|restock_suggest|eod_chase|ticket_triage|sentiment_scan|payroll_prep
  name            TEXT,
  description     TEXT,
  schedule        TEXT,                   -- cron-ish string or trigger name
  config          TEXT,                   -- JSON
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_run_at     INTEGER,
  last_outcome    TEXT,                   -- success|partial|failed
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_automations_type ON automations(automation_type);

CREATE TABLE IF NOT EXISTS agent_runs (
  id            TEXT PRIMARY KEY,
  automation_id TEXT REFERENCES automations(id),
  automation_type TEXT,
  task_type     TEXT,
  outcome       TEXT,                     -- success|partial|failed
  actor_type    TEXT NOT NULL DEFAULT 'system',
  input         TEXT,                     -- JSON
  output        TEXT,                     -- JSON
  duration_ms   INTEGER,
  tokens        INTEGER,
  error         TEXT,
  started_at    INTEGER,
  finished_at   INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agentruns_automation ON agent_runs(automation_id);
CREATE INDEX IF NOT EXISTS idx_agentruns_created ON agent_runs(created_at);

-- ============================================================
-- Activity log — owner command-center live feed
-- Every meaningful action lands here (mirror of tracking events), so the
-- command center has a feed even without PostHog configured.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id           TEXT PRIMARY KEY,
  event        TEXT NOT NULL,             -- matches tracking-plan event name
  actor_id     TEXT,
  actor_role   TEXT,
  actor_type   TEXT NOT NULL DEFAULT 'human', -- human|system
  team         TEXT,
  properties   TEXT,                      -- JSON
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_event ON activity_log(event);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_id);
