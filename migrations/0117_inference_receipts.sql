-- Private input evidence only. A saved receipt does NOT prove a provider call succeeded.
-- No public route is created; callers must enforce owner/private access and retention.
CREATE TABLE inference_receipts (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK (surface IN ('team_lead','social_plan')),
  model TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK (json_valid(request_json) AND length(CAST(request_json AS BLOB)) <= 262144),
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256)=64),
  components_json TEXT NOT NULL CHECK (json_valid(components_json) AND length(CAST(components_json AS BLOB)) <= 65536),
  evidence_status TEXT NOT NULL DEFAULT 'input_recorded' CHECK (evidence_status='input_recorded'),
  transport_status TEXT NOT NULL DEFAULT 'unknown' CHECK (transport_status='unknown'),
  created_at INTEGER NOT NULL
);
CREATE INDEX inference_receipts_surface_time ON inference_receipts(surface, created_at);
-- Evidence is append-only. Retention may delete old receipts, never rewrite their inputs.
CREATE TRIGGER inference_receipts_no_update BEFORE UPDATE ON inference_receipts
BEGIN SELECT RAISE(ABORT, 'Inference input evidence is immutable'); END;
