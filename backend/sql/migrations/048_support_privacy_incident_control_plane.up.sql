-- S3T / SUP-128 to SUP-129: non-live personal-data incident awareness,
-- containment evidence and a 72-hour human notification-decision deadline.
-- This migration cannot send an authority or affected-person notification.

CREATE TABLE support_privacy_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES support_cases(id) ON DELETE RESTRICT,
  incident_version TEXT NOT NULL CHECK (
    incident_version = 'sit_privacy_incident_v1'
  ),
  breach_awareness_at TIMESTAMPTZ NOT NULL,
  notification_deadline_at TIMESTAMPTZ NOT NULL,
  reminder_at TIMESTAMPTZ NOT NULL,
  deadline_policy_version TEXT NOT NULL CHECK (
    deadline_policy_version = 'gdpr-art33-awareness-72h-v1'
  ),
  containment_status TEXT NOT NULL CHECK (
    containment_status IN ('pending', 'partial', 'contained')
  ),
  assessment_status TEXT NOT NULL CHECK (
    assessment_status = 'pending_human_assessment'
  ),
  authority_notification_status TEXT NOT NULL CHECK (
    authority_notification_status = 'not_decided'
  ),
  affected_person_notification_status TEXT NOT NULL CHECK (
    affected_person_notification_status = 'not_decided'
  ),
  external_notifications_sent BOOLEAN NOT NULL DEFAULT false CHECK (
    NOT external_notifications_sent
  ),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (notification_deadline_at = breach_awareness_at + INTERVAL '72 hours'),
  CHECK (reminder_at = notification_deadline_at - INTERVAL '12 hours'),
  CHECK (created_at = breach_awareness_at),
  CHECK (updated_at >= created_at)
);

CREATE INDEX support_privacy_incident_deadline_queue_idx
  ON support_privacy_incidents(notification_deadline_at, reminder_at, case_id)
  WHERE authority_notification_status = 'not_decided';

CREATE OR REPLACE FUNCTION sit_validate_support_privacy_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id FOR UPDATE;
    IF NOT FOUND
      OR target_case.case_type <> 'privacy_security'
      OR target_case.case_subtype NOT IN (
        'unauthorized_data_exposure',
        'suspected_personal_data_breach',
        'wrong_recipient_or_wrong_account'
      )
      OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
      OR target_case.approval_level <> 'red_explicit_decision'
      OR NOT target_case.privacy_flag
      OR NEW.breach_awareness_at IS DISTINCT FROM target_case.created_at
      OR NEW.created_at IS DISTINCT FROM target_case.created_at
      OR NEW.updated_at IS DISTINCT FROM target_case.created_at
    THEN
      RAISE EXCEPTION 'support_privacy_incident_case_required'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'support_privacy_incident_append_only'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.incident_version IS DISTINCT FROM OLD.incident_version
    OR NEW.breach_awareness_at IS DISTINCT FROM OLD.breach_awareness_at
    OR NEW.notification_deadline_at IS DISTINCT FROM OLD.notification_deadline_at
    OR NEW.reminder_at IS DISTINCT FROM OLD.reminder_at
    OR NEW.deadline_policy_version IS DISTINCT FROM OLD.deadline_policy_version
    OR NEW.assessment_status IS DISTINCT FROM OLD.assessment_status
    OR NEW.authority_notification_status IS DISTINCT FROM OLD.authority_notification_status
    OR NEW.affected_person_notification_status
      IS DISTINCT FROM OLD.affected_person_notification_status
    OR NEW.external_notifications_sent IS DISTINCT FROM OLD.external_notifications_sent
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.lock_version <> OLD.lock_version + 1
    OR NEW.updated_at <= OLD.updated_at
    OR (OLD.containment_status = 'partial' AND NEW.containment_status = 'pending')
    OR (OLD.containment_status = 'contained'
      AND NEW.containment_status IS DISTINCT FROM OLD.containment_status)
  THEN
    RAISE EXCEPTION 'support_privacy_incident_transition_invalid'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_privacy_incidents_validate
BEFORE INSERT OR UPDATE OR DELETE ON support_privacy_incidents
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_privacy_incident();

