-- 0124 — THE STANDING APPROVAL. What made an email sendable without a fresh click, and what it was.
--
-- Dayan, 2026-09-21: "The initial email we sent to the first 11 is perfect and it can have my
-- approval to be sent out automatically as the prospect lists get refreshed with new prospects."
--
-- That is a real decision an owner is entitled to make, and it is also the one rail this system was
-- built around ("no prospect email leaves without a human reading it"). So it is not removed — it is
-- MOVED EARLIER: the owner reads and attests one exact email, and that attestation is what approves
-- its future copies. The moment anything that email is made of changes — the template, the offer,
-- the sender, the postal footer, the proof line — the fingerprint stops matching and automatic
-- sending halts until he reads and attests again.
--
-- These two columns are the audit trail: which emails went out on a standing approval rather than a
-- fresh one, and exactly which attestation authorised each.
--
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0124_auto_intro.sql

ALTER TABLE sales_outreach ADD COLUMN auto_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_outreach ADD COLUMN attestation_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_outreach_auto ON sales_outreach(auto_approved, approved_at);
