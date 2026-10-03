-- No email/principal/credential payload. Retain spent-token protection through
-- invitation expiry even after account erasure, then purge with credentials.
CREATE TABLE staging_password_enrollment_redemptions (
  token_digest CHAR(64) PRIMARY KEY CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE INDEX staging_password_enrollment_redemptions_expiry_idx
  ON staging_password_enrollment_redemptions (expires_at);
