ALTER TABLE firebase_identity_deletion_outbox
  DROP CONSTRAINT firebase_identity_deletion_apple_kind_check,
  ADD CONSTRAINT firebase_identity_deletion_apple_kind_check
  CHECK (apple_revocation_material_kind IS NULL
      OR apple_revocation_material_kind IN ('authorization_code', 'refresh_token'));

ALTER TABLE auth_identities
  DROP CONSTRAINT auth_identities_apple_material_kind_check,
  ADD CONSTRAINT auth_identities_apple_material_kind_check
  CHECK (apple_revocation_material_kind IS NULL
      OR apple_revocation_material_kind IN ('authorization_code', 'refresh_token'));
