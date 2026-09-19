ALTER TABLE identity_verification_webhook_events
  ADD COLUMN IF NOT EXISTS identity_session_id TEXT;
ALTER TABLE identity_verification_redaction_outbox
  ADD COLUMN IF NOT EXISTS identity_session_id TEXT;
CREATE INDEX IF NOT EXISTS identity_verification_webhook_session_idx
  ON identity_verification_webhook_events(identity_session_id);
CREATE INDEX IF NOT EXISTS identity_verification_redaction_session_idx
  ON identity_verification_redaction_outbox(identity_session_id);
