-- Anonymous lunch responses: no patient identifiers, names or health fields.
CREATE TABLE IF NOT EXISTS contract_lunch_feedback (
 id TEXT PRIMARY KEY, site_id TEXT NOT NULL, order_id TEXT NOT NULL,
 service_date TEXT NOT NULL, item_name TEXT NOT NULL,
 rating INTEGER CHECK(rating BETWEEN 1 AND 10),
 mood TEXT CHECK(mood IN ('sad','neutral','happy')),
 eat_again TEXT NOT NULL CHECK(eat_again IN ('yes','no','unsure','unanswered')),
 suggestion TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
 CHECK ((rating IS NOT NULL AND mood IS NULL) OR (rating IS NULL AND mood IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_contract_feedback_service ON contract_lunch_feedback(service_date,site_id);
