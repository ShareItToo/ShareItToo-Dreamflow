-- S3S / SUP-123 to SUP-127: non-live privacy-rights request control plane.
-- It tracks intake, a conservative response deadline, identity verification,
-- legal-hold separation and one reasoned extension. It does not disclose data
-- or execute erasure by itself.

CREATE TABLE support_privacy_rights_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL UNIQUE REFERENCES support_cases(id) ON DELETE RESTRICT,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_version TEXT NOT NULL CHECK (
    request_version = 'sit_privacy_rights_request_v1'
  ),
  request_kind TEXT NOT NULL CHECK (request_kind IN (
    'access', 'rectification', 'erasure', 'restriction', 'objection', 'portability'
  )),
  identity_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    identity_status IN ('pending', 'verified')
  ),
  identity_verified_at TIMESTAMPTZ,
  identity_verification_session_id UUID,
  processing_status TEXT NOT NULL DEFAULT 'identity_pending' CHECK (
    processing_status IN ('identity_pending', 'under_review', 'completed')
  ),
  received_at TIMESTAMPTZ NOT NULL,
  first_response_due_at TIMESTAMPTZ NOT NULL,
  response_due_at TIMESTAMPTZ NOT NULL,
  reminder_at TIMESTAMPTZ NOT NULL,
  deadline_policy_version TEXT NOT NULL CHECK (
    deadline_policy_version = 'gdpr-art12-conservative-calendar-month-v1'
  ),
  extension_count SMALLINT NOT NULL DEFAULT 0 CHECK (extension_count IN (0, 1)),
  completed_at TIMESTAMPTZ,
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (first_response_due_at > received_at),
  CHECK (response_due_at >= first_response_due_at),
  CHECK (reminder_at = response_due_at - INTERVAL '72 hours'),
  CHECK (
    (identity_status = 'pending' AND identity_verified_at IS NULL
      AND identity_verification_session_id IS NULL
      AND processing_status = 'identity_pending')
    OR
    (identity_status = 'verified' AND identity_verified_at IS NOT NULL
      AND identity_verification_session_id IS NOT NULL
      AND processing_status IN ('under_review', 'completed'))
  ),
  CHECK (
    (processing_status = 'completed' AND completed_at IS NOT NULL)
    OR (processing_status <> 'completed' AND completed_at IS NULL)
  ),
  CHECK (
    (extension_count = 0 AND response_due_at = first_response_due_at)
    OR (extension_count = 1 AND response_due_at > first_response_due_at)
  )
);

CREATE INDEX support_privacy_rights_due_queue_idx
  ON support_privacy_rights_requests(response_due_at, reminder_at, case_id)
  WHERE processing_status <> 'completed';
CREATE INDEX support_privacy_rights_subject_idx
  ON support_privacy_rights_requests(subject_user_id, received_at DESC, id DESC);

CREATE TABLE support_privacy_identity_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privacy_request_id UUID NOT NULL UNIQUE
    REFERENCES support_privacy_rights_requests(id) ON DELETE RESTRICT,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL,
  verification_method TEXT NOT NULL CHECK (verification_method = 'account_password'),
  idempotency_key TEXT NOT NULL UNIQUE,
  verified_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE support_privacy_deadline_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privacy_request_id UUID NOT NULL UNIQUE
    REFERENCES support_privacy_rights_requests(id) ON DELETE RESTRICT,
  previous_due_at TIMESTAMPTZ NOT NULL,
  extended_due_at TIMESTAMPTZ NOT NULL,
  user_facing_reason TEXT NOT NULL CHECK (
    char_length(user_facing_reason) BETWEEN 20 AND 2000
  ),
  recorded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recorded_session_id UUID NOT NULL,
  staff_elevation_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TIMESTAMPTZ NOT NULL,
  CHECK (extended_due_at > previous_due_at)
);

