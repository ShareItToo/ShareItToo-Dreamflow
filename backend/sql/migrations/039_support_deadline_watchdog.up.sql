-- Non-live support deadline watchdog state. The singleton contains no user
-- content; durable alert history is recorded in append-only support events.

CREATE TABLE support_deadline_watchdog_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  worker_version TEXT NOT NULL CHECK (worker_version = 'support-deadline-watchdog-v1'),
  last_started_at TIMESTAMPTZ NOT NULL,
  last_succeeded_at TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  last_error_code TEXT CHECK (
    last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 240
  ),
  last_inspected_count INTEGER NOT NULL DEFAULT 0 CHECK (last_inspected_count >= 0),
  last_alert_count INTEGER NOT NULL DEFAULT 0 CHECK (last_alert_count >= 0),
  attempt_count BIGINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  success_count BIGINT NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (last_succeeded_at IS NULL OR last_succeeded_at >= last_started_at),
  CHECK (last_failed_at IS NULL OR last_failed_at >= last_started_at),
  CHECK (
    (last_error_code IS NULL AND last_failed_at IS NULL)
    OR (last_error_code IS NOT NULL AND last_failed_at IS NOT NULL)
  )
);

CREATE INDEX support_case_events_operational_alert_idx
  ON support_case_events(event_type, created_at DESC, case_id)
  WHERE event_type IN (
    'support.operational_alert.p0_without_owner',
    'support.operational_alert.next_update_overdue'
  );
