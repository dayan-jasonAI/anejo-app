-- Nullable links preserve unknown provenance for historical output. Never backfill guesses.
ALTER TABLE social_posts ADD COLUMN inference_receipt_id TEXT REFERENCES inference_receipts(id);
ALTER TABLE team_messages ADD COLUMN inference_receipt_id TEXT REFERENCES inference_receipts(id);
ALTER TABLE team_messages ADD COLUMN inference_outcome_json TEXT CHECK (inference_outcome_json IS NULL OR json_valid(inference_outcome_json));
