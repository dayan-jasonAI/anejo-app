-- Draft generation is automatic. Public website activation and exact Story review are explicit.
CREATE TABLE inventory_sale_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), website_enabled INTEGER NOT NULL DEFAULT 0 CHECK(website_enabled IN(0,1)),
 template_version TEXT NOT NULL, reviewed_by TEXT, reviewed_at INTEGER, updated_at INTEGER NOT NULL
);
INSERT INTO inventory_sale_settings(id,website_enabled,template_version,updated_at) VALUES(1,0,'stock-story-v1',0);
CREATE TABLE inventory_sale_promotions (
 menu_item_id TEXT PRIMARY KEY, offer_revision INTEGER NOT NULL, snapshot_hash TEXT NOT NULL,
 snapshot_json TEXT NOT NULL, post_id TEXT, locale TEXT NOT NULL CHECK(locale IN('en','es')),
 state TEXT NOT NULL CHECK(state IN('pending','preview_ready','ready_for_review','reviewed','withdrawn','error')),
 svg_key TEXT, jpeg_key TEXT, jpeg_sha256 TEXT, error TEXT, reviewed_by TEXT, reviewed_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE inventory_sale_promotion_events (
 id TEXT PRIMARY KEY, menu_item_id TEXT NOT NULL, post_id TEXT, snapshot_hash TEXT,
 action TEXT NOT NULL, actor_id TEXT, details_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX inventory_sale_promotion_events_item ON inventory_sale_promotion_events(menu_item_id,created_at);
