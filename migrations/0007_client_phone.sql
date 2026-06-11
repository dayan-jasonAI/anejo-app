-- Direct/public subscribers can leave a phone number; subscriptions/create.js inserts it.
-- (The deployed code referenced clients.phone with no migration — this adds the column.)
ALTER TABLE clients ADD COLUMN phone TEXT;
