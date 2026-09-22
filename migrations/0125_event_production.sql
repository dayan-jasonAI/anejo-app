-- 0125 — EVENT PRODUCTION. What the kitchen needs to know about an event the HUB already sold.
--
-- Found on 2026-09-22, with a paid 30-guest event four days out: the HUB held the money and the
-- menu (catering_quotes: deposit paid, balance due, seven lines, terms) and the KITCHEN could not
-- see the event at all. Its catering screen lists website design requests; a booked, paid event
-- appeared on no kitchen surface. The plan that turns a quote into work — what to buy, what to
-- pack it in, what time to start, who is driving it — lived in the owner's head.
--
-- Two gaps are fixed here.
--
-- 1. THE QUOTE DOES NOT KNOW WHEN OR WHERE. catering_quotes carries the date, the guests and the
--    money, but not the serving time, the address, or the theme the customer asked for. On the
--    live 9/26 booking all three are null, and the only copy of "42nd birthday, white theme, white
--    flowers, 33461, 7:00 p.m." sits in the message of the design request it was quoted from.
--    A caterer cannot schedule backwards from a time it does not have, so the time, the address
--    and the theme become columns of the event itself, and source_lead_id records which brief they
--    came from instead of leaving them to be retyped from memory.
--
-- 2. NOTHING RECORDS WHAT WAS DONE. The plan itself is derived from the quote every time it is
--    opened — change the guest count and the whole plan changes, with no stale copy left behind.
--    So the only thing worth storing is what a human actually DID: this pan is cooked, this
--    shopping is bought, the van is loaded. That is event_tasks, keyed by the derived task's key.
--
-- Additive only; nothing existing is rewritten.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0125_event_production.sql

ALTER TABLE catering_quotes ADD COLUMN serving_time   TEXT;  -- HH:MM, the hour the food must be ON the table
ALTER TABLE catering_quotes ADD COLUMN address        TEXT;  -- where the van goes
ALTER TABLE catering_quotes ADD COLUMN theme          TEXT;  -- "42nd birthday — white theme, white flowers"
ALTER TABLE catering_quotes ADD COLUMN colors         TEXT;  -- "white and beige"
ALTER TABLE catering_quotes ADD COLUMN dietary_notes  TEXT;  -- allergies and restrictions, verbatim from the customer
ALTER TABLE catering_quotes ADD COLUMN source_lead_id TEXT;  -- the design request this event was quoted from

CREATE TABLE IF NOT EXISTS event_tasks (
  id         TEXT PRIMARY KEY,
  quote_id   TEXT NOT NULL REFERENCES catering_quotes(id),
  task_key   TEXT NOT NULL,     -- the derived task's stable key: 'shop', 'pack', 'cook:l0', ...
  done_at    INTEGER,
  done_by    TEXT,              -- who ticked it
  note       TEXT,              -- "bought at Restaurant Depot, pork was $2.19/lb"
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_tasks_key ON event_tasks(quote_id, task_key);
