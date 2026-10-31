CREATE TABLE IF NOT EXISTS identity_verification_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider = 'stripe_identity'),
  provider_session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'requires_input', 'processing', 'verified', 'canceled', 'redacted')),
  livemode BOOLEAN NOT NULL DEFAULT false CHECK (livemode = false),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 240),
  request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  provider_error_code TEXT CHECK (provider_error_code IS NULL OR provider_error_code ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_provider_event_id TEXT,
  last_provider_event_created_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_verification_active_user_idx
  ON identity_verification_sessions(user_id)
  WHERE status IN ('requires_input', 'processing');
CREATE INDEX IF NOT EXISTS identity_verification_user_updated_idx
  ON identity_verification_sessions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS identity_verification_webhook_events (
  provider_event_id TEXT PRIMARY KEY CHECK (length(provider_event_id) BETWEEN 8 AND 255),
  provider_session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'identity.verification_session.created',
    'identity.verification_session.processing',
    'identity.verification_session.verified',
    'identity.verification_session.requires_input',
    'identity.verification_session.canceled',
    'identity.verification_session.redacted'
  )),
  event_created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION sit_identity_verification_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS identity_verification_sessions_set_updated_at
  ON identity_verification_sessions;
CREATE TRIGGER identity_verification_sessions_set_updated_at
BEFORE UPDATE ON identity_verification_sessions
FOR EACH ROW EXECUTE FUNCTION sit_identity_verification_sessions_updated_at();
