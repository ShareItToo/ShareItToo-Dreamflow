CREATE TABLE support_break_glass_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL,
  staff_elevation_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'p0_immediate_safety_response',
    'p0_incident_containment',
    'p0_assignment_failure_continuity'
  )),
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 12 AND 500),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'completed', 'escalated')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_session_id UUID,
  review_staff_elevation_id UUID,
  reviewed_at TIMESTAMPTZ,
  review_outcome TEXT CHECK (
    review_outcome IS NULL OR review_outcome IN ('appropriate', 'concern_escalated')
  ),
  review_notes TEXT CHECK (
    review_notes IS NULL OR char_length(review_notes) BETWEEN 12 AND 1000
  ),
  review_idempotency_key TEXT UNIQUE,
  UNIQUE (actor_id, session_id, idempotency_key),
  CHECK (expires_at > created_at),
  CHECK (expires_at <= created_at + interval '5 minutes'),
  CHECK (review_due_at = expires_at),
  CHECK (last_used_at IS NULL OR (last_used_at >= created_at AND last_used_at <= expires_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (
    (review_status = 'pending'
      AND reviewed_by IS NULL
      AND reviewed_session_id IS NULL
      AND review_staff_elevation_id IS NULL
      AND reviewed_at IS NULL
      AND review_outcome IS NULL
      AND review_notes IS NULL
      AND review_idempotency_key IS NULL
      AND revoked_at IS NULL)
    OR
    (review_status IN ('completed', 'escalated')
      AND reviewed_by IS NOT NULL
      AND reviewed_session_id IS NOT NULL
      AND review_staff_elevation_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND review_outcome IS NOT NULL
      AND review_notes IS NOT NULL
      AND review_idempotency_key IS NOT NULL
      AND revoked_at IS NOT NULL
      AND revoked_at = reviewed_at)
  )
);

CREATE INDEX support_break_glass_review_queue_idx
  ON support_break_glass_grants(review_status, review_due_at, created_at, id);
CREATE INDEX support_break_glass_case_access_idx
  ON support_break_glass_grants(case_id, actor_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION sit_validate_support_break_glass_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  target_actor users%ROWTYPE;
  target_session auth_sessions%ROWTYPE;
  target_elevation staff_elevations%ROWTYPE;
BEGIN
  IF NEW.created_at < clock_timestamp() - interval '30 seconds'
    OR NEW.created_at > clock_timestamp() + interval '30 seconds'
  THEN
    RAISE EXCEPTION 'Break-glass creation time must match database time';
  END IF;

  SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id;
  IF NOT FOUND
    OR target_case.priority <> 'p0'
    OR target_case.status IN ('resolved', 'closed')
    OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
  THEN
    RAISE EXCEPTION 'Break-glass requires an active non-live P0 support case';
  END IF;
  IF target_case.current_owner_id = NEW.actor_id THEN
    RAISE EXCEPTION 'Break-glass is not available to the assigned owner';
  END IF;

  SELECT * INTO target_actor FROM users WHERE id = NEW.actor_id;
  IF NOT FOUND
    OR target_actor.role <> 'support'
    OR target_actor.account_status <> 'active'
    OR target_actor.deactivated_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'Break-glass actor must be active support staff';
  END IF;

  SELECT * INTO target_session FROM auth_sessions WHERE id = NEW.session_id;
  IF target_session.id IS NULL
    OR target_session.user_id <> NEW.actor_id
    OR target_session.revoked_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'Break-glass requires the actor current active session';
  END IF;

  SELECT * INTO target_elevation FROM staff_elevations WHERE id = NEW.staff_elevation_id;
  IF target_elevation.id IS NULL
    OR target_elevation.user_id <> NEW.actor_id
    OR target_elevation.session_id <> NEW.session_id
    OR target_elevation.role <> 'support'
    OR target_elevation.revoked_at IS NOT NULL
    OR target_elevation.expires_at < NEW.expires_at
  THEN
    RAISE EXCEPTION 'Break-glass requires matching active staff step-up';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_break_glass_insert_guard
BEFORE INSERT ON support_break_glass_grants
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_break_glass_insert();

CREATE OR REPLACE FUNCTION sit_validate_support_break_glass_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  reviewer users%ROWTYPE;
  reviewer_session auth_sessions%ROWTYPE;
  reviewer_elevation staff_elevations%ROWTYPE;
  target_case support_cases%ROWTYPE;
  target_actor users%ROWTYPE;
  target_session auth_sessions%ROWTYPE;
  target_elevation staff_elevations%ROWTYPE;
BEGIN
  IF ROW(
    NEW.id, NEW.case_id, NEW.actor_id, NEW.session_id, NEW.staff_elevation_id,
    NEW.token_hash, NEW.reason_code, NEW.justification, NEW.idempotency_key,
    NEW.created_at, NEW.expires_at, NEW.review_due_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.case_id, OLD.actor_id, OLD.session_id, OLD.staff_elevation_id,
    OLD.token_hash, OLD.reason_code, OLD.justification, OLD.idempotency_key,
    OLD.created_at, OLD.expires_at, OLD.review_due_at
  ) THEN
    RAISE EXCEPTION 'Break-glass grant core is immutable';
  END IF;

  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'Break-glass revocation is irreversible';
  END IF;
  IF OLD.revoked_at IS NULL
    AND NEW.revoked_at IS NOT NULL
    AND NEW.review_status = 'pending'
  THEN
    RAISE EXCEPTION 'Break-glass revocation requires completed independent review';
  END IF;
  IF NEW.last_used_at IS NOT NULL
    AND (
      NEW.last_used_at < NEW.created_at
      OR NEW.last_used_at > NEW.expires_at
      OR NEW.last_used_at > clock_timestamp() + interval '30 seconds'
    )
  THEN
    RAISE EXCEPTION 'Break-glass use must occur inside the grant window';
  END IF;
  IF NEW.last_used_at IS DISTINCT FROM OLD.last_used_at
    AND NEW.last_used_at IS NOT NULL
  THEN
    SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id;
    SELECT * INTO target_actor FROM users WHERE id = NEW.actor_id;
    SELECT * INTO target_session FROM auth_sessions WHERE id = NEW.session_id;
    SELECT * INTO target_elevation FROM staff_elevations WHERE id = NEW.staff_elevation_id;
    IF NEW.revoked_at IS NOT NULL
      OR target_case.id IS NULL
      OR target_case.priority <> 'p0'
      OR target_case.status IN ('resolved', 'closed')
      OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
      OR target_actor.id IS NULL
      OR target_actor.role <> 'support'
      OR target_actor.account_status <> 'active'
      OR target_actor.deactivated_at IS NOT NULL
      OR target_session.id IS NULL
      OR target_session.user_id <> NEW.actor_id
      OR target_session.revoked_at IS NOT NULL
      OR target_elevation.id IS NULL
      OR target_elevation.user_id <> NEW.actor_id
      OR target_elevation.session_id <> NEW.session_id
      OR target_elevation.role <> 'support'
      OR target_elevation.revoked_at IS NOT NULL
      OR target_elevation.expires_at <= NEW.last_used_at
    THEN
      RAISE EXCEPTION 'Break-glass use requires the active P0 case and bound staff step-up';
    END IF;
  END IF;
  IF NEW.revoked_at IS NOT NULL
    AND NEW.revoked_at > clock_timestamp() + interval '30 seconds'
  THEN
    RAISE EXCEPTION 'Break-glass revocation time cannot be in the future';
  END IF;
  IF OLD.last_used_at IS NOT NULL
    AND (NEW.last_used_at IS NULL OR NEW.last_used_at < OLD.last_used_at)
  THEN
    RAISE EXCEPTION 'Break-glass last-use truth is monotonic';
  END IF;

  IF OLD.review_status <> 'pending' AND ROW(
    NEW.review_status, NEW.reviewed_by, NEW.reviewed_session_id,
    NEW.review_staff_elevation_id, NEW.reviewed_at,
    NEW.review_outcome, NEW.review_notes, NEW.review_idempotency_key
  ) IS DISTINCT FROM ROW(
    OLD.review_status, OLD.reviewed_by, OLD.reviewed_session_id,
    OLD.review_staff_elevation_id, OLD.reviewed_at,
    OLD.review_outcome, OLD.review_notes, OLD.review_idempotency_key
  ) THEN
    RAISE EXCEPTION 'Break-glass review is immutable after completion';
  END IF;
  IF OLD.review_status = 'pending' AND NEW.review_status <> 'pending' THEN
    IF NEW.review_status NOT IN ('completed', 'escalated')
      OR NEW.reviewed_by IS NULL
      OR NEW.reviewed_session_id IS NULL
      OR NEW.review_staff_elevation_id IS NULL
      OR NEW.reviewed_at IS NULL
      OR NEW.reviewed_at < NEW.review_due_at
      OR NEW.reviewed_at > clock_timestamp() + interval '30 seconds'
      OR NEW.reviewed_by = NEW.actor_id
      OR NEW.review_outcome IS NULL
      OR NEW.review_notes IS NULL
      OR NEW.review_idempotency_key IS NULL
    THEN
      RAISE EXCEPTION 'Break-glass review completion is incomplete';
    END IF;
    SELECT * INTO reviewer FROM users WHERE id = NEW.reviewed_by;
    IF NOT FOUND
      OR reviewer.role <> 'admin'
      OR reviewer.account_status <> 'active'
      OR reviewer.deactivated_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Break-glass review requires an independent active administrator';
    END IF;
    SELECT * INTO reviewer_session FROM auth_sessions WHERE id = NEW.reviewed_session_id;
    SELECT * INTO reviewer_elevation FROM staff_elevations
      WHERE id = NEW.review_staff_elevation_id;
    IF reviewer_session.id IS NULL
      OR reviewer_session.user_id <> NEW.reviewed_by
      OR reviewer_session.revoked_at IS NOT NULL
      OR reviewer_elevation.id IS NULL
      OR reviewer_elevation.user_id <> NEW.reviewed_by
      OR reviewer_elevation.session_id <> NEW.reviewed_session_id
      OR reviewer_elevation.role <> 'admin'
      OR reviewer_elevation.revoked_at IS NOT NULL
      OR reviewer_elevation.expires_at <= NEW.reviewed_at
    THEN
      RAISE EXCEPTION 'Break-glass review requires matching active administrator step-up';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_break_glass_update_guard
BEFORE UPDATE ON support_break_glass_grants
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_break_glass_update();

CREATE TRIGGER support_break_glass_delete_guard
BEFORE DELETE ON support_break_glass_grants
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();
