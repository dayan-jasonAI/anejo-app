-- Añejo HUB — Pricing Config v1 (F3).
--
-- The quote engine (functions/_lib/quote.js) REFUSES to quote without real cost inputs. This
-- table is where those inputs live so Dayan can change them from the Hub instead of a code
-- deploy — his requirement 2026-07-20: "If anything changes in the future i should be able to
-- modify it through the Anejo CRM/HUB."
--
-- PROVENANCE IS A COLUMN, NOT A COMMENT. Each figure records where it came from, because the
-- difference between "Dayan weighed the ingredients" and "Claude used an illustrative
-- placeholder Dayan then accepted" must survive in the data. A future session pricing a real
-- event needs to know which numbers are measured and which are provisional — otherwise an
-- invented figure quietly becomes a quoted price.
--
-- Single-row table (id=1). Apply:
--   wrangler d1 execute anejo --remote --file=migrations/0041_pricing_config.sql

CREATE TABLE IF NOT EXISTS pricing_config (
  id                     INTEGER PRIMARY KEY CHECK (id = 1),
  food_cost_per_head     REAL,     -- dollars, supplier cost of what ONE guest eats
  labor_rate_per_hour    REAL,     -- dollars per staff member per hour
  hours_per_event        REAL,     -- prep + travel + service + breakdown
  guests_per_staff       REAL,     -- 25-30 is a common catering start
  packaging_per_head     REAL,     -- container + lid + sauce cup + label
  overhead_per_event     REAL,     -- equipment wear + kitchen share + admin time
  target_food_cost_pct   REAL,     -- fraction: 0.30 = 30%
  target_net_margin      REAL,     -- fraction: 0.25 = 25%
  deposit_pct            REAL,     -- fraction: 0.50 = 50%
  mileage_rate           REAL,     -- dollars/mile; NULL = travel not charged
  provenance_json        TEXT,     -- {field: "measured" | "provisional"} — see note above
  updated_at             INTEGER NOT NULL,
  updated_by             TEXT
);

-- Seed with the figures Dayan approved 2026-07-20 ("those numbers are good for now").
-- food_cost_per_head is HIS worked example ($6.20 COCO bowl). The rest were illustrative
-- placeholders Claude used to demonstrate the engine, which Dayan then accepted as a working
-- starting point. That distinction is recorded in provenance_json and must not be lost.
INSERT OR IGNORE INTO pricing_config
  (id, food_cost_per_head, labor_rate_per_hour, hours_per_event, guests_per_staff,
   packaging_per_head, overhead_per_event, target_food_cost_pct, target_net_margin,
   deposit_pct, mileage_rate, provenance_json, updated_at, updated_by)
VALUES
  (1, 6.20, 22.0, 6.0, 25.0, 1.10, 180.0, 0.30, 0.25, 0.50, NULL,
   '{"food_cost_per_head":"measured — Dayan''s worked COCO-bowl example","labor_rate_per_hour":"provisional","hours_per_event":"provisional","guests_per_staff":"provisional — industry 25-30","packaging_per_head":"provisional","overhead_per_event":"provisional","target_food_cost_pct":"measured — Dayan''s stated 30-32% premium target","target_net_margin":"provisional — catering norm 20-30%","deposit_pct":"provisional"}',
   0, 'seed 2026-07-20 (Dayan approved as working starting point)');
