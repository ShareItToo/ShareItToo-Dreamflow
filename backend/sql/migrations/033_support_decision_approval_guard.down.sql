-- Approval truth must not be discarded after any support decision exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_decisions) THEN
    RAISE EXCEPTION 'Support decision approval rollback blocked: decision data exists';
  END IF;
END;
$$;

DROP TRIGGER support_decisions_update_guard ON support_decisions;
DROP FUNCTION sit_validate_support_decision_update();
DROP INDEX support_decisions_one_open_per_case_idx;
ALTER TABLE support_cases DROP CONSTRAINT support_cases_pending_decision_required;

ALTER TABLE support_decisions
  DROP CONSTRAINT support_decisions_implementation_truth_check,
  DROP CONSTRAINT support_decisions_approval_truth_check,
  DROP CONSTRAINT support_decisions_measure_scope_check,
  DROP CONSTRAINT support_decisions_payload_hash_check,
  DROP COLUMN updated_at,
  DROP COLUMN lock_version,
  DROP COLUMN implementation_failure_reason,
  DROP COLUMN implementation_verified_at,
  DROP COLUMN implementation_verified_by,
  DROP COLUMN implementation_reference,
  DROP COLUMN rejection_reason,
  DROP COLUMN rejected_at,
  DROP COLUMN rejected_by,
  DROP COLUMN approval_payload_sha256,
  DROP COLUMN approved_at,
  DROP COLUMN payload_sha256,
  DROP COLUMN approval_status;

ALTER TABLE support_decisions ALTER COLUMN approved_by SET NOT NULL;
ALTER TABLE support_decisions ALTER COLUMN measure_type DROP NOT NULL;

CREATE OR REPLACE FUNCTION sit_validate_support_case_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'support_case_lock_version_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'received' AND NEW.status = 'acknowledged') OR
    (OLD.status = 'acknowledged' AND NEW.status IN ('waiting_for_user', 'waiting_for_other_party', 'under_review')) OR
    (OLD.status IN ('waiting_for_user', 'waiting_for_other_party') AND NEW.status = 'under_review') OR
    (OLD.status = 'under_review' AND NEW.status IN ('escalated', 'decision_pending_approval')) OR
    (OLD.status = 'escalated' AND NEW.status IN ('under_review', 'decision_pending_approval')) OR
    (OLD.status = 'decision_pending_approval' AND NEW.status IN ('decided', 'under_review')) OR
    (OLD.status = 'decided' AND NEW.status IN ('implementation_pending', 'resolved')) OR
    (OLD.status = 'implementation_pending' AND NEW.status IN ('resolved', 'under_review')) OR
    (OLD.status = 'resolved' AND NEW.status = 'closed') OR
    (OLD.status = 'closed' AND NEW.status = 'reopened') OR
    (OLD.status = 'reopened' AND NEW.status IN ('waiting_for_user', 'waiting_for_other_party', 'under_review'))
  ) THEN
    RAISE EXCEPTION 'support_case_transition_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'support_case_updated_at_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
