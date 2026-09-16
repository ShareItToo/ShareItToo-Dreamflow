DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM audit_log
     WHERE action IN (
       'booking.exact_address_revealed',
       'booking.exact_address_access_hidden',
       'booking.exact_address_access_denied'
     )
  ) THEN
    RAISE EXCEPTION
      'cannot roll back booking address reveal guard while audit evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_booking_address_access_guard ON audit_log;
DROP FUNCTION IF EXISTS sit_validate_booking_address_access_audit();
DROP INDEX IF EXISTS audit_log_booking_address_request_idx;
