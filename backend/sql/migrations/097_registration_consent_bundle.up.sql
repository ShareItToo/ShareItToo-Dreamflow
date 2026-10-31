ALTER TABLE legal_declarations
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

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
  ADD CONSTRAINT legal_declarations_registration_bundle_metadata_check CHECK (
    declaration_type <> 'account_registration_bundle'
    OR (
      accepted = TRUE
      AND metadata ->> 'type' = 'account_registration_bundle'
      AND metadata ->> 'actionLabel' IS NOT NULL
      AND metadata ->> 'exactCtaText' IS NOT NULL
      AND metadata ? 'facts'
      AND metadata ? 'documents'
      AND metadata ->> 'appVersion' IS NOT NULL
      AND metadata ->> 'language' IS NOT NULL
      AND metadata ->> 'declaredAt' IS NOT NULL
      AND metadata ->> 'localTestOnly' = 'false'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS legal_declarations_registration_bundle_user_idx
  ON legal_declarations(user_id, declaration_type)
  WHERE declaration_type = 'account_registration_bundle';
