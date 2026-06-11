-- Añejo HUB — comms core: staff/vendor counterparty + entity refs on threads.
-- Apply: wrangler d1 execute anejo --file=migrations/0006_comms_vendor.sql
-- Style matches 0005_staff_auth.sql: additive ALTERs on existing tables (threads from 0003_hub.sql).
ALTER TABLE threads ADD COLUMN staff_id TEXT REFERENCES staff(id);  -- staff/vendor counterparty
ALTER TABLE threads ADD COLUMN ref_type TEXT;                       -- e.g. 'restock_order'
ALTER TABLE threads ADD COLUMN ref_id   TEXT;
