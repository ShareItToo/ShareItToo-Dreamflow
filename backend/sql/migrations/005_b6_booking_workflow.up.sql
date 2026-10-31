-- B6: authoritative availability, server-side quotes, idempotent booking workflow.
-- Additive by design. The B5 compatibility projection remains intact for image rollback.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS availability_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN IF NOT EXISTS availability_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS booking_notice_hours INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acceptance_window_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE listings
  ADD CONSTRAINT listings_availability_timezone_check
    CHECK (length(availability_timezone) BETWEEN 3 AND 80) NOT VALID,
  ADD CONSTRAINT listings_availability_revision_check
    CHECK (availability_revision > 0) NOT VALID,
  ADD CONSTRAINT listings_booking_notice_hours_check
    CHECK (booking_notice_hours BETWEEN 0 AND 8760) NOT VALID,
  ADD CONSTRAINT listings_acceptance_window_check
    CHECK (acceptance_window_minutes BETWEEN 5 AND 1440) NOT VALID;

ALTER TABLE listings VALIDATE CONSTRAINT listings_availability_timezone_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_availability_revision_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_booking_notice_hours_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_acceptance_window_check;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'requested',
  ADD COLUMN IF NOT EXISTS workflow_version SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workflow_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rental_start_date DATE,
  ADD COLUMN IF NOT EXISTS rental_end_date DATE,
  ADD COLUMN IF NOT EXISTS rental_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN IF NOT EXISTS quoted_days INTEGER,
  ADD COLUMN IF NOT EXISTS price_per_day_minor BIGINT,
  ADD COLUMN IF NOT EXISTS base_rental_minor BIGINT,
  ADD COLUMN IF NOT EXISTS discount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rental_subtotal_minor BIGINT,
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS delivery_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS express_fee_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_payout_minor BIGINT,
  ADD COLUMN IF NOT EXISTS quote_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quote_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;

UPDATE bookings AS booking
SET workflow_status = CASE booking.status
      WHEN 'accepted' THEN 'accepted'
      WHEN 'declined' THEN 'declined'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'running' THEN 'active'
      WHEN 'completed' THEN 'completed'
      ELSE 'requested'
    END,
    workflow_version = 1,
    workflow_revision = GREATEST(booking.workflow_revision, 1),
    rental_timezone = listing.availability_timezone,
    rental_start_date = (booking.starts_at AT TIME ZONE listing.availability_timezone)::date,
    rental_end_date = GREATEST(
      (booking.ends_at AT TIME ZONE listing.availability_timezone)::date,
      (booking.starts_at AT TIME ZONE listing.availability_timezone)::date + 1
    ),
    quoted_days = GREATEST(
      1,
      GREATEST(
        (booking.ends_at AT TIME ZONE listing.availability_timezone)::date,
        (booking.starts_at AT TIME ZONE listing.availability_timezone)::date + 1
      )
        - (booking.starts_at AT TIME ZONE listing.availability_timezone)::date
    ),
    price_per_day_minor = COALESCE(listing.price_per_day_minor, 0),
    base_rental_minor = COALESCE(booking.quoted_total_minor, listing.price_per_day_minor, 0),
    rental_subtotal_minor = COALESCE(booking.quoted_total_minor, listing.price_per_day_minor, 0),
    platform_fee_minor = 0,
    owner_payout_minor = COALESCE(booking.quoted_total_minor, listing.price_per_day_minor, 0),
    quote_breakdown = jsonb_build_object('source', 'b6_migration', 'legacyTotalMinor', booking.quoted_total_minor),
    requested_at = COALESCE(booking.requested_at, booking.created_at),
    accepted_at = CASE WHEN booking.status = 'accepted' THEN COALESCE(booking.accepted_at, booking.updated_at) ELSE booking.accepted_at END,
    active_at = CASE WHEN booking.status = 'running' THEN COALESCE(booking.active_at, booking.updated_at) ELSE booking.active_at END,
    completed_at = CASE WHEN booking.status = 'completed' THEN COALESCE(booking.completed_at, booking.updated_at) ELSE booking.completed_at END,
    declined_at = CASE WHEN booking.status = 'declined' THEN COALESCE(booking.declined_at, booking.updated_at) ELSE booking.declined_at END,
    cancelled_at = CASE WHEN booking.status = 'cancelled' THEN COALESCE(booking.cancelled_at, booking.updated_at) ELSE booking.cancelled_at END
FROM listings AS listing
WHERE listing.id = booking.listing_id;

