ALTER TABLE identity_verification_sessions
  ALTER COLUMN provider_session_id DROP NOT NULL;
ALTER TABLE identity_verification_sessions
  ADD COLUMN IF NOT EXISTS provider_session_hash TEXT;
ALTER TABLE identity_verification_sessions
  DROP CONSTRAINT IF EXISTS identity_verification_sessions_provider_session_hash_chk;
ALTER TABLE identity_verification_sessions
  ADD CONSTRAINT identity_verification_sessions_provider_session_hash_chk
  CHECK (provider_session_hash IS NULL OR provider_session_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE identity_verification_sessions
  DROP CONSTRAINT IF EXISTS identity_verification_sessions_provider_redaction_pair_chk;
ALTER TABLE identity_verification_sessions
  ADD CONSTRAINT identity_verification_sessions_provider_redaction_pair_chk
  CHECK ((status = 'redacted' AND provider_session_id IS NULL AND provider_session_hash IS NOT NULL)
      OR (status <> 'redacted' AND provider_session_id IS NOT NULL));

ALTER TABLE identity_verification_redaction_outbox
  ALTER COLUMN provider_session_id DROP NOT NULL;
ALTER TABLE identity_verification_redaction_outbox
  ADD COLUMN IF NOT EXISTS provider_session_hash TEXT;
ALTER TABLE identity_verification_redaction_outbox
  DROP CONSTRAINT IF EXISTS identity_verification_redaction_outbox_provider_session_hash_chk;
ALTER TABLE identity_verification_redaction_outbox
  ADD CONSTRAINT identity_verification_redaction_outbox_provider_session_hash_chk
  CHECK (provider_session_hash IS NULL OR provider_session_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE identity_verification_redaction_outbox
  DROP CONSTRAINT IF EXISTS identity_verification_redaction_outbox_provider_redaction_pair_chk;
ALTER TABLE identity_verification_redaction_outbox
  ADD CONSTRAINT identity_verification_redaction_outbox_provider_redaction_pair_chk
  CHECK ((status = 'redacted' AND provider_session_id IS NULL AND provider_session_hash IS NOT NULL)
      OR (status <> 'redacted' AND provider_session_id IS NOT NULL));

ALTER TABLE identity_verification_webhook_events
  ALTER COLUMN provider_session_id DROP NOT NULL;
ALTER TABLE identity_verification_webhook_events
  ADD COLUMN IF NOT EXISTS provider_session_hash TEXT;
ALTER TABLE identity_verification_webhook_events
  DROP CONSTRAINT IF EXISTS identity_verification_webhook_events_provider_session_hash_chk;
ALTER TABLE identity_verification_webhook_events
  ADD CONSTRAINT identity_verification_webhook_events_provider_session_hash_chk
  CHECK (provider_session_hash IS NULL OR provider_session_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE identity_verification_webhook_events
  DROP CONSTRAINT IF EXISTS identity_verification_webhook_events_provider_redaction_pair_chk;
ALTER TABLE identity_verification_webhook_events
  ADD CONSTRAINT identity_verification_webhook_events_provider_redaction_pair_chk
  CHECK ((provider_session_id IS NULL AND provider_session_hash IS NOT NULL)
      OR (provider_session_id IS NOT NULL AND provider_session_hash IS NULL));

CREATE TABLE IF NOT EXISTS identity_verification_provider_tombstones (
  provider_session_hash TEXT PRIMARY KEY CHECK (provider_session_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_verification_provider_tombstones_expiry_idx
  ON identity_verification_provider_tombstones(expires_at);
