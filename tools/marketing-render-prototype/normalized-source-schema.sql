-- LOCAL FOUNDATION ONLY. Normalized derivatives are private draft artifacts, not approvals.
CREATE TABLE prototype_normalized_source_versions (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 source_version_id TEXT NOT NULL,
 normalizer_version TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json) AND length(CAST(descriptor_json AS BLOB))<=4096),
 original_version_json TEXT NOT NULL CHECK(json_valid(original_version_json) AND length(CAST(original_version_json AS BLOB))<=8192),
 original_sha256 TEXT NOT NULL CHECK(length(original_sha256)=64),
 original_bytes INTEGER NOT NULL CHECK(original_bytes BETWEEN 1 AND 5242880),
 original_metadata_json TEXT NOT NULL CHECK(json_valid(original_metadata_json) AND length(CAST(original_metadata_json AS BLOB))<=4096),
 original_metadata_sha256 TEXT NOT NULL CHECK(length(original_metadata_sha256)=64),
 original_content_type TEXT NOT NULL,
 original_version_key TEXT NOT NULL,
 original_created_at INTEGER NOT NULL,
 original_confirmed_at INTEGER NOT NULL,
 version_key TEXT NOT NULL UNIQUE,
 derivative_sha256 TEXT NOT NULL CHECK(length(derivative_sha256)=64),
 derivative_bytes INTEGER NOT NULL CHECK(derivative_bytes BETWEEN 1 AND 5242880),
 derivative_content_type TEXT NOT NULL CHECK(derivative_content_type='image/png'),
 derivative_metadata_json TEXT NOT NULL CHECK(json_valid(derivative_metadata_json) AND length(CAST(derivative_metadata_json AS BLOB))<=4096),
 derivative_metadata_sha256 TEXT NOT NULL CHECK(length(derivative_metadata_sha256)=64),
 receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json) AND length(CAST(receipt_json AS BLOB))<=4096),
 receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64),
 state TEXT NOT NULL CHECK(state IN ('pending','confirmed')),
 created_at INTEGER NOT NULL CHECK(created_at BETWEEN 0 AND 9007199254740991),
 confirmed_at INTEGER CHECK(confirmed_at BETWEEN 0 AND 9007199254740991),
 UNIQUE(actor_id,source_version_id,normalizer_version),
 CHECK((state='confirmed' AND confirmed_at IS NOT NULL) OR (state='pending' AND confirmed_at IS NULL))
);
CREATE TRIGGER prototype_normalized_source_binding_immutable BEFORE UPDATE OF
 id,actor_id,source_version_id,normalizer_version,fingerprint,descriptor_json,original_version_json,
 original_sha256,original_bytes,original_metadata_json,original_metadata_sha256,
 original_content_type,original_version_key,original_created_at,original_confirmed_at,version_key,
 derivative_sha256,derivative_bytes,derivative_content_type,derivative_metadata_json,
 derivative_metadata_sha256,receipt_json,receipt_sha256,created_at
 ON prototype_normalized_source_versions BEGIN SELECT RAISE(ABORT,'normalized_source_binding_immutable'); END;
CREATE TRIGGER prototype_normalized_source_terminal BEFORE UPDATE ON prototype_normalized_source_versions
 WHEN OLD.state!='pending' BEGIN SELECT RAISE(ABORT,'normalized_source_terminal'); END;
