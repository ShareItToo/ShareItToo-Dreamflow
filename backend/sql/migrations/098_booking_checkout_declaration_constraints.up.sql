-- V5.2 checkout declarations are booking-bound rows written by the booking
-- workflow dual-write. Keep the existing declaration vocabulary and scope;
-- this successor only admits the two exact V5.2 checkout-bound types.

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
      'private_terms_and_platform_terms',
      'early_performance_and_withdrawal',
      'platform_terms',
      'early_performance',
      'withdrawal_knowledge',
      'owner_booking_acceptance',
      'platform_withdrawal'
    )
  );

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
        'private_terms_and_platform_terms',
        'early_performance_and_withdrawal',
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
