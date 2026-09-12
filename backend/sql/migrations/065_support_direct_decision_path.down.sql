-- Roll back the direct single-reviewer decision path without deleting any
-- support decision or changing its payload. Rows using the direct path block
-- rollback and require explicit review.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support_decisions
     WHERE approval_path = 'direct_single_reviewer'
  ) THEN
    RAISE EXCEPTION 'support_direct_decision_rollback_requires_manual_review'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER support_decisions_insert_path_guard ON support_decisions;
DROP FUNCTION sit_validate_support_decision_insert_path();

ALTER TABLE support_decisions
  DROP CONSTRAINT support_decisions_approval_truth_check,
  ADD CONSTRAINT support_decisions_approval_truth_check CHECK (
    (approval_status = 'pending'
      AND approved_by IS NULL AND approved_at IS NULL
      AND approval_payload_sha256 IS NULL
      AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
    OR
    (approval_status = 'approved'
      AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND approved_by <> decided_by
      AND approval_payload_sha256 = payload_sha256
      AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
    OR
    (approval_status = 'rejected'
      AND approved_by IS NULL AND approved_at IS NULL
      AND approval_payload_sha256 IS NULL
      AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL
      AND char_length(rejection_reason) BETWEEN 3 AND 2000)
    OR
    (approval_status = 'superseded'
      AND approved_by IS NULL AND approved_at IS NULL
      AND approval_payload_sha256 IS NULL
      AND rejected_by IS NULL AND rejected_at IS NULL AND rejection_reason IS NULL)
  ),
  DROP COLUMN approval_path;

CREATE OR REPLACE FUNCTION sit_validate_support_decision_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'support_decision_lock_version_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'support_decision_updated_at_invalid' USING ERRCODE = '23514';
  END IF;
  IF ROW(
    NEW.case_id, NEW.decision_code, NEW.decision_scope,
    NEW.confirmed_facts_considered, NEW.material_uncertainties,
    NEW.policy_snapshot_id, NEW.rule_reference, NEW.measure_type,
    NEW.amount_minor, NEW.currency, NEW.duration, NEW.affected_entity_ids,
    NEW.unaffected_areas, NEW.implementation_plan, NEW.automation_used,
    NEW.recommendation_id, NEW.decided_by, NEW.user_facing_reason,
    NEW.internal_reason, NEW.redress_route, NEW.payload_sha256,
    NEW.idempotency_key, NEW.decided_at
  ) IS DISTINCT FROM ROW(
    OLD.case_id, OLD.decision_code, OLD.decision_scope,
    OLD.confirmed_facts_considered, OLD.material_uncertainties,
    OLD.policy_snapshot_id, OLD.rule_reference, OLD.measure_type,
    OLD.amount_minor, OLD.currency, OLD.duration, OLD.affected_entity_ids,
    OLD.unaffected_areas, OLD.implementation_plan, OLD.automation_used,
    OLD.recommendation_id, OLD.decided_by, OLD.user_facing_reason,
    OLD.internal_reason, OLD.redress_route, OLD.payload_sha256,
    OLD.idempotency_key, OLD.decided_at
  ) THEN
    RAISE EXCEPTION 'support_decision_payload_immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.approval_status <> 'pending'
    AND ROW(
      NEW.approval_status, NEW.approved_by, NEW.approved_at,
      NEW.approval_payload_sha256, NEW.rejected_by, NEW.rejected_at,
      NEW.rejection_reason
    ) IS DISTINCT FROM ROW(
      OLD.approval_status, OLD.approved_by, OLD.approved_at,
      OLD.approval_payload_sha256, OLD.rejected_by, OLD.rejected_at,
      OLD.rejection_reason
    ) THEN
    RAISE EXCEPTION 'support_decision_approval_final' USING ERRCODE = '23514';
  END IF;
  IF OLD.approval_status = 'pending' AND NEW.approval_status <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM support_cases
       WHERE id = OLD.case_id
         AND status = 'decision_pending_approval'
         AND decision_id = OLD.id
    ) THEN
    RAISE EXCEPTION 'support_decision_case_not_pending_approval'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.implementation_status IS DISTINCT FROM OLD.implementation_status
    AND NOT EXISTS (
      SELECT 1 FROM support_cases
       WHERE id = OLD.case_id
         AND status IN ('decided', 'implementation_pending')
         AND operating_mode IN ('simulation', 'internal_testing')
         AND decision_id = OLD.id
    ) THEN
    RAISE EXCEPTION 'support_decision_implementation_case_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.implementation_status = NEW.implementation_status
    AND ROW(
      NEW.implementation_reference, NEW.implementation_verified_by,
      NEW.implementation_verified_at, NEW.implementation_failure_reason,
      NEW.implemented_at
    ) IS DISTINCT FROM ROW(
      OLD.implementation_reference, OLD.implementation_verified_by,
      OLD.implementation_verified_at, OLD.implementation_failure_reason,
      OLD.implemented_at
    ) THEN
    RAISE EXCEPTION 'support_decision_implementation_evidence_immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.implementation_status = 'succeeded'
    AND NEW.implementation_status NOT IN ('succeeded', 'reversed') THEN
    RAISE EXCEPTION 'support_decision_implementation_regression' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_support_decision_communication_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.user_facing_decision,
    NEW.user_facing_effect,
    NEW.user_facing_implementation_result
  ) IS DISTINCT FROM ROW(
    OLD.user_facing_decision,
    OLD.user_facing_effect,
    OLD.user_facing_implementation_result
  ) THEN
    RAISE EXCEPTION 'support_decision_payload_immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.communicated_at IS NOT NULL
    AND ROW(
      NEW.communicated_at, NEW.communicated_by, NEW.communication_payload_sha256
    ) IS DISTINCT FROM ROW(
      OLD.communicated_at, OLD.communicated_by, OLD.communication_payload_sha256
    ) THEN
    RAISE EXCEPTION 'support_decision_communication_final' USING ERRCODE = '23514';
  END IF;
  IF NEW.communicated_at IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.communicated_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM support_cases
       WHERE id = NEW.case_id AND decision_id = NEW.id
         AND status IN ('decided', 'implementation_pending')
         AND operating_mode IN ('simulation', 'internal_testing')
    ) THEN
    RAISE EXCEPTION 'support_decision_communication_case_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
