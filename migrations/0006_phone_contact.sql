-- Añejo — optional phone contact for trainers & clients (2026-06).
-- Phone is an OPTIONAL profile/contact field captured at signup; email magic-link stays the login
-- method (auth path unchanged). Used for delivery coordination + future SMS notifications.
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0006_phone_contact.sql

ALTER TABLE trainers ADD COLUMN phone TEXT;
ALTER TABLE clients  ADD COLUMN phone TEXT;
