DROP INDEX IF EXISTS firebase_identity_deletion_apple_due_idx;

ALTER TABLE firebase_identity_deletion_outbox
  DROP CONSTRAINT IF EXISTS firebase_identity_deletion_apple_attempts_check,
  DROP CONSTRAINT IF EXISTS firebase_identity_deletion_apple_kind_check,
  DROP CONSTRAINT IF EXISTS firebase_identity_deletion_apple_status_check;

ALTER TABLE auth_identities
  DROP CONSTRAINT IF EXISTS auth_identities_apple_material_kind_check;

ALTER TABLE firebase_identity_deletion_outbox
  DROP COLUMN IF EXISTS apple_revocation_last_error_code,
  DROP COLUMN IF EXISTS apple_revocation_locked_at,
  DROP COLUMN IF EXISTS apple_revocation_attempts,
  DROP COLUMN IF EXISTS apple_revocation_material_ciphertext,
  DROP COLUMN IF EXISTS apple_revocation_material_kind,
  DROP COLUMN IF EXISTS apple_revocation_status,
  DROP COLUMN IF EXISTS firebase_deleted_at;

ALTER TABLE auth_identities
  DROP COLUMN IF EXISTS apple_revocation_material_ciphertext,
  DROP COLUMN IF EXISTS apple_revocation_material_kind;
