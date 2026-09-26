ALTER TABLE identity_verification_sessions
  DROP COLUMN IF EXISTS consent_revoked_at,
  DROP COLUMN IF EXISTS consented_at,
  DROP COLUMN IF EXISTS consent_version;
