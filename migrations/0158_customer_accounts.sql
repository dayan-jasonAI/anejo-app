-- A customer identity is not a trainer's meal-plan client. One normalized email owns one
-- account, across guest retail and catering purchases. This creates no session, consent or points.
CREATE TABLE IF NOT EXISTS customer_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK(email = LOWER(TRIM(email))),
  name TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO customer_accounts (id,email,name,phone,source,created_at,updated_at)
SELECT 'ca_' || LOWER(HEX(RANDOMBLOB(10))), LOWER(TRIM(customer_email)), customer_name,
       customer_phone, 'catering_payment', MIN(created_at), MAX(updated_at)
  FROM catering_quotes
 WHERE deposit_status='paid' AND INSTR(customer_email,'@')>1
 GROUP BY LOWER(TRIM(customer_email));

INSERT OR IGNORE INTO customer_accounts (id,email,name,phone,source,created_at,updated_at)
SELECT 'ca_' || LOWER(HEX(RANDOMBLOB(10))), LOWER(TRIM(customer_email)), customer_name,
       customer_phone, 'retail_payment', MIN(created_at), MAX(updated_at)
  FROM orders
 WHERE status IN ('paid','prep','ready','fulfilled') AND INSTR(customer_email,'@')>1
 GROUP BY LOWER(TRIM(customer_email));
