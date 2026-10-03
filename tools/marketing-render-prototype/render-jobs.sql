-- LOCAL PROTOTYPE ONLY. Not a production migration.
-- A rendered receipt does not establish attachment, publication, audit, or approval.
CREATE TABLE IF NOT EXISTS prototype_render_jobs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','rendering','rendered','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
  updated_at INTEGER NOT NULL CHECK (updated_at BETWEEN 0 AND 9007199254740991),
  lease_token TEXT,
  lease_until INTEGER CHECK (lease_until BETWEEN 0 AND 9007199254740991),
  receipt_json TEXT,
  error_code TEXT,
  UNIQUE(actor_id, request_id),
  CHECK ((status = 'rendering' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status != 'rendering' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK ((status = 'rendered' AND receipt_json IS NOT NULL) OR (status != 'rendered' AND receipt_json IS NULL))
);
CREATE INDEX IF NOT EXISTS prototype_render_jobs_claim
  ON prototype_render_jobs(actor_id, status, created_at, id);

-- A consumer transaction may INSERT changes() here immediately after its guarded
-- write. Zero changed rows violate this CHECK, allowing the caller to roll back.
CREATE TABLE IF NOT EXISTS prototype_render_guards (
  success INTEGER NOT NULL CHECK (success = 1)
);
