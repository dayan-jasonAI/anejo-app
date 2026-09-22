-- 0126 — HOW LONG IT ACTUALLY TAKES TO COOK IT.
--
-- Caught on 2026-09-22 building the first event plan against the live 9/26 booking: the schedule
-- put congrí for 30 at fifteen minutes. menu_items.prep_minutes is a PLATING time — three minutes
-- to assemble one bowl of congrí on the line, four for the yuca — and reading it as a batch cook
-- time is simply wrong. Nowhere in the HUB was there a number for how long a dish takes to cook in
-- quantity, because nobody had ever been asked to write one down.
--
-- Rather than guess harder, the kitchen supplies it. The cook sets the real time on the event's own
-- plan, that time drives that event's schedule, and it is also remembered here as the starting
-- point for the next event with the same dish. The HUB learns the kitchen's own numbers instead of
-- inventing its own.
--
-- Additive only.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0126_cook_minutes.sql

-- Batch cook time for roughly 25 portions, as the kitchen measured it. NOT prep_minutes, which is
-- the seconds-per-plate figure the line uses to time an order.
ALTER TABLE menu_items ADD COLUMN cook_minutes INTEGER;

-- This one event's override, when this event is not like the last one.
ALTER TABLE event_tasks ADD COLUMN minutes INTEGER;
