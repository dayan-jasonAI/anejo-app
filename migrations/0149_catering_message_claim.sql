-- One unresolved catering text per conversation, including truly concurrent owner clicks.
CREATE UNIQUE INDEX IF NOT EXISTS catering_sms_unresolved_claim
ON messages(thread_id) WHERE id GLOB 'msg_catering_send_*' AND sms_log_id IS NULL;