ALTER TABLE bookings
  ALTER COLUMN rental_start_date SET NOT NULL,
  ALTER COLUMN rental_end_date SET NOT NULL,
  ALTER COLUMN quoted_days SET NOT NULL,
  ALTER COLUMN price_per_day_minor SET NOT NULL,
  ALTER COLUMN base_rental_minor SET NOT NULL,
  ALTER COLUMN rental_subtotal_minor SET NOT NULL,
  ALTER COLUMN platform_fee_minor SET NOT NULL,
  ALTER COLUMN owner_payout_minor SET NOT NULL;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_workflow_status_check
    CHECK (workflow_status IN (
      'draft', 'requested', 'accepted', 'payment_pending', 'confirmed',
      'active', 'returned', 'completed', 'declined', 'cancelled',
      'refunded', 'disputed'
    )) NOT VALID,
  ADD CONSTRAINT bookings_workflow_version_check
    CHECK (workflow_version IN (0, 1)) NOT VALID,
  ADD CONSTRAINT bookings_workflow_revision_check
    CHECK (workflow_revision > 0) NOT VALID,
  ADD CONSTRAINT bookings_rental_dates_check
    CHECK (rental_start_date < rental_end_date) NOT VALID,
  ADD CONSTRAINT bookings_quoted_days_check
    CHECK (quoted_days BETWEEN 1 AND 365) NOT VALID,
  ADD CONSTRAINT bookings_quote_version_check
    CHECK (quote_version > 0) NOT VALID,
  ADD CONSTRAINT bookings_quote_amounts_check
    CHECK (
      price_per_day_minor >= 0
      AND base_rental_minor >= 0
      AND discount_minor >= 0
      AND rental_subtotal_minor >= 0
      AND platform_fee_minor >= 0
      AND delivery_fee_minor >= 0
      AND pickup_fee_minor >= 0
      AND express_fee_minor >= 0
      AND owner_payout_minor >= 0
    ) NOT VALID;

ALTER TABLE bookings VALIDATE CONSTRAINT bookings_workflow_status_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_workflow_version_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_workflow_revision_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_rental_dates_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_quoted_days_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_quote_version_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_quote_amounts_check;

CREATE INDEX bookings_workflow_status_updated_idx
  ON bookings(workflow_status, updated_at DESC)
  WHERE workflow_version = 1;
CREATE INDEX bookings_listing_dates_idx
  ON bookings(listing_id, rental_start_date, rental_end_date)
  WHERE workflow_version = 1;
CREATE INDEX bookings_expiring_holds_idx
  ON bookings(hold_expires_at)
  WHERE workflow_version = 1
    AND workflow_status IN ('accepted', 'payment_pending')
    AND hold_expires_at IS NOT NULL;
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_from_status_check;
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_to_status_check;
ALTER TABLE booking_events
  ADD CONSTRAINT booking_events_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'pending', 'accepted', 'declined', 'cancelled', 'running', 'completed',
      'draft', 'requested', 'payment_pending', 'confirmed', 'active',
      'returned', 'refunded', 'disputed'
    )
  ),
  ADD CONSTRAINT booking_events_to_status_check CHECK (
    to_status IS NULL OR to_status IN (
      'pending', 'accepted', 'declined', 'cancelled', 'running', 'completed',
      'draft', 'requested', 'payment_pending', 'confirmed', 'active',
      'returned', 'refunded', 'disputed'
    )
  );

CREATE TABLE booking_commands (
  idempotency_key TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('booking.create', 'booking.amend', 'booking.transition')),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX booking_commands_booking_created_idx
  ON booking_commands(booking_id, created_at DESC);

CREATE OR REPLACE FUNCTION quarantine_legacy_booking_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.rental_start_date := COALESCE(
      NEW.rental_start_date,
      (NEW.starts_at AT TIME ZONE COALESCE(NEW.rental_timezone, 'Europe/Berlin'))::date
    );
    NEW.rental_end_date := COALESCE(NEW.rental_end_date, GREATEST(
      (NEW.ends_at AT TIME ZONE COALESCE(NEW.rental_timezone, 'Europe/Berlin'))::date,
      (NEW.starts_at AT TIME ZONE COALESCE(NEW.rental_timezone, 'Europe/Berlin'))::date + 1
    ));
    NEW.quoted_days := COALESCE(NEW.quoted_days, GREATEST(1, NEW.rental_end_date - NEW.rental_start_date));
    NEW.price_per_day_minor := COALESCE(
      NEW.price_per_day_minor,
      CASE
        WHEN NEW.quoted_total_minor IS NOT NULL
          THEN round(NEW.quoted_total_minor::numeric / NEW.quoted_days)::bigint
        ELSE 0
      END
    );
    NEW.base_rental_minor := COALESCE(NEW.base_rental_minor, NEW.quoted_total_minor, 0);
    NEW.rental_subtotal_minor := COALESCE(NEW.rental_subtotal_minor, NEW.quoted_total_minor, 0);
    NEW.platform_fee_minor := COALESCE(NEW.platform_fee_minor, 0);
    NEW.owner_payout_minor := COALESCE(NEW.owner_payout_minor, NEW.quoted_total_minor, 0);
    NEW.workflow_status := CASE NEW.status
      WHEN 'accepted' THEN 'accepted'
      WHEN 'declined' THEN 'declined'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'running' THEN 'active'
      WHEN 'completed' THEN 'completed'
      ELSE COALESCE(NEW.workflow_status, 'requested')
    END;
    NEW.requested_at := COALESCE(NEW.requested_at, NEW.created_at, now());
    NEW.quote_breakdown := COALESCE(NEW.quote_breakdown, '{}'::jsonb)
      || jsonb_build_object('source', 'legacy_rollback_quarantine');
    RETURN NEW;
  END IF;
  IF OLD.workflow_version = 1
     AND NEW.workflow_version = 1
     AND NEW.workflow_revision = OLD.workflow_revision
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.quoted_total_minor IS DISTINCT FROM OLD.quoted_total_minor
     ) THEN
    NEW.workflow_version := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_quarantine_legacy_write ON bookings;
CREATE TRIGGER bookings_quarantine_legacy_write
BEFORE INSERT OR UPDATE ON bookings
FOR EACH ROW EXECUTE FUNCTION quarantine_legacy_booking_write();
