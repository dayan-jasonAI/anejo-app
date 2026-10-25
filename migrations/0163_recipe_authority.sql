-- Legacy status='published' is not an owner approval receipt. No approvals are backfilled.
CREATE TABLE recipe_revisions (
 id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id), version INTEGER NOT NULL,
 based_on_updated_at INTEGER NOT NULL, payload_json TEXT NOT NULL, content_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('draft','submitted','approved','rejected')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL, submitted_at INTEGER,
 approved_by TEXT, approved_at INTEGER, review_note TEXT, source_verified INTEGER NOT NULL DEFAULT 0 CHECK(source_verified IN(0,1)),
 UNIQUE(recipe_id,version)
);
CREATE TABLE recipe_authority (
 recipe_id TEXT PRIMARY KEY REFERENCES recipes(id), version_id TEXT NOT NULL REFERENCES recipe_revisions(id),
 recipe_updated_at INTEGER NOT NULL, approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL
);
CREATE TABLE menu_recipe_authority (
 menu_item_id TEXT PRIMARY KEY REFERENCES menu_items(id), recipe_id TEXT NOT NULL REFERENCES recipes(id),
 version_id TEXT NOT NULL REFERENCES recipe_revisions(id), portions_per_sale_unit REAL NOT NULL CHECK(portions_per_sale_unit>0),
 approved_by TEXT NOT NULL, approved_at INTEGER NOT NULL
);
CREATE INDEX recipe_revisions_state ON recipe_revisions(status,created_at);
