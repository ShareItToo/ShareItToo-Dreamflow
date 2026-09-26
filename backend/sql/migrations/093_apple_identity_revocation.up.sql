-- Apple provider revocation is durable and independent from Firebase identity
-- deletion. Material is encrypted before it reaches these columns and is
-- cleared after a confirmed Apple revoke. Missing material/configuration stays
-- explicit instead of being reported as provider revocation success.

ALTER TABLE auth_identities
  ADD COLUMN IF NOT EXISTS apple_revocation_material_kind TEXT,
  ADD COLUMN IF NOT EXISTS apple_revocation_material_ciphertext TEXT;

ALTER TABLE auth_identities
  ADD CONSTRAINT auth_identities_apple_material_kind_check
  CHECK (apple_revocation_material_kind IS NULL
      OR apple_revocation_material_kind IN ('authorization_code', 'refresh_token'));

ALTER TABLE firebase_identity_deletion_outbox
  ADD COLUMN IF NOT EXISTS firebase_deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apple_revocation_status TEXT NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS apple_revocation_material_kind TEXT,
  ADD COLUMN IF NOT EXISTS apple_revocation_material_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS apple_revocation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apple_revocation_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apple_revocation_last_error_code TEXT;

ALTER TABLE firebase_identity_deletion_outbox
  ADD CONSTRAINT firebase_identity_deletion_apple_status_check
  CHECK (apple_revocation_status IN (
    'not_required', 'pending', 'processing', 'retry', 'succeeded',
    'needs_material', 'blocked'
  ));

ALTER TABLE firebase_identity_deletion_outbox
  ADD CONSTRAINT firebase_identity_deletion_apple_kind_check
  CHECK (apple_revocation_material_kind IS NULL
      OR apple_revocation_material_kind IN ('authorization_code', 'refresh_token'));

ALTER TABLE firebase_identity_deletion_outbox
  ADD CONSTRAINT firebase_identity_deletion_apple_attempts_check
  CHECK (apple_revocation_attempts >= 0);

UPDATE firebase_identity_deletion_outbox
   SET apple_revocation_status = 'needs_material'
 WHERE provider = 'apple'
   AND apple_revocation_status = 'not_required';

CREATE INDEX IF NOT EXISTS firebase_identity_deletion_apple_due_idx
  ON firebase_identity_deletion_outbox(next_attempt_at, created_at)
  WHERE apple_revocation_status IN ('pending', 'retry');
