-- Private owner-reviewed reuse permission, not permission to publish or a photo-authenticity claim.
-- No historical upload is auto-approved or backfilled.
CREATE TABLE marketing_asset_registry (
  id TEXT PRIMARY KEY,
  asset_key TEXT NOT NULL UNIQUE CHECK (asset_key LIKE 'marketing-library/%'),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  width INTEGER NOT NULL CHECK (width>0),
  height INTEGER NOT NULL CHECK (height>0),
  format TEXT NOT NULL CHECK (format IN ('portrait','square','landscape')),
  menu_item_ids_json TEXT NOT NULL CHECK (json_valid(menu_item_ids_json)),
  theme TEXT NOT NULL,
  visual_type TEXT NOT NULL CHECK (visual_type IN ('product','combo','lifestyle','editorial')),
  approved_for_draft_selection INTEGER NOT NULL DEFAULT 0 CHECK (approved_for_draft_selection IN (0,1)),
  revision INTEGER NOT NULL CHECK (revision>=1),
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TRIGGER marketing_asset_content_immutable BEFORE UPDATE OF asset_key, content_sha256, byte_size, width, height, format, created_at ON marketing_asset_registry
WHEN NEW.asset_key!=OLD.asset_key OR NEW.content_sha256!=OLD.content_sha256 OR NEW.byte_size!=OLD.byte_size OR NEW.width!=OLD.width OR NEW.height!=OLD.height OR NEW.format!=OLD.format OR NEW.created_at!=OLD.created_at
BEGIN SELECT RAISE(ABORT,'Registered content evidence is immutable'); END;
CREATE TABLE marketing_asset_registry_reviews (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES marketing_asset_registry(id),
  revision INTEGER NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  UNIQUE(asset_id, revision)
);
CREATE TRIGGER marketing_asset_reviews_immutable BEFORE UPDATE ON marketing_asset_registry_reviews
BEGIN SELECT RAISE(ABORT,'Asset review history is immutable'); END;
