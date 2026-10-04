-- Bind optional exact pickup/return instants to immutable quotes and contracts.
-- Null values preserve the pre-snapshot legacy flow, which still requires
-- counterparty proposal/confirmation before handover or return can start.

ALTER TABLE booking_quotes
  ADD COLUMN IF NOT EXISTS time_snapshot_version TEXT,
  ADD COLUMN IF NOT EXISTS handover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_at TIMESTAMPTZ;

ALTER TABLE booking_quotes
  ADD CONSTRAINT booking_quotes_exact_time_snapshot_check CHECK (
    (time_snapshot_version IS NULL AND handover_at IS NULL AND return_at IS NULL)
    OR (
      time_snapshot_version = 'booking-time-v1'
      AND handover_at IS NOT NULL
      AND return_at IS NOT NULL
      AND handover_at < return_at
    )
  ) NOT VALID;
ALTER TABLE booking_quotes VALIDATE CONSTRAINT booking_quotes_exact_time_snapshot_check;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS time_snapshot_version TEXT,
  ADD COLUMN IF NOT EXISTS handover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_exact_time_snapshot_check CHECK (
    (time_snapshot_version IS NULL AND handover_at IS NULL AND return_at IS NULL)
    OR (
      time_snapshot_version = 'booking-time-v1'
      AND handover_at IS NOT NULL
      AND return_at IS NOT NULL
      AND handover_at < return_at
    )
  ) NOT VALID;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_exact_time_snapshot_check;

ALTER TABLE platform_contracts
  ADD COLUMN IF NOT EXISTS time_snapshot_version TEXT,
  ADD COLUMN IF NOT EXISTS handover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_at TIMESTAMPTZ;

ALTER TABLE platform_contracts
  ADD CONSTRAINT platform_contracts_exact_time_snapshot_check CHECK (
    (time_snapshot_version IS NULL AND handover_at IS NULL AND return_at IS NULL)
    OR (
      time_snapshot_version = 'booking-time-v1'
      AND handover_at IS NOT NULL
      AND return_at IS NOT NULL
      AND handover_at < return_at
    )
  ) NOT VALID;
ALTER TABLE platform_contracts VALIDATE CONSTRAINT platform_contracts_exact_time_snapshot_check;

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
       OR NEW.time_snapshot_version IS DISTINCT FROM OLD.time_snapshot_version
       OR NEW.handover_at IS DISTINCT FROM OLD.handover_at
       OR NEW.return_at IS DISTINCT FROM OLD.return_at
     ) THEN
    NEW.workflow_version := 0;
  END IF;
  RETURN NEW;
END;
$$;
