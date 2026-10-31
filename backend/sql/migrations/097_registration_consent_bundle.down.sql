DROP INDEX IF EXISTS legal_declarations_registration_bundle_user_idx;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM legal_declarations
    WHERE declaration_type = 'account_registration_bundle'
  ) THEN
    RAISE EXCEPTION 'registration_consent_bundles_active_rows';
  END IF;
END
$$;
ALTER TABLE legal_declarations
  DROP CONSTRAINT IF EXISTS legal_declarations_registration_bundle_metadata_check;

ALTER TABLE legal_declarations
  DROP CONSTRAINT IF EXISTS legal_declarations_check;
ALTER TABLE legal_declarations
  ADD CONSTRAINT legal_declarations_check CHECK (
    (declaration_type = 'account_private' AND listing_id IS NULL AND booking_id IS NULL)
    OR (declaration_type = 'listing_private' AND listing_id IS NOT NULL AND booking_id IS NULL)
    OR (
      declaration_type IN (
        'booking_private',
        'binding_booking_request',
        'platform_terms',
        'early_performance',
        'withdrawal_knowledge',
        'owner_booking_acceptance',
        'platform_withdrawal'
      )
      AND listing_id IS NULL
      AND booking_id IS NOT NULL
    )
  );

ALTER TABLE legal_declarations
  DROP CONSTRAINT IF EXISTS legal_declarations_declaration_type_check;
ALTER TABLE legal_declarations
  ADD CONSTRAINT legal_declarations_declaration_type_check CHECK (
    declaration_type IN (
      'account_private',
      'listing_private',
      'booking_private',
      'binding_booking_request',
      'platform_terms',
      'early_performance',
      'withdrawal_knowledge',
      'owner_booking_acceptance',
      'platform_withdrawal'
    )
  );

ALTER TABLE legal_declarations
  DROP COLUMN IF EXISTS metadata;
