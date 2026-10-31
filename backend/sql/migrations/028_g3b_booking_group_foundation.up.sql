-- G3B: disabled same-owner multi-item foundation. This migration only adds
-- normalized, append-only aggregate and position records. It does not create
-- a route, contract, reservation, payment instruction or public behavior.

CREATE TABLE IF NOT EXISTS booking_groups (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^booking_group_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  aggregate_version INTEGER NOT NULL DEFAULT 1 CHECK (aggregate_version = 1),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  renter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  marketplace_context TEXT NOT NULL DEFAULT 'private_c2c'
    CHECK (marketplace_context = 'private_c2c'),
  country_code CHAR(2) NOT NULL DEFAULT 'DE' CHECK (country_code = 'DE'),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rental_start_date DATE NOT NULL,
  rental_end_date DATE NOT NULL,
  rental_timezone TEXT NOT NULL CHECK (char_length(rental_timezone) BETWEEN 1 AND 120),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  handover_location_key CHAR(64) NOT NULL
    CHECK (handover_location_key ~ '^[0-9a-f]{64}$'),
  handover_policy_version TEXT NOT NULL CHECK (
    char_length(handover_policy_version) BETWEEN 1 AND 120
    AND handover_policy_version ~ '^[A-Za-z0-9_.:-]+$'
  ),
  legal_document_set_version TEXT NOT NULL CHECK (
    char_length(legal_document_set_version) BETWEEN 1 AND 120
    AND legal_document_set_version ~ '^[A-Za-z0-9_.:-]+$'
  ),
  cancellation_policy_version TEXT NOT NULL CHECK (
    char_length(cancellation_policy_version) BETWEEN 1 AND 120
    AND cancellation_policy_version ~ '^[A-Za-z0-9_.:-]+$'
  ),
  payment_configuration_key TEXT NOT NULL CHECK (
    char_length(payment_configuration_key) BETWEEN 1 AND 120
    AND payment_configuration_key ~ '^[A-Za-z0-9_.:-]+$'
  ),
  compatibility_hash CHAR(64) NOT NULL CHECK (compatibility_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (owner_id <> renter_id),
  CHECK (rental_start_date < rental_end_date),
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS booking_groups_owner_created_idx
  ON booking_groups(owner_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS booking_groups_renter_created_idx
  ON booking_groups(renter_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS booking_groups_compatibility_idx
  ON booking_groups(compatibility_hash, created_at DESC, id);

CREATE TABLE IF NOT EXISTS booking_group_positions (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^booking_group_position_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  position_version INTEGER NOT NULL DEFAULT 1 CHECK (position_version = 1),
  booking_group_id TEXT NOT NULL
    REFERENCES booking_groups(id) ON DELETE RESTRICT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  booking_id TEXT UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  quote_id TEXT REFERENCES booking_quotes(id) ON DELETE RESTRICT,
  quote_hash CHAR(64) CHECK (quote_hash IS NULL OR quote_hash ~ '^[0-9a-f]{64}$'),
  currency CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  rental_subtotal_minor BIGINT CHECK (
    rental_subtotal_minor IS NULL OR rental_subtotal_minor >= 0
  ),
  platform_fee_minor BIGINT CHECK (platform_fee_minor IS NULL OR platform_fee_minor >= 0),
  total_minor BIGINT CHECK (total_minor IS NULL OR total_minor >= 0),
  owner_payout_minor BIGINT CHECK (owner_payout_minor IS NULL OR owner_payout_minor >= 0),
  security_deposit_minor BIGINT CHECK (
    security_deposit_minor IS NULL OR security_deposit_minor = 0
  ),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_group_id, listing_id),
  UNIQUE (booking_group_id, sort_order),
  CHECK (
    (
      quote_id IS NULL
      AND quote_hash IS NULL
      AND currency IS NULL
      AND rental_subtotal_minor IS NULL
      AND platform_fee_minor IS NULL
      AND total_minor IS NULL
      AND owner_payout_minor IS NULL
      AND security_deposit_minor IS NULL
      AND booking_id IS NULL
    )
    OR
    (
      quote_id IS NOT NULL
      AND quote_hash IS NOT NULL
      AND currency IS NOT NULL
      AND rental_subtotal_minor IS NOT NULL
      AND platform_fee_minor IS NOT NULL
      AND total_minor IS NOT NULL
      AND owner_payout_minor IS NOT NULL
      AND security_deposit_minor = 0
      AND rental_subtotal_minor <= owner_payout_minor
      AND owner_payout_minor + platform_fee_minor = total_minor
    )
  )
);

CREATE INDEX IF NOT EXISTS booking_group_positions_group_order_idx
  ON booking_group_positions(booking_group_id, sort_order, id);
CREATE INDEX IF NOT EXISTS booking_group_positions_listing_idx
  ON booking_group_positions(listing_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS booking_group_positions_quote_idx
  ON booking_group_positions(quote_id) WHERE quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_position()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group booking_groups%ROWTYPE;
  target_listing listings%ROWTYPE;
  target_quote booking_quotes%ROWTYPE;
  target_booking bookings%ROWTYPE;
  normalized_listing_country TEXT;
BEGIN
  SELECT * INTO target_group
    FROM booking_groups WHERE id = NEW.booking_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_group_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO target_listing
    FROM listings WHERE id = NEW.listing_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_group_listing_not_found' USING ERRCODE = '23503';
  END IF;

  normalized_listing_country := CASE lower(COALESCE(target_listing.country, ''))
    WHEN 'de' THEN 'DE'
    WHEN 'deutschland' THEN 'DE'
    WHEN 'germany' THEN 'DE'
    ELSE ''
  END;
  IF target_listing.owner_id <> target_group.owner_id THEN
    RAISE EXCEPTION 'booking_group_position_owner_mismatch' USING ERRCODE = '23514';
  END IF;
  IF target_listing.currency <> target_group.currency THEN
    RAISE EXCEPTION 'booking_group_position_currency_mismatch' USING ERRCODE = '23514';
  END IF;
  IF normalized_listing_country <> target_group.country_code THEN
    RAISE EXCEPTION 'booking_group_position_country_mismatch' USING ERRCODE = '23514';
  END IF;

  IF NEW.quote_id IS NOT NULL THEN
    SELECT * INTO target_quote
      FROM booking_quotes WHERE id = NEW.quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking_group_position_quote_not_found' USING ERRCODE = '23503';
    END IF;
    IF target_quote.renter_id <> target_group.renter_id
      OR target_quote.listing_id <> NEW.listing_id
      OR target_quote.rental_start_date <> target_group.rental_start_date
      OR target_quote.rental_end_date <> target_group.rental_end_date
      OR target_quote.rental_timezone <> target_group.rental_timezone
      OR target_quote.starts_at <> target_group.starts_at
      OR target_quote.ends_at <> target_group.ends_at
      OR target_quote.currency <> target_group.currency
      OR target_quote.quote_hash <> NEW.quote_hash
      OR target_quote.total_minor <> NEW.total_minor
      OR sit_try_numeric(target_quote.quote_payload->>'rentalSubtotalMinor')
           IS DISTINCT FROM NEW.rental_subtotal_minor::numeric
      OR sit_try_numeric(target_quote.quote_payload->>'platformFeeMinor')
           IS DISTINCT FROM NEW.platform_fee_minor::numeric
      OR sit_try_numeric(target_quote.quote_payload->>'ownerPayoutMinor')
           IS DISTINCT FROM NEW.owner_payout_minor::numeric
      OR sit_try_numeric(target_quote.quote_payload->>'securityDepositMinor')
           IS DISTINCT FROM NEW.security_deposit_minor::numeric
    THEN
      RAISE EXCEPTION 'booking_group_position_quote_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.booking_id IS NOT NULL THEN
    SELECT * INTO target_booking
      FROM bookings WHERE id = NEW.booking_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking_group_position_booking_not_found' USING ERRCODE = '23503';
    END IF;
    IF target_booking.listing_id <> NEW.listing_id
      OR target_booking.owner_id <> target_group.owner_id
      OR target_booking.renter_id <> target_group.renter_id
      OR target_booking.starts_at <> target_group.starts_at
      OR target_booking.ends_at <> target_group.ends_at
      OR target_booking.currency <> target_group.currency
      OR target_booking.quoted_total_minor IS DISTINCT FROM NEW.total_minor
    THEN
      RAISE EXCEPTION 'booking_group_position_booking_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_group_positions_context_guard
  ON booking_group_positions;
CREATE TRIGGER booking_group_positions_context_guard
BEFORE INSERT ON booking_group_positions
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_position();

DROP TRIGGER IF EXISTS booking_groups_append_only ON booking_groups;
CREATE TRIGGER booking_groups_append_only
BEFORE UPDATE OR DELETE ON booking_groups
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS booking_group_positions_append_only
  ON booking_group_positions;
CREATE TRIGGER booking_group_positions_append_only
BEFORE UPDATE OR DELETE ON booking_group_positions
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
