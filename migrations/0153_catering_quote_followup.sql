-- Manual reviewed follow-up only. No cron, activation flag, or retrospective sends.
CREATE TABLE IF NOT EXISTS catering_quote_followups (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES catering_quotes(id), lead_id TEXT NOT NULL REFERENCES leads(id),
 step TEXT NOT NULL DEFAULT 'review_quote', review_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','unknown','suppressed','failed')),
 idempotency_key TEXT NOT NULL UNIQUE, receipt_id TEXT, last_error TEXT, created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, accepted_at INTEGER, projected_at INTEGER,
 UNIQUE(quote_id,step)
);
CREATE TABLE IF NOT EXISTS catering_quote_responses (
 lead_id TEXT PRIMARY KEY REFERENCES leads(id), quote_id TEXT NOT NULL REFERENCES catering_quotes(id),
 status TEXT NOT NULL CHECK(status IN ('awaiting_reply','replied','call_requested','changes_requested','declined')),
 note TEXT, next_followup_at INTEGER, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
