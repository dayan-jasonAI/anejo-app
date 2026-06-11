-- Añejo — SMS opt-in consent (A2P 10DLC compliance).
-- We only send text messages to customers who actively checked the consent box on the
-- order/subscription/contact form. Stored per record so recurring texts honor the opt-in.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0008_sms_consent.sql

ALTER TABLE clients ADD COLUMN sms_consent INTEGER DEFAULT 0;
ALTER TABLE leads   ADD COLUMN sms_consent INTEGER DEFAULT 0;
