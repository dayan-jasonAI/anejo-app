-- 0113 — MEASURED prep time. Every number the kitchen clock uses today is an estimate the owner
-- typed in once; nothing has ever been timed.
--
-- Dayan, 2026-09-16: "We track how long the kitchen takes by prompting them or asking them how
-- long does it take you or what process are you going to start — ask the kitchen staff to record
-- these processes and over time we just adjust."
--
-- So this table holds what the kitchen ACTUALLY did, beside the estimate that was showing at the
-- time. Nothing here ever writes menu_items.prep_minutes: the owner reads the measurement and
-- adopts it with a tap, or does not. An estimate that moves on its own is an estimate nobody can
-- trust, and the whole point is that he trusts these numbers.
--
-- Two ways a row gets here:
--   kind='order'  free. Marking an order ready records the real prep→ready duration, the items and
--                 quantities, and the estimate the board was showing. No extra tap for the cook.
--                 Recorded only when the start is KNOWN (orders.prep_started_at, or the prep_start
--                 row in kitchen_audit). No known start, no row — a made-up duration is worse than
--                 a missing one, and this table's whole value is that it is real.
--   kind='batch'  prompted. The cook says what they are starting ("60 lb pernil", or a menu item)
--                 and how many, and taps Done. functions/api/hub/kitchen/task.js.
--
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0113_prep_actuals.sql

CREATE TABLE IF NOT EXISTS prep_actuals (
  id               TEXT PRIMARY KEY,
  kind             TEXT NOT NULL,      -- 'order' | 'batch'
  order_id         TEXT,               -- kind='order'
  -- The menu item this measurement is ABOUT, when one item can honestly own it: the item a batch
  -- names, or — for an order — the single distinct menu item it is made of. A mixed order leaves
  -- this NULL rather than blaming its minutes on one of its items.
  menu_item_id     TEXT,
  label            TEXT,               -- free-text process for a batch that is not a menu item
  qty              INTEGER,            -- how many. Recorded faithfully everywhere; see below.
  started_at       INTEGER NOT NULL,
  -- NULL while a batch timer is still running. The running task IS the row, so closing it out —
  -- on Done, on clocking out, or when the cook starts something else — only stamps an ending.
  -- Nothing can be lost between a "running tasks" table and this one, because there is only one.
  ended_at         INTEGER,
  minutes          INTEGER,            -- whole minutes, ended_at - started_at. NULL while running.
  estimate_minutes INTEGER,            -- what the system predicted at the time. NULL if it had none.
  items            TEXT,               -- kind='order': JSON [{id, name, qty}]
  staff_id         TEXT,
  staff_name       TEXT,               -- snapshot, so the log reads right after a staff row changes
  note             TEXT,
  created_at       INTEGER NOT NULL
);

-- The owner's per-item median: "this item, most recent first".
CREATE INDEX IF NOT EXISTS idx_prep_actuals_item ON prep_actuals(menu_item_id, ended_at);
CREATE INDEX IF NOT EXISTS idx_prep_actuals_order ON prep_actuals(order_id);
-- One running batch per cook, enforced by the database rather than by whoever writes the next
-- endpoint. A second Start closes the first honestly; it cannot leave two clocks running.
CREATE UNIQUE INDEX IF NOT EXISTS idx_prep_actuals_open_batch
  ON prep_actuals(staff_id) WHERE kind = 'batch' AND ended_at IS NULL;
-- The batch log and the "measured vs estimate" table read the finished rows in time order.
CREATE INDEX IF NOT EXISTS idx_prep_actuals_ended ON prep_actuals(ended_at);
