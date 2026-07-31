-- Aña drafts Instagram DM and comment replies; a HUMAN always sends. These columns are the
-- draft's lifecycle on the existing messages table — drafts live in Añejo Comms next to
-- everything else, not in a second inbox nobody remembers to check.

-- When the OWNER pressed send. NULL on an ai-drafted outbound row means "draft awaiting review";
-- without this column a draft row is indistinguishable from a message the customer already got.
ALTER TABLE messages ADD COLUMN sent_at INTEGER;

-- Owner rejected the draft. It must be a marker, not a DELETE: the tick drafts for any thread
-- whose last word is the customer's, so a deleted draft would be quietly re-drafted a minute
-- later — a rejection loop that burns tokens and re-surfaces copy the owner already said no to.
ALTER TABLE messages ADD COLUMN dismissed_at INTEGER;

-- For a comment draft, the platform's comment id this draft answers. A comment thread is keyed
-- by MEDIA id and one post collects many comments, so without this the send op could not say
-- WHICH comment the approved reply goes under.
ALTER TABLE messages ADD COLUMN ref_id TEXT;