CREATE OR REPLACE FUNCTION sit_validate_support_privacy_request()
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
      OR target_case.reporter_user_id <> NEW.subject_user_id
      OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
      OR target_case.approval_level <> 'red_explicit_decision'
      OR NOT target_case.privacy_flag
      OR (
        target_case.case_subtype = 'access_or_copy_request'
        AND NEW.request_kind NOT IN ('access', 'portability')
      )
      OR (
        target_case.case_subtype = 'correction_or_deletion_request'
        AND NEW.request_kind NOT IN ('rectification', 'erasure')
      )
      OR (
        target_case.case_subtype = 'objection_or_restriction_request'
        AND NEW.request_kind NOT IN ('objection', 'restriction')
      )
      OR target_case.case_subtype NOT IN (
        'access_or_copy_request', 'correction_or_deletion_request',
        'objection_or_restriction_request'
      )
    THEN
      RAISE EXCEPTION 'support_privacy_rights_case_required'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.received_at IS DISTINCT FROM target_case.created_at
      OR NEW.created_at IS DISTINCT FROM target_case.created_at
      OR NEW.updated_at IS DISTINCT FROM target_case.created_at
      OR NEW.first_response_due_at < NEW.received_at + INTERVAL '25 days'
      OR NEW.first_response_due_at > NEW.received_at + INTERVAL '32 days'
    THEN
      RAISE EXCEPTION 'support_privacy_rights_deadline_invalid'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'support_privacy_rights_request_append_only'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
    OR NEW.request_version IS DISTINCT FROM OLD.request_version
    OR NEW.request_kind IS DISTINCT FROM OLD.request_kind
    OR NEW.received_at IS DISTINCT FROM OLD.received_at
    OR NEW.first_response_due_at IS DISTINCT FROM OLD.first_response_due_at
    OR NEW.deadline_policy_version IS DISTINCT FROM OLD.deadline_policy_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.lock_version <> OLD.lock_version + 1
    OR NEW.updated_at <= OLD.updated_at
  THEN
    RAISE EXCEPTION 'support_privacy_rights_request_immutable_fields'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.identity_status = 'verified'
    AND (
      NEW.identity_status IS DISTINCT FROM OLD.identity_status
      OR NEW.identity_verified_at IS DISTINCT FROM OLD.identity_verified_at
      OR NEW.identity_verification_session_id
        IS DISTINCT FROM OLD.identity_verification_session_id
    )
  THEN
    RAISE EXCEPTION 'support_privacy_identity_verification_immutable'
      USING ERRCODE = '55000';
  END IF;
  IF NEW.extension_count < OLD.extension_count
    OR NEW.extension_count > OLD.extension_count + 1
    OR (NEW.extension_count = OLD.extension_count
      AND (
        NEW.response_due_at IS DISTINCT FROM OLD.response_due_at
        OR NEW.reminder_at IS DISTINCT FROM OLD.reminder_at
      ))
  THEN
    RAISE EXCEPTION 'support_privacy_extension_transition_invalid'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.processing_status = 'completed'
    AND (
      NEW.processing_status IS DISTINCT FROM OLD.processing_status
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    )
  THEN
    RAISE EXCEPTION 'support_privacy_completion_immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_privacy_rights_requests_validate
BEFORE INSERT OR UPDATE OR DELETE ON support_privacy_rights_requests
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_privacy_request();

CREATE OR REPLACE FUNCTION sit_validate_support_privacy_identity_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_request support_privacy_rights_requests%ROWTYPE;
  target_user users%ROWTYPE;
  target_session auth_sessions%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'support_privacy_identity_verification_append_only'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO target_request FROM support_privacy_rights_requests
    WHERE id = NEW.privacy_request_id FOR UPDATE;
  SELECT * INTO target_user FROM users WHERE id = NEW.subject_user_id;
  SELECT * INTO target_session FROM auth_sessions WHERE id = NEW.session_id;
  IF NOT FOUND
    OR target_request.subject_user_id <> NEW.subject_user_id
    OR target_request.identity_status <> 'pending'
    OR target_request.processing_status <> 'identity_pending'
    OR target_user.id IS NULL
    OR target_user.account_status <> 'active'
    OR target_user.deactivated_at IS NOT NULL
    OR target_session.id IS NULL
    OR target_session.user_id <> NEW.subject_user_id
    OR target_session.revoked_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'support_privacy_active_subject_session_required'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.verified_at < clock_timestamp() - INTERVAL '30 seconds'
    OR NEW.verified_at > clock_timestamp() + INTERVAL '30 seconds'
  THEN
    RAISE EXCEPTION 'support_privacy_database_time_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_privacy_identity_verifications_validate
BEFORE INSERT OR UPDATE OR DELETE ON support_privacy_identity_verifications
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_privacy_identity_verification();

CREATE OR REPLACE FUNCTION sit_validate_support_privacy_extension()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_request support_privacy_rights_requests%ROWTYPE;
  target_actor users%ROWTYPE;
  target_session auth_sessions%ROWTYPE;
  target_elevation staff_elevations%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'support_privacy_extension_append_only'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO target_request FROM support_privacy_rights_requests
    WHERE id = NEW.privacy_request_id FOR UPDATE;
  SELECT * INTO target_actor FROM users WHERE id = NEW.recorded_by;
  SELECT * INTO target_session FROM auth_sessions WHERE id = NEW.recorded_session_id;
  SELECT * INTO target_elevation FROM staff_elevations WHERE id = NEW.staff_elevation_id;
  IF target_request.id IS NULL
    OR target_request.processing_status = 'completed'
    OR target_request.extension_count <> 0
    OR target_request.response_due_at IS DISTINCT FROM NEW.previous_due_at
    OR NEW.recorded_at > target_request.first_response_due_at
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
  THEN
    RAISE EXCEPTION 'support_privacy_extension_authorization_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.extended_due_at < target_request.received_at + INTERVAL '84 days'
    OR NEW.extended_due_at > target_request.received_at + INTERVAL '94 days'
  THEN
    RAISE EXCEPTION 'support_privacy_extension_deadline_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_privacy_deadline_extensions_validate
BEFORE INSERT OR UPDATE OR DELETE ON support_privacy_deadline_extensions
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_privacy_extension();

CREATE INDEX support_case_events_privacy_deadline_alert_idx
  ON support_case_events(event_type, created_at DESC, case_id)
  WHERE event_type IN (
    'support.privacy_rights.deadline_near',
    'support.privacy_rights.deadline_overdue'
  );
