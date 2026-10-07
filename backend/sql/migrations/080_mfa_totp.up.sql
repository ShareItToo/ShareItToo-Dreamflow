ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS mfa_totp_factors (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'enabled', 'disabled')),
  recovery_code_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_used_step BIGINT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 100),
  locked_until TIMESTAMPTZ,
  enrollment_idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'enabled') = (enabled_at IS NOT NULL)),
  CHECK (jsonb_typeof(recovery_code_hashes) = 'array')
);
CREATE UNIQUE INDEX IF NOT EXISTS mfa_totp_factors_enrollment_key_idx
  ON mfa_totp_factors(user_id, enrollment_idempotency_key)
  WHERE enrollment_idempotency_key IS NOT NULL;

ALTER TABLE mfa_totp_factors
  ALTER COLUMN encrypted_secret DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'mfa_totp_factors_secret_status_check'
       AND conrelid = 'mfa_totp_factors'::regclass
  ) THEN
    ALTER TABLE mfa_totp_factors
      ADD CONSTRAINT mfa_totp_factors_secret_status_check
      CHECK ((status IN ('pending', 'enabled')) = (encrypted_secret IS NOT NULL));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS auth_mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login')),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  locked_until TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_address INET
);
CREATE INDEX IF NOT EXISTS auth_mfa_challenges_user_idx
  ON auth_mfa_challenges(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_mfa_challenges_expiry_idx
  ON auth_mfa_challenges(expires_at)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION sit_mfa_totp_factors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mfa_totp_factors_set_updated_at ON mfa_totp_factors;
CREATE TRIGGER mfa_totp_factors_set_updated_at
BEFORE UPDATE ON mfa_totp_factors
FOR EACH ROW EXECUTE FUNCTION sit_mfa_totp_factors_updated_at();
