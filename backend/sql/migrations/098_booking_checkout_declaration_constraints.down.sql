DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM legal_declarations
     WHERE declaration_type IN (
       'private_terms_and_platform_terms',
       'early_performance_and_withdrawal'
     )
  ) THEN
    RAISE EXCEPTION 'v52_booking_declaration_rows_active';
  END IF;
END
$$;

ALTER TABLE legal_declarations
  DROP CONSTRAINT IF EXISTS legal_declarations_check;
ALTER TABLE legal_declarations
  ADD CONSTRAINT legal_declarations_check CHECK (
    (declaration_type IN ('account_private', 'account_registration_bundle')
      AND listing_id IS NULL AND booking_id IS NULL)
    OR (declaration_type = 'listing_private'
      AND listing_id IS NOT NULL AND booking_id IS NULL)
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
      'account_registration_bundle',
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
