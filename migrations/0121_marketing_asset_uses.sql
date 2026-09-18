-- Immutable evidence of a private draft attachment; never publication consent.
CREATE TABLE marketing_asset_uses (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL, -- historical ID survives owner deleting the draft
  media_id TEXT NOT NULL UNIQUE, -- historical ID survives owner detaching the slide
  asset_id TEXT NOT NULL REFERENCES marketing_asset_registry(id),
  asset_revision INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  requirements_json TEXT NOT NULL CHECK(json_valid(requirements_json)),
  created_at INTEGER NOT NULL,
  FOREIGN KEY(asset_id,asset_revision) REFERENCES marketing_asset_registry_reviews(asset_id,revision)
);
CREATE TRIGGER marketing_asset_uses_immutable BEFORE UPDATE ON marketing_asset_uses
BEGIN SELECT RAISE(ABORT,'Asset attachment evidence is immutable'); END;
