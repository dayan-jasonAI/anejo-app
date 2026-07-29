-- Customer push notifications: order tracking on the lock screen, with SMS as the fallback.
--
-- push_subscriptions already existed but was STAFF-ONLY (staff_id + role). A customer has no
-- staff row, so they are keyed the way the rest of the CRM is keyed: by email.
--
-- `audience` separates the two populations outright. Sending a customer's "your driver is
-- approaching" to the kitchen's device — or the reverse — is the kind of mistake that is obvious
-- in hindsight and easy to make when one table serves both.
--
-- `marketing_opt_in` is SEPARATE from having a subscription at all. Agreeing to be told where your
-- food is is not agreeing to be sold to; collapsing them means someone mutes order tracking to
-- escape a promo, and then misses their delivery.
ALTER TABLE push_subscriptions ADD COLUMN email TEXT;
ALTER TABLE push_subscriptions ADD COLUMN audience TEXT NOT NULL DEFAULT 'staff';   -- staff | customer
ALTER TABLE push_subscriptions ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_push_subs_email ON push_subscriptions (email, audience);

-- The queue the service worker reads, and the record that stops us saying the same thing twice.
--
-- Web push carries no payload here (the VAPID sender is payload-less), so the push is a "tickle":
-- it wakes the worker, which then asks what to show. This table is that answer.
--
-- It is ALSO the dedupe key. Order status is written by several paths — the Square webhook, the
-- kitchen board, the driver app, a manual owner edit — and more than one of them can land on the
-- same status. `dedupe_key` is UNIQUE, so "order X reached ready" can only ever notify once, no
-- matter how many times something re-writes that status.
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,          -- lowercased customer email (the CRM's unifying key)
  dedupe_key   TEXT NOT NULL UNIQUE,   -- e.g. 'order:ord_123:ready'
  kind         TEXT NOT NULL,          -- order | plan | marketing
  title        TEXT NOT NULL,
  body         TEXT,
  url          TEXT,                   -- where tapping it should land
  order_id     TEXT,
  channel      TEXT,                   -- push | sms | email | none (what actually carried it)
  delivered_at INTEGER,                -- when the worker rendered it
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications (email, created_at DESC);
