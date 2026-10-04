ALTER TABLE inventory_items ADD COLUMN count_quantity REAL;
ALTER TABLE inventory_items ADD COLUMN total_weight_grams REAL;
ALTER TABLE inventory_items ADD COLUMN photo_key TEXT;
ALTER TABLE inventory_items ADD COLUMN photo_status TEXT NOT NULL DEFAULT 'none' CHECK(photo_status IN ('none','pending','approved','rejected'));
ALTER TABLE inventory_items ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN photo_reviewed_by TEXT;
ALTER TABLE inventory_items ADD COLUMN photo_reviewed_at INTEGER;
ALTER TABLE inventory_items ADD COLUMN counted_at INTEGER;
ALTER TABLE inventory_items ADD COLUMN expires_on TEXT;
ALTER TABLE inventory_items ADD COLUMN last_change_id TEXT;
ALTER TABLE menu_items ADD COLUMN inventory_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN last_inventory_change_id TEXT;
CREATE TABLE inventory_changes (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL, action TEXT NOT NULL, actor_id TEXT,
 before_json TEXT, after_json TEXT, created_at INTEGER NOT NULL,
 push_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX idx_inventory_changes_item_created ON inventory_changes(item_id, created_at DESC);
