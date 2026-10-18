-- A callback may arrive before the send response is stored. Keep it independently.
CREATE TABLE IF NOT EXISTS sms_delivery_receipts (
 provider_sid TEXT PRIMARY KEY, status TEXT NOT NULL, error TEXT, received_at INTEGER NOT NULL
);
