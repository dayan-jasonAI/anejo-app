-- Añejo Sales OS — the LEFT-HAND side of the customer lifecycle. Additive only.
--
-- WHY THIS EXISTS. Everything from "a business is our customer" onward was already built:
-- contract_accounts → contract_sites → daily headcount → kitchen → route → invoice. What did not
-- exist was the path INTO that: a business Añejo has never heard of becoming a qualified prospect,
-- being contacted, replying, receiving a proposal, and turning into a contract account. That path
-- was Dayan searching and door-knocking. These tables are the system of record for it.
--
-- A SEPARATE DOMAIN ON PURPOSE. Cold prospects are NOT customers and must never appear in the
-- warm/consented audiences _lib/audience.js resolves for Broadcast (leads, clients, subscribers,
-- the launch list). Putting a prospect into `leads` so campaigns.js could reach them would quietly
-- turn a cold B2B note into "marketing to people who asked to hear from us", which they did not.
--
-- NO CHECK CONSTRAINTS. Status vocabularies are validated in code (functions/_lib/sales/*.js).
-- Widening a CHECK on D1 means rebuilding the table, and a rebuild under live foreign keys is
-- exactly what failed on a sibling D1 on 2026-09-09. A new stage should be a code change.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0103_sales_os.sql
--        (NOT applied to production — requires Dayan's explicit deployment approval.)

-- ---- Organizations: one row per real-world location we might serve ---------------------------
CREATE TABLE IF NOT EXISTS sales_organizations (
  id                        TEXT PRIMARY KEY,          -- sorg_*
  name                      TEXT NOT NULL,
  normalized_name           TEXT NOT NULL,             -- lowercase, no punctuation/LLC — for dedupe
  dedupe_key                TEXT NOT NULL,             -- see _lib/sales/normalize.js dedupeKey()
  website                   TEXT,
  domain                    TEXT,                      -- the org's OWN domain; never facebook.com etc.
  phone                     TEXT,
  street                    TEXT, city TEXT, state TEXT, zip TEXT, county TEXT,
  lat                       REAL, lng REAL,
  business_category         TEXT,                      -- ICP category key (owner can override)
  category_locked           INTEGER NOT NULL DEFAULT 0,-- 1 = owner set the category; enrichment leaves it
  source                    TEXT NOT NULL,             -- google_places | csv | manual
  source_external_id        TEXT,                      -- e.g. Google place_id
  provider_status           TEXT,                      -- provider's business status (OPERATIONAL, CLOSED_PERMANENTLY…)
  status                    TEXT NOT NULL DEFAULT 'discovered',
                            -- discovered | researching | qualified | disqualified | active_opportunity | converted | suppressed
  employee_or_capacity_hint TEXT,                      -- only when legitimately sourced (site text / owner)
  notes                     TEXT,
  do_not_contact            INTEGER NOT NULL DEFAULT 0,
  current_score             INTEGER,                   -- denormalised from the latest sales_scores row
  current_tier              TEXT,                      -- A | B | C | D
  last_scored_at            INTEGER,
  last_enriched_at          INTEGER,
  enrich_attempts           INTEGER NOT NULL DEFAULT 0,
  enrich_error              TEXT,
  created_by                TEXT,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_org_dedupe   ON sales_organizations (dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_org_external ON sales_organizations (source, source_external_id)
  WHERE source_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_org_domain  ON sales_organizations (domain);
CREATE INDEX IF NOT EXISTS idx_sales_org_name    ON sales_organizations (normalized_name);
CREATE INDEX IF NOT EXISTS idx_sales_org_status  ON sales_organizations (status, current_tier);

-- ---- Contacts: a person or a role address at an organization ---------------------------------
-- Nothing here pretends to be verified that is not. `confidence` and `email_status` say how we
-- know, and `source_url` says where from. An inferred name is an inferred name.
CREATE TABLE IF NOT EXISTS sales_contacts (
  id                      TEXT PRIMARY KEY,            -- scon_*
  organization_id         TEXT NOT NULL,
  dedupe_key              TEXT NOT NULL,               -- <org>|e:<email> | <org>|n:<name> | <org>|p:<phone>
  first_name              TEXT, last_name TEXT, full_name TEXT,
  title                   TEXT,
  email                   TEXT,                        -- lowercased
  phone                   TEXT,
  role_category           TEXT,                        -- administrator | executive_director | operations_director | …
  source                  TEXT NOT NULL,               -- website | csv | manual | provider
  source_url              TEXT,
  confidence              TEXT NOT NULL DEFAULT 'low', -- verified | high | medium | low
  email_status            TEXT NOT NULL DEFAULT 'none',
                          -- none | public_site | owner_provided | owner_verified | provider_verified | self_provided
                          -- | unverified_guess (never sendable) | bounced | invalid
  phone_status            TEXT NOT NULL DEFAULT 'none',-- none | public_site | owner_provided
  marketing_email_allowed INTEGER NOT NULL DEFAULT 0,
  -- SMS and voice are OFF for every cold prospect. A phone number found on a public website is
  -- not consent to text or robocall it (TCPA). These flip only with a stored basis below, and in
  -- this build no SMS or voice send path exists for prospects at all.
  marketing_sms_allowed   INTEGER NOT NULL DEFAULT 0,
  voice_allowed           INTEGER NOT NULL DEFAULT 0,
  sms_basis               TEXT,                        -- who recorded consent, when, how (JSON)
  voice_basis             TEXT,
  suppressed              INTEGER NOT NULL DEFAULT 0,
  is_primary              INTEGER NOT NULL DEFAULT 0,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_contact_dedupe ON sales_contacts (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_sales_contact_org   ON sales_contacts (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_contact_email ON sales_contacts (email);

-- ---- Evidence: IMMUTABLE. Rows are only ever inserted. -----------------------------------------
-- The answer to "why do we think this?" six weeks from now. Payloads are bounded and sanitised in
-- code (captured_json ≤ 8 KB, text only, no markup).
CREATE TABLE IF NOT EXISTS sales_prospect_sources (
  id              TEXT PRIMARY KEY,                    -- ssrc_*
  organization_id TEXT NOT NULL,
  contact_id      TEXT,
  source_type     TEXT NOT NULL,                       -- google_places | website_page | csv_row | manual_entry | robots_block
  source_url      TEXT,
  external_id     TEXT,
  captured_json   TEXT,
  captured_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_src_org ON sales_prospect_sources (organization_id, captured_at);

-- ---- Scores: the reason, not just the number ----------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_scores (
  id              TEXT PRIMARY KEY,                    -- sscr_*
  organization_id TEXT NOT NULL,
  score           INTEGER NOT NULL,                    -- 0-100, deterministic (_lib/sales/scoring.js)
  tier            TEXT NOT NULL,                       -- A | B | C | D
  criteria_json   TEXT NOT NULL,                       -- per-criterion points, max, reasons, evidence
  disqualified_by TEXT,                                -- JSON array of hard disqualifiers, if any
  model_version   TEXT NOT NULL,                       -- scoring model id, e.g. icp-v1
  config_hash     TEXT,                                -- which owner ICP settings produced it
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_scores_org ON sales_scores (organization_id, created_at DESC);

-- ---- AI account briefs (advisory only — never an input to the score) ----------------------------
CREATE TABLE IF NOT EXISTS sales_briefs (
  id              TEXT PRIMARY KEY,                    -- sbrf_*
  organization_id TEXT NOT NULL,
  kind            TEXT NOT NULL,                       -- ai | deterministic (model unavailable)
  brief_json      TEXT NOT NULL,
  sources_json    TEXT,
  flags_json      TEXT,                                -- what post-validation removed or flagged
  model           TEXT,
  created_by      TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_briefs_org ON sales_briefs (organization_id, created_at DESC);

-- ---- Opportunities: a pipeline stage, which is NOT a score -------------------------------------
CREATE TABLE IF NOT EXISTS sales_opportunities (
  id                              TEXT PRIMARY KEY,    -- sopp_*
  organization_id                 TEXT NOT NULL,
  primary_contact_id              TEXT,
  stage                           TEXT NOT NULL DEFAULT 'qualified',
                                  -- qualified | outreach_ready | contacted | engaged | meeting_requested | meeting_booked
                                  -- | tasting | proposal | negotiating | won | lost | nurture
  owner                           TEXT,
  estimated_meals_per_day         INTEGER,
  estimated_days_per_week         INTEGER,
  estimated_monthly_revenue_cents INTEGER,
  probability                     INTEGER,             -- 0-100, owner-set
  next_action                     TEXT,
  next_action_at                  INTEGER,
  loss_reason                     TEXT,
  reply_sentiment                 TEXT,                -- positive | neutral | negative (owner-classified)
  converted_contract_account_id   TEXT,
  landing_token                   TEXT,                -- 128-bit; the personalised page's only credential
  source                          TEXT,                -- copied from the organization for funnel attribution
  tier_at_creation                TEXT,
  stage_changed_at                INTEGER,
  won_at                          INTEGER,
  lost_at                         INTEGER,
  created_by                      TEXT,
  created_at                      INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_opp_landing ON sales_opportunities (landing_token) WHERE landing_token IS NOT NULL;
-- One OPEN opportunity per organization. A second click on "Create opportunity" must find the
-- first, not start a parallel pipeline for the same clinic.
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_opp_open ON sales_opportunities (organization_id)
  WHERE stage NOT IN ('won', 'lost');
CREATE INDEX IF NOT EXISTS idx_sales_opp_stage ON sales_opportunities (stage, updated_at DESC);

-- ---- Sequences ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_sequences (
  id             TEXT PRIMARY KEY,                     -- sseq_*
  name           TEXT NOT NULL,
  channel_policy TEXT NOT NULL DEFAULT 'email_only',   -- v1: email_only
  status         TEXT NOT NULL DEFAULT 'active',       -- active | paused | archived
  objective      TEXT,
  max_steps      INTEGER NOT NULL DEFAULT 4,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_sequence_steps (
  id                      TEXT PRIMARY KEY,            -- sstp_*
  sequence_id             TEXT NOT NULL,
  step_number             INTEGER NOT NULL,            -- 1-based
  delay_hours             INTEGER NOT NULL,            -- after the PREVIOUS step was sent (step 1: 0)
  channel                 TEXT NOT NULL DEFAULT 'email',
  template_type           TEXT NOT NULL,               -- intro | value_proof | menu_pricing | close_loop
  requires_owner_approval INTEGER NOT NULL DEFAULT 1,
  stop_on_reply           INTEGER NOT NULL DEFAULT 1,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_step ON sales_sequence_steps (sequence_id, step_number);

-- Who is in which sequence, and what is due next. UNIQUE so enrolling twice is a no-op.
CREATE TABLE IF NOT EXISTS sales_enrollments (
  id               TEXT PRIMARY KEY,                   -- senr_*
  opportunity_id   TEXT NOT NULL,
  contact_id       TEXT NOT NULL,
  sequence_id      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',     -- active | stopped | completed
  last_step_number INTEGER NOT NULL DEFAULT 0,         -- highest step DRAFTED
  last_sent_at     INTEGER,
  next_step_at     INTEGER,                            -- when the next step may be drafted
  stop_reason      TEXT,                               -- reply | unsubscribe | bounce | complaint | manual | won | lost | do_not_contact | nurture
  stopped_at       INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_enrollment ON sales_enrollments (opportunity_id, sequence_id);
CREATE INDEX IF NOT EXISTS idx_sales_enrollment_due ON sales_enrollments (status, next_step_at);

-- ---- Outreach: EVERY attempted outbound touch, auditable ----------------------------------------
-- body_snapshot is exactly what the owner approved and exactly what is sent. There is no path that
-- re-renders a body between approval and delivery.
CREATE TABLE IF NOT EXISTS sales_outreach (
  id                 TEXT PRIMARY KEY,                 -- sout_*
  opportunity_id     TEXT NOT NULL,
  organization_id    TEXT NOT NULL,
  contact_id         TEXT NOT NULL,
  sequence_id        TEXT,
  step_id            TEXT,
  enrollment_id      TEXT,
  step_number        INTEGER,
  channel            TEXT NOT NULL DEFAULT 'email',
  recipient_email    TEXT,                             -- snapshot at draft/approval time
  subject            TEXT,
  body_snapshot      TEXT,                             -- plain text the owner read and approved
  cta_url            TEXT,
  status             TEXT NOT NULL DEFAULT 'pending_approval',
                     -- pending_approval | approved | sending | sent | failed | rejected | canceled | skipped
  ai_assisted        INTEGER NOT NULL DEFAULT 0,
  edited             INTEGER NOT NULL DEFAULT 0,       -- owner changed the draft before approving
  claims_json        TEXT,                             -- the business facts the draft relies on
  flags_json         TEXT,                             -- governance findings at approval time
  flags_acknowledged INTEGER NOT NULL DEFAULT 0,       -- owner approved despite flags (recorded, never silent)
  provider_id        TEXT,                             -- Resend message id
  unsub_token        TEXT,                             -- 128-bit; the unsubscribe link never carries the address
  approved_by        TEXT,
  approved_at        INTEGER,
  queued_at          INTEGER,
  sent_at            INTEGER,
  delivered_at       INTEGER,
  opened_at          INTEGER,
  clicked_at         INTEGER,
  replied_at         INTEGER,
  bounced_at         INTEGER,
  complained_at      INTEGER,
  failure_reason     TEXT,
  rejected_reason    TEXT,
  snoozed_until      INTEGER,
  created_by         TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_outreach_step ON sales_outreach (enrollment_id, step_number)
  WHERE enrollment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_sales_outreach_unsub ON sales_outreach (unsub_token) WHERE unsub_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_outreach_status   ON sales_outreach (status, approved_at);
CREATE INDEX IF NOT EXISTS idx_sales_outreach_provider ON sales_outreach (provider_id);
CREATE INDEX IF NOT EXISTS idx_sales_outreach_contact  ON sales_outreach (contact_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_sales_outreach_opp      ON sales_outreach (opportunity_id, created_at);

-- ---- Prospect opt-outs: separate from customer campaign_unsubscribes on purpose -----------------
-- Checked IMMEDIATELY before every send, together with campaign_unsubscribes and
-- email_suppressions (a customer who opted out of Añejo marketing is also out of prospecting).
CREATE TABLE IF NOT EXISTS sales_unsubscribes (
  id              TEXT PRIMARY KEY,                    -- suns_*
  email           TEXT,
  phone           TEXT,
  channel         TEXT NOT NULL DEFAULT 'email',       -- email | sms | voice | all
  organization_id TEXT,
  contact_id      TEXT,
  reason          TEXT,
  source          TEXT NOT NULL,                       -- link | one_click | owner | reply | bounce | complaint
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_unsub_email ON sales_unsubscribes (email);
CREATE INDEX IF NOT EXISTS idx_sales_unsub_phone ON sales_unsubscribes (phone);

-- ---- Append-only activity feed for the Sales workspace ------------------------------------------
-- Meaningful rows are ALSO mirrored into the global activity_log through _lib/track.js capture().
CREATE TABLE IF NOT EXISTS sales_activity (
  id              TEXT PRIMARY KEY,                    -- sact_*
  organization_id TEXT,
  opportunity_id  TEXT,
  contact_id      TEXT,
  outreach_id     TEXT,
  kind            TEXT NOT NULL,                       -- discovery | enrichment | score | approval | send | reply | stage_change | proposal | conversion | …
  detail_json     TEXT,
  actor           TEXT,                                -- staff id | 'system' | 'prospect'
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_act_org  ON sales_activity (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_act_opp  ON sales_activity (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_act_kind ON sales_activity (kind, created_at DESC);

-- ---- Proposals: owner-confirmed commercial terms, the ONLY input to conversion ------------------
-- Money is INTEGER CENTS end to end. A proposal whose estimate and whose line items disagree is
-- refused, not reconciled (_lib/sales/convert.js). Once converted, converted_terms_json is the
-- snapshot of exactly what the contract account was created with.
CREATE TABLE IF NOT EXISTS sales_proposals (
  id                      TEXT PRIMARY KEY,            -- sprp_*
  opportunity_id          TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'draft',-- draft | confirmed | converting | converted | void
  account_name            TEXT,
  meal_window             TEXT NOT NULL DEFAULT 'lunch',
  price_per_meal_cents    INTEGER,
  meals_per_day           INTEGER,
  days_per_week           INTEGER,
  delivery_days           TEXT,                        -- 'mon,tue,wed'
  delivery_fee_cents      INTEGER,                     -- per delivery day, per account
  rush_fee_cents          INTEGER,
  cutoff_time             TEXT,                        -- ET HH:MM
  billing_model           TEXT,
  billing_email           TEXT,
  billing_contact         TEXT,
  sites_json              TEXT,                        -- [{name, street, unit, city, state, zip, window_label, contact_name, contact_phone}]
  contacts_json           TEXT,                        -- [{site_index, name, phone}] → contract_site_staff
  start_date              TEXT,
  special_terms           TEXT,
  headcount_workflow      TEXT,
  estimated_monthly_cents INTEGER,
  confirmed_by            TEXT,
  confirmed_at            INTEGER,
  converted_account_id    TEXT,
  converted_terms_json    TEXT,
  converted_at            INTEGER,
  conversion_error        TEXT,
  created_by              TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_proposals_opp ON sales_proposals (opportunity_id, created_at DESC);

-- ---- The default v1 sequence: email-first, four steps, every step owner-approved ----------------
-- Day 0 intro → +3 days value/proof → +4 days (day 7) menu/pricing/tasting → +7 days (day 14)
-- polite close-the-loop. Delays are owner-editable in the Sales settings.
INSERT OR IGNORE INTO sales_sequences (id, name, channel_policy, status, objective, max_steps, created_at, updated_at)
VALUES ('sseq_default_v1', 'Managed Meal Service — email intro', 'email_only', 'active',
        'Earn a reply: a request for a sample weekly menu and pricing, a tasting, or a call.', 4,
        1789000000000, 1789000000000);
INSERT OR IGNORE INTO sales_sequence_steps (id, sequence_id, step_number, delay_hours, channel, template_type, requires_owner_approval, stop_on_reply, created_at)
VALUES ('sstp_default_v1_1', 'sseq_default_v1', 1, 0,   'email', 'intro',        1, 1, 1789000000000),
       ('sstp_default_v1_2', 'sseq_default_v1', 2, 72,  'email', 'value_proof',  1, 1, 1789000000000),
       ('sstp_default_v1_3', 'sseq_default_v1', 3, 96,  'email', 'menu_pricing', 1, 1, 1789000000000),
       ('sstp_default_v1_4', 'sseq_default_v1', 4, 168, 'email', 'close_loop',   1, 1, 1789000000000);
