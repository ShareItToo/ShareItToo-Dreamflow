CREATE TABLE IF NOT EXISTS identity_verification_redaction_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_session_id TEXT NOT NULL UNIQUE CHECK (length(provider_session_id) BETWEEN 8 AND 255),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'retry', 'redacted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  last_error_code TEXT CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS identity_verification_redaction_due_idx
  ON identity_verification_redaction_outbox(next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry');
