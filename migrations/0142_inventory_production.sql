-- Explicit owner-reviewed ingredient + packaging maps; no fuzzy recipe inference.
CREATE TABLE inventory_production_policies (
 menu_item_id TEXT PRIMARY KEY REFERENCES menu_items(id), recipe_id TEXT NOT NULL REFERENCES recipes(id),
 recipe_updated_at INTEGER NOT NULL, requirements_json TEXT NOT NULL, target_count INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 9999),
 min_batch INTEGER NOT NULL CHECK(min_batch BETWEEN 1 AND 9999), max_batch INTEGER NOT NULL CHECK(max_batch BETWEEN 1 AND 9999),
 stock_max_age_hours INTEGER NOT NULL CHECK(stock_max_age_hours BETWEEN 1 AND 168),
 assigned_staff_id TEXT REFERENCES staff(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN(0,1)),
 auto_relist INTEGER NOT NULL DEFAULT 0 CHECK(auto_relist IN(0,1)),
 reviewed_by TEXT NOT NULL, reviewed_at INTEGER NOT NULL, last_event_id TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE inventory_production_tasks (
 id TEXT PRIMARY KEY, menu_item_id TEXT NOT NULL REFERENCES menu_items(id), recipe_id TEXT NOT NULL,
 policy_revision INTEGER NOT NULL, recipe_updated_at INTEGER NOT NULL, qty INTEGER NOT NULL CHECK(qty BETWEEN 1 AND 9999),
 requirements_json TEXT NOT NULL, stock_snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('queued','preparing','completed','cancelled')),
 assigned_staff_id TEXT, created_by TEXT NOT NULL, started_by TEXT, completed_by TEXT,
 actual_qty INTEGER, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER,
 auto_relist INTEGER NOT NULL DEFAULT 0, last_event_id TEXT, version INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX inventory_production_one_open ON inventory_production_tasks(menu_item_id) WHERE status IN('queued','preparing');
CREATE TABLE inventory_production_events (
 id TEXT PRIMARY KEY, task_id TEXT, menu_item_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, details_json TEXT NOT NULL, created_at INTEGER NOT NULL,
 push_status TEXT NOT NULL DEFAULT 'pending'
);
