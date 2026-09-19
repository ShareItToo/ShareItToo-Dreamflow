ALTER TABLE identity_verification_sessions
  ADD COLUMN IF NOT EXISTS consent_version TEXT,
  ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_revoked_at TIMESTAMPTZ;
