-- What a catering customer can ASK for, and what was decided about it.
--
-- Dayan, 2026-09-25: "When she goes into her account, she has to see all of the catering details,
-- the orders, like option to add more ... add more items, add additional counts, request cajita,
-- make changes. Last minute calls always reach us."
--
-- catering_quote_changes already existed and already held the right idea: a customer asking is not
-- a customer changing. Her quote's total, deposit, terms and payment link are the owner's, and a
-- self-service edit would hand the price ladder an authority he deliberately took back. So this
-- extends that table rather than adding a second one beside it — there is one record of one
-- conversation per quote, and the Hub reads one list.
--
-- THREE THINGS WERE MISSING.
--
-- 1. STRUCTURE. Every request was free text, so "add 10 more croquetas" arrived as a sentence
--    somebody had to read, price and retype. `kind` and `items_json` let her ask for a named
--    product at a quantity, which is the thing she actually wants to do.
--
-- 2. AN ANSWER. There was no way to record a decision, so nothing could be shown back to her. A
--    customer who asks for something and is met with silence phones instead — which is the
--    behaviour this is meant to replace, not cause.
--
-- 3. ANYWHERE TO SEE IT. Nothing in the HUB read this table at all. A request was written to D1
--    and the owner learned of it only by email; a missed email was an invisible request. The Hub
--    now reads it, which is what makes `status` worth writing.
ALTER TABLE catering_quote_changes ADD COLUMN kind TEXT NOT NULL DEFAULT 'message';
-- The structured ask, when there is one: [{ id, name, qty, unit_cents }] for items, or the single
-- field a 'cajita' / 'dietary' request carries. Free-text requests leave it null and live in
-- `message`, which every kind still has.
ALTER TABLE catering_quote_changes ADD COLUMN items_json TEXT;
-- open | accepted | declined. `handled_at` predates this and is kept in step with it so the
-- existing idx_quote_changes_open index and anything reading it keep working.
ALTER TABLE catering_quote_changes ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
-- What the owner said back. SHOWN TO THE CUSTOMER, so it is written knowing she reads it.
ALTER TABLE catering_quote_changes ADD COLUMN owner_note TEXT;
ALTER TABLE catering_quote_changes ADD COLUMN decided_at INTEGER;
ALTER TABLE catering_quote_changes ADD COLUMN decided_by TEXT;

-- Her account lists her own requests newest-first; the desk lists what is still open.
CREATE INDEX IF NOT EXISTS idx_quote_changes_status ON catering_quote_changes(status, created_at DESC);
