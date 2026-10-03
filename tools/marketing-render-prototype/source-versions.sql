-- LOCAL FOUNDATION ONLY. Does not establish bucket-wide immutability or approval.
CREATE TABLE prototype_source_versions (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json)),
 version_key TEXT NOT NULL UNIQUE,
 source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 source_bytes INTEGER NOT NULL CHECK(source_bytes BETWEEN 1 AND 5242880),
 metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json) AND length(CAST(metadata_json AS BLOB))<=4096),
 metadata_sha256 TEXT NOT NULL CHECK(length(metadata_sha256)=64),
 content_type TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','confirmed','rejected')),
 created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 confirmed_at INTEGER CHECK(confirmed_at BETWEEN 0 AND 9007199254740991),
 UNIQUE(actor_id,request_id),
 CHECK((state='confirmed' AND confirmed_at IS NOT NULL) OR (state!='confirmed' AND confirmed_at IS NULL))
);
CREATE TRIGGER prototype_source_version_binding_immutable BEFORE UPDATE OF
 id,actor_id,request_id,fingerprint,descriptor_json,version_key,source_sha256,source_bytes,metadata_json,metadata_sha256,content_type,created_at
 ON prototype_source_versions BEGIN SELECT RAISE(ABORT,'source_version_binding_immutable'); END;
CREATE TRIGGER prototype_source_version_terminal BEFORE UPDATE ON prototype_source_versions
 WHEN OLD.state!='pending' BEGIN SELECT RAISE(ABORT,'source_version_terminal'); END;
