-- Añejo — two customer-facing silences, closed. Additive only.
--
--   1) A FAILED DELIVERY told the OWNER and nobody else. functions/api/hub/driver/delivery/fail.js
--      raised an internal alert and returned. The person standing at the door waiting for lunch
--      got no text, no email, no explanation — the single worst moment in the whole fulfilment
--      path was also the only one with no customer notice attached to it.
--
--   2) AN ABANDONED CHECKOUT was relabelled and then dropped. _lib/abandoned.js flipped stale
--      unpaid rows to 'abandoned' so the owner's list stayed honest, and that was the end of it.
--      Nobody ever asked the customer whether something had gone wrong.
--
-- BOTH COLUMNS ARE CLAIM STAMPS, not logs. The code writes them with
-- `UPDATE … WHERE id=? AND <col> IS NULL` and only sends when that update changed exactly one
-- row, so two concurrent ticks (or a retried cron) send exactly one message. That is also why
-- shipping the code before this migration is safe in the direction that matters: without the
-- column the claim UPDATE throws, the claim fails, and NOTHING is sent. The failure mode is
-- silence, never a duplicate message to a customer.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0087_customer_recovery_and_failed_delivery.sql

ALTER TABLE orders ADD COLUMN delivery_failed_notified_at INTEGER;
ALTER TABLE orders ADD COLUMN recovery_sent_at            INTEGER;
ALTER TABLE orders ADD COLUMN recovery_channel            TEXT;   -- sms | email | none
