-- Instagram DMs/comments can now BECOME a lead, not just a warm auto-reply.
--
-- THE GAP THIS CLOSES: exactly one INSERT INTO leads existed anywhere in the codebase, and every
-- caller was the public /api/leads web form. A DM saying "I want to book catering for 60 people"
-- produced a row in `messages` and nothing else — no lead, no alert, no owner notification. Aña
-- even deflects the customer to a web form she cannot see them fill out (ana_social.js:143). This
-- migration gives Instagram-sourced enquiries a home in the SAME `leads` table the owner already
-- works from in the HUB, rather than a second, divergent inbox nobody remembers to check — the
-- same reasoning 0062 already used for putting Instagram DMs in Comms instead of a new console.
--
-- All columns are nullable/defaulted so every existing (web-form) row is unaffected: channel
-- defaults to 'web', and a web lead never touches any ig_*/source_*/trigger_message column.

-- 'web' (the existing tasting/wholesale/launch/sms forms) | 'instagram' (DM or comment capture).
ALTER TABLE leads ADD COLUMN channel TEXT NOT NULL DEFAULT 'web';

-- Who, on Instagram. ig_user_id is the platform's own id for the commenter/DM sender (stable,
-- always present when we have anything to attribute); ig_username is display-only and can be
-- null/stale — never used for the dedupe key below.
ALTER TABLE leads ADD COLUMN ig_username TEXT;
ALTER TABLE leads ADD COLUMN ig_user_id  TEXT;

-- WHAT the classifier decided, so the owner sees a real signal instead of a bare "Instagram" tag.
--   ig_intent      : 'catering' | 'bulk_corporate' | 'wholesale_partnership' | 'subscription'
--   ig_confidence  : 'high' | 'low' — see detectCommercialIntent() in _lib/ana_social.js.
--     "A maybe is not a yes": there is deliberately no middle tier. 'high' is earned by an intent
--     verb (book/order/need/quote/…) or an explicit headcount alongside the keyword; anything
--     softer than that — a bare mention, a browsing question — stays 'low'. Only 'high' alerts;
--     'low' is still captured here so the owner can find it, just never interrupted for it.
ALTER TABLE leads ADD COLUMN ig_intent     TEXT;
ALTER TABLE leads ADD COLUMN ig_confidence TEXT;

-- The actual DM/comment text that triggered capture — the owner's evidence for the classification,
-- shown verbatim in the HUB rather than asking them to trust a label.
ALTER TABLE leads ADD COLUMN trigger_message TEXT;

-- Back to Comms: which thread/message this came from, so the owner (or a future build) can jump
-- from the lead to the actual conversation instead of re-explaining who this person is.
ALTER TABLE leads ADD COLUMN source_thread_id  TEXT REFERENCES threads(id);
ALTER TABLE leads ADD COLUMN source_message_id TEXT REFERENCES messages(id);

CREATE INDEX IF NOT EXISTS idx_leads_channel ON leads(channel);

-- IDEMPOTENCY, at the database layer, not just in application code — the tick runs every minute
-- and a webhook retries, so "insert, catch the conflict" has to actually be backed by a
-- constraint. Keyed on (thread, actor) rather than thread alone:
--   · a DM thread is already 1:1 with one external customer (webhooks/instagram.js keys it by
--     from_id), so this is naturally "one Instagram lead per customer conversation".
--   · a COMMENT thread is one per MEDIA (one Instagram post), shared by every commenter on that
--     post (social-inbox-tick.js:220 commentThread()) — without ig_user_id in the key, the first
--     commenter's catering enquiry would silently block every other commenter's on the same post
--     from ever becoming a lead.
-- This is what makes "the same DM twice" and "a follow-up message in the same conversation" both
-- resolve to ONE row: the second capture attempt hits this index and is treated as a duplicate,
-- never a second lead. Partial (channel='instagram') so it never constrains the existing web-form
-- rows in any way.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_ig_dedupe
  ON leads(source_thread_id, ig_user_id)
  WHERE channel='instagram' AND source_thread_id IS NOT NULL AND ig_user_id IS NOT NULL;
