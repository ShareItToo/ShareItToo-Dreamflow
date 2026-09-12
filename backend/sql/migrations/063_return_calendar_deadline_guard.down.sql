DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM v52_return_cases WHERE deadline_policy_version = 2
  ) THEN
    RAISE EXCEPTION '063 rollback refused: calendar-bound return cases exist';
  END IF;
END;
$$;

ALTER TABLE v52_return_cases
  DROP CONSTRAINT v52_return_cases_update_calendar_check,
  DROP CONSTRAINT v52_return_cases_response_calendar_check,
  DROP CONSTRAINT v52_return_cases_deadline_policy_version_check,
  DROP CONSTRAINT v52_return_cases_deadline_timezone_check,
  DROP COLUMN deadline_policy_version,
  DROP COLUMN deadline_timezone,
  ADD CHECK (response_due_at = t1 + INTERVAL '5 days'),
  ADD CHECK (next_status_update_due_at = t1 + INTERVAL '7 days');
