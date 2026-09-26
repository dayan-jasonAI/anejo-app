-- Local recovery only: acknowledgment is written only after provider ok + a bounded ID.
-- Existing unknown attempts have no receipt and must not be inferred successful.
ALTER TABLE instagram_reply_attempts ADD COLUMN acceptance_receipt_json TEXT
  CHECK (acceptance_receipt_json IS NULL OR
    (length(acceptance_receipt_json) <= 1024 AND json_valid(acceptance_receipt_json)));
