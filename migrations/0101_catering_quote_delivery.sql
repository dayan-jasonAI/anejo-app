-- The catering quote gets sent to the customer, by email and by text.
--
-- Until now createDepositCheckout() minted a Square link and handed the URL back to the Hub for
-- someone to paste somewhere by hand. Nothing was ever sent, and there was nowhere for a link to
-- point: catering_quotes had no address a customer could open.
--
-- access_token is that address. It is a SECRET, not an id: quote ids are sequential-ish and a
-- link built from one would let anybody walk the table and read other people's names, phone
-- numbers, menus and totals. The token is what the SMS and the email link carry, and the page
-- is served on the token alone — a link in a text message has to open on a phone with no login,
-- or it does not get opened at all.
ALTER TABLE catering_quotes ADD COLUMN access_token TEXT;

-- Delivery is recorded per channel so a retry cannot double-send, and so "did she ever get it?"
-- is answerable from the row rather than from a support conversation.
ALTER TABLE catering_quotes ADD COLUMN email_sent_at INTEGER;
ALTER TABLE catering_quotes ADD COLUMN sms_sent_at INTEGER;
ALTER TABLE catering_quotes ADD COLUMN delivery_error TEXT;

-- The language the quote was SENT in. A customer who was quoted in Spanish must see Spanish when
-- they open the link a week later, whatever their browser happens to prefer.
ALTER TABLE catering_quotes ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';

-- Unique so a token collision is a write error rather than one customer reading another's quote.
CREATE UNIQUE INDEX IF NOT EXISTS idx_catering_quotes_token ON catering_quotes(access_token);
