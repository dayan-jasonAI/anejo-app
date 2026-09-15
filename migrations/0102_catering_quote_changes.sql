-- A customer asking for her quote to change.
--
-- The quote email has carried a "Modify my order" button since 2026-09-09. It pointed at
-- /q/<token>?edit=1, and NOTHING read that parameter — the page re-served itself, so the button
-- appeared to do nothing. The copy beside it was worse than the dead link: it promised "adjust
-- quantities, add a dish, or change your guest count. Your quote updates and we are notified
-- straight away", none of which was true.
--
-- This table is where the request now lands. It is deliberately NOT an editor: a customer cannot
-- reprice her own quote, because the prices are Dayan's decision and a self-service repricing
-- would hand the menu's ladder authority he has explicitly taken back. She says what she wants
-- changed, it is recorded against her quote, and he is notified. The copy now says exactly that.
--
-- No money lives here. The quote's own total, deposit and terms are untouched until a human
-- decides to change them.
CREATE TABLE IF NOT EXISTS catering_quote_changes (
  id          TEXT PRIMARY KEY,
  quote_id    TEXT NOT NULL REFERENCES catering_quotes(id),
  -- What she asked for. `guests` is nullable because "add a dish" is a change with no new count.
  guests      INTEGER,
  message     TEXT NOT NULL,
  -- Who asked, as the quote knew them at the time. Denormalised on purpose: this is a record of a
  -- conversation, and it must still read correctly if the quote is later edited or the customer
  -- row changes.
  customer_name  TEXT,
  customer_email TEXT,
  lang        TEXT NOT NULL DEFAULT 'en',
  -- Delivery of the owner's notification. A failure here must never lose the request itself, so
  -- the row is written first and this is stamped after.
  notified_at INTEGER,
  notify_error TEXT,
  -- Cleared by whoever deals with it, so the Hub can show what is still outstanding.
  handled_at  INTEGER,
  created_at  INTEGER NOT NULL
);

-- The Hub reads these newest-first for one quote, and newest-first across all unhandled ones.
CREATE INDEX IF NOT EXISTS idx_quote_changes_quote ON catering_quote_changes(quote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_changes_open ON catering_quote_changes(handled_at, created_at DESC);
