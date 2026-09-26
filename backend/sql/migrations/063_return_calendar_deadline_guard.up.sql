-- S4M / SUP-055 through SUP-065: server-owned return calendar deadlines.
-- Version 1 preserves pre-existing fixed-duration rows. Version 2 binds every
-- new V5.2 return case to the booking timezone and calendar-day semantics.

ALTER TABLE v52_return_cases
  ADD COLUMN deadline_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  ADD COLUMN deadline_policy_version SMALLINT NOT NULL DEFAULT 1;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'v52_return_cases'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%response_due_at%t1%5 days%'
  LOOP
    EXECUTE format('ALTER TABLE v52_return_cases DROP CONSTRAINT %I', constraint_name);
  END LOOP;

  FOR constraint_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'v52_return_cases'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%next_status_update_due_at%t1%7 days%'
  LOOP
    EXECUTE format('ALTER TABLE v52_return_cases DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE v52_return_cases
  ADD CONSTRAINT v52_return_cases_deadline_timezone_check CHECK (
    char_length(deadline_timezone) BETWEEN 3 AND 120
    AND (
      deadline_timezone = 'UTC'
      OR deadline_timezone ~ '^[A-Za-z]+(?:[-_][A-Za-z]+)*(?:/[A-Za-z0-9._+-]+)+$'
    )
  ),
  ADD CONSTRAINT v52_return_cases_deadline_policy_version_check CHECK (
    deadline_policy_version IN (1, 2)
  ),
  ADD CONSTRAINT v52_return_cases_response_calendar_check CHECK (
    (deadline_policy_version = 1 AND response_due_at = t1 + INTERVAL '5 days')
    OR
    (deadline_policy_version = 2 AND response_due_at = (
      (t1 AT TIME ZONE deadline_timezone) + INTERVAL '5 days'
    ) AT TIME ZONE deadline_timezone)
  ),
  ADD CONSTRAINT v52_return_cases_update_calendar_check CHECK (
    (deadline_policy_version = 1 AND next_status_update_due_at = t1 + INTERVAL '7 days')
    OR
    (deadline_policy_version = 2 AND next_status_update_due_at = (
      (t1 AT TIME ZONE deadline_timezone) + INTERVAL '7 days'
    ) AT TIME ZONE deadline_timezone)
  );