CREATE TABLE support_privacy_incident_containment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES support_privacy_incidents(id) ON DELETE RESTRICT,
  action_version TEXT NOT NULL CHECK (
    action_version = 'sit_privacy_incident_containment_v1'
  ),
  action_code TEXT NOT NULL CHECK (action_code IN (
    'test_access_revoked',
    'test_recipient_access_restricted',
    'test_session_revoked',
    'test_storage_visibility_restricted',
    'test_misconfiguration_isolated'
  )),
  outcome TEXT NOT NULL CHECK (outcome IN ('successful', 'unsuccessful')),
  action_reference TEXT NOT NULL CHECK (
    char_length(action_reference) BETWEEN 3 AND 200
    AND action_reference ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$'
  ),
  containment_status_after TEXT NOT NULL CHECK (
    containment_status_after IN ('partial', 'contained')
  ),
  recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_session_id UUID NOT NULL,
  staff_elevation_id UUID NOT NULL,
  expected_incident_version INTEGER NOT NULL CHECK (expected_incident_version > 0),
  external_notification_sent BOOLEAN NOT NULL DEFAULT false CHECK (
    NOT external_notification_sent
  ),
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TIMESTAMPTZ NOT NULL,
  CHECK (outcome = 'successful' OR containment_status_after <> 'contained')
);

CREATE INDEX support_privacy_incident_containment_idx
  ON support_privacy_incident_containment_actions(incident_id, recorded_at, id);

CREATE OR REPLACE FUNCTION sit_validate_support_privacy_incident_action()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_incident support_privacy_incidents%ROWTYPE;
  target_case support_cases%ROWTYPE;
  target_actor users%ROWTYPE;
  target_session auth_sessions%ROWTYPE;
  target_elevation staff_elevations%ROWTYPE;
BEGIN
  SELECT * INTO target_incident FROM support_privacy_incidents
    WHERE id = NEW.incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_privacy_incident_required'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO target_case FROM support_cases WHERE id = target_incident.case_id;
  SELECT * INTO target_actor FROM users WHERE id = NEW.recorded_by;
  SELECT * INTO target_session FROM auth_sessions WHERE id = NEW.recorded_session_id;
  SELECT * INTO target_elevation FROM staff_elevations WHERE id = NEW.staff_elevation_id;
  IF target_case.id IS NULL
    OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
    OR target_case.status IN ('resolved', 'closed')
    OR target_incident.containment_status = 'contained'
    OR target_incident.lock_version <> NEW.expected_incident_version
    OR target_actor.id IS NULL
    OR target_actor.role <> 'admin'
    OR target_actor.account_status <> 'active'
    OR target_actor.deactivated_at IS NOT NULL
    OR target_session.id IS NULL
    OR target_session.user_id <> NEW.recorded_by
    OR target_session.revoked_at IS NOT NULL
    OR target_elevation.id IS NULL
    OR target_elevation.user_id <> NEW.recorded_by
    OR target_elevation.session_id <> NEW.recorded_session_id
    OR target_elevation.role <> 'admin'
    OR target_elevation.revoked_at IS NOT NULL
    OR target_elevation.expires_at <= NEW.recorded_at
    OR NEW.recorded_at < clock_timestamp() - INTERVAL '30 seconds'
    OR NEW.recorded_at > clock_timestamp() + INTERVAL '30 seconds'
  THEN
    RAISE EXCEPTION 'support_privacy_incident_action_authorization_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_apply_support_privacy_incident_action()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE support_privacy_incidents
     SET containment_status = NEW.containment_status_after,
         lock_version = lock_version + 1,
         updated_at = NEW.recorded_at
   WHERE id = NEW.incident_id
     AND lock_version = NEW.expected_incident_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_privacy_incident_action_version_conflict'
      USING ERRCODE = '40001';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sit_reject_support_privacy_incident_action_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'support_privacy_incident_action_append_only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER support_privacy_incident_actions_validate
BEFORE INSERT ON support_privacy_incident_containment_actions
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_privacy_incident_action();

CREATE TRIGGER support_privacy_incident_actions_apply
AFTER INSERT ON support_privacy_incident_containment_actions
FOR EACH ROW EXECUTE FUNCTION sit_apply_support_privacy_incident_action();

CREATE TRIGGER support_privacy_incident_actions_append_only
BEFORE UPDATE OR DELETE ON support_privacy_incident_containment_actions
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_privacy_incident_action_mutation();

CREATE INDEX support_case_events_privacy_incident_alert_idx
  ON support_case_events(event_type, created_at DESC, case_id)
  WHERE event_type IN (
    'support.privacy_incident.notification_decision_deadline_near',
    'support.privacy_incident.notification_decision_deadline_overdue'
  );
