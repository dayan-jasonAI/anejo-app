-- One stable Square checkout per quoted balance; retries reuse its idempotency key.
CREATE TABLE IF NOT EXISTS catering_balance_checkouts (
 quote_id TEXT PRIMARY KEY REFERENCES catering_quotes(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
 square_order_id TEXT UNIQUE,
 payment_link_url TEXT,
 paid_at INTEGER,
 created_at INTEGER NOT NULL
);
