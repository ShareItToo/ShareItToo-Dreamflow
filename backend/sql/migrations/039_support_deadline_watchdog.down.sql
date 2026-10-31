DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support_case_events
     WHERE event_type IN (
       'support.operational_alert.p0_without_owner',
       'support.operational_alert.next_update_overdue'
     )
  ) THEN
    RAISE EXCEPTION 'Cannot roll back support deadline watchdog while alert truth exists';
  END IF;
END;
$$;

DROP INDEX IF EXISTS support_case_events_operational_alert_idx;
DROP TABLE support_deadline_watchdog_state;
