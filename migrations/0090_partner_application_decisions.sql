-- Añejo — link a partner application to its decision so Approve/Decline in the Partners desk
-- can act on the stored application (no retyping) and show what happened. Additive only.
--   decided_at : unix-ms the owner approved/declined
--   partner_id : the trainers.id created on approval (traceability)
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0090_partner_application_decisions.sql

ALTER TABLE partner_applications ADD COLUMN decided_at INTEGER;
ALTER TABLE partner_applications ADD COLUMN partner_id TEXT;
