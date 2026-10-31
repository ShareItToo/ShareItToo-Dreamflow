DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_quotes WHERE handover_at IS NOT NULL OR return_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM bookings WHERE handover_at IS NOT NULL OR return_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM platform_contracts WHERE handover_at IS NOT NULL OR return_at IS NOT NULL) THEN
    RAISE EXCEPTION 'booking_exact_time_snapshot_active_rows';
  END IF;
END
$$;

ALTER TABLE booking_quotes DROP CONSTRAINT IF EXISTS booking_quotes_exact_time_snapshot_check;
ALTER TABLE booking_quotes DROP COLUMN IF EXISTS time_snapshot_version, DROP COLUMN IF EXISTS handover_at, DROP COLUMN IF EXISTS return_at;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_exact_time_snapshot_check;
ALTER TABLE bookings DROP COLUMN IF EXISTS time_snapshot_version, DROP COLUMN IF EXISTS handover_at, DROP COLUMN IF EXISTS return_at;
ALTER TABLE platform_contracts DROP CONSTRAINT IF EXISTS platform_contracts_exact_time_snapshot_check;
ALTER TABLE platform_contracts DROP COLUMN IF EXISTS time_snapshot_version, DROP COLUMN IF EXISTS handover_at, DROP COLUMN IF EXISTS return_at;
