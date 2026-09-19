-- Privat-Pilot V4 interim foundation. This migration stores binding pilot
-- declarations, evidence, return/case state and payout instructions. Real
-- payment movement remains separately feature-gated until live approval.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS private_use_confirmed_at TIMESTAMPTZ;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS private_status_confirmed_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS private_status_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_t0 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_state TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS return_report_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_clarification_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_instruction_due_at TIMESTAMPTZ;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_return_state_check,
  ADD CONSTRAINT bookings_return_state_check CHECK (
    return_state IN (
      'not_started',
      'awaitingReturnConfirmation',
      'reportWindowOpen',
      'needsReview',
      'payoutEligible',
      'closed'
    )
  );

CREATE TABLE IF NOT EXISTS legal_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  listing_id TEXT REFERENCES listings(id) ON DELETE RESTRICT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  declaration_type TEXT NOT NULL CHECK (
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
  ),
  exact_wording TEXT NOT NULL CHECK (length(exact_wording) > 0),
  document_name TEXT NOT NULL CHECK (length(document_name) > 0),
  document_version TEXT NOT NULL CHECK (length(document_version) > 0),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT NOT NULL CHECK (length(app_version) > 0),
  language TEXT NOT NULL DEFAULT 'de' CHECK (language ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  accepted BOOLEAN NOT NULL,
  CHECK (
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
  )
);
CREATE INDEX IF NOT EXISTS legal_declarations_user_time_idx
  ON legal_declarations(user_id, declared_at DESC);
CREATE INDEX IF NOT EXISTS legal_declarations_listing_idx
  ON legal_declarations(listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS legal_declarations_booking_idx
  ON legal_declarations(booking_id) WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sit_reject_declaration_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Legal declarations are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS legal_declarations_append_only ON legal_declarations;
CREATE TRIGGER legal_declarations_append_only
BEFORE UPDATE OR DELETE ON legal_declarations
FOR EACH ROW EXECUTE FUNCTION sit_reject_declaration_mutation();

CREATE TABLE IF NOT EXISTS booking_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  opened_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL CHECK (length(reason) > 0),
  substantiated BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'needsReview', 'awaitingResponse', 'unresolved', 'closed')
  ),
  contested_authorized_minor BIGINT CHECK (contested_authorized_minor >= 0),
  undisputed_releasable_minor BIGINT CHECK (undisputed_releasable_minor >= 0),
  response_due_at TIMESTAMPTZ,
  next_status_update_due_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS booking_cases_booking_status_idx
  ON booking_cases(booking_id, status, opened_at DESC);
