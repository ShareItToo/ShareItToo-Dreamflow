-- S2 is a simulation-only approval ledger. It records proposals, explicit
-- review and verified implementation evidence, but executes no measure.

ALTER TABLE support_decisions
  ALTER COLUMN approved_by DROP NOT NULL,
  ALTER COLUMN measure_type SET NOT NULL,
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'superseded')
  ),
  ADD COLUMN payload_sha256 CHAR(64),
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approval_payload_sha256 CHAR(64),
  ADD COLUMN rejected_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN rejected_at TIMESTAMPTZ,
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN implementation_reference TEXT,
  ADD COLUMN implementation_verified_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN implementation_verified_at TIMESTAMPTZ,
  ADD COLUMN implementation_failure_reason TEXT,
  ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_decisions WHERE payload_sha256 IS NULL) THEN
    RAISE EXCEPTION 'Support decision approval migration blocked: pre-existing decision lacks an immutable payload hash';
  END IF;
END;
$$;

ALTER TABLE support_decisions
  ALTER COLUMN payload_sha256 SET NOT NULL,
  ADD CONSTRAINT support_decisions_payload_hash_check CHECK (
    payload_sha256 ~ '^[0-9a-f]{64}$'
    AND (approval_payload_sha256 IS NULL OR approval_payload_sha256 ~ '^[0-9a-f]{64}$')
  ),
  ADD CONSTRAINT support_decisions_measure_scope_check CHECK (
    automation_used = false
    AND measure_type IN (
      'information_only', 'no_measure', 'simulated_refund_review',
      'simulated_payout_review', 'temporary_safety_review',
      'moderation_review', 'privacy_response_review', 'legal_response_review'
    )
    AND (
      (measure_type IN ('simulated_refund_review', 'simulated_payout_review')
        AND amount_minor IS NOT NULL AND amount_minor <= 9007199254740991
        AND currency = 'EUR')
      OR
      (measure_type NOT IN ('simulated_refund_review', 'simulated_payout_review')
        AND amount_minor IS NULL AND currency IS NULL)
    )
  ),
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
  ADD CONSTRAINT support_decisions_implementation_truth_check CHECK (
    (implementation_status IN ('not_started', 'pending')
      AND implementation_reference IS NULL
      AND implementation_failure_reason IS NULL
      AND implementation_verified_by IS NULL
      AND implementation_verified_at IS NULL
      AND implemented_at IS NULL)
    OR
    (implementation_status IN ('succeeded', 'reversed')
      AND implementation_reference IS NOT NULL
      AND char_length(implementation_reference) BETWEEN 3 AND 2000
      AND implementation_failure_reason IS NULL
      AND implementation_verified_by IS NOT NULL
      AND implementation_verified_at IS NOT NULL
      AND implemented_at IS NOT NULL)
    OR
    (implementation_status = 'failed'
      AND implementation_reference IS NULL
      AND implementation_failure_reason IS NOT NULL
      AND char_length(implementation_failure_reason) BETWEEN 3 AND 2000
      AND implementation_verified_by IS NOT NULL
      AND implementation_verified_at IS NOT NULL
      AND implemented_at IS NULL)
  );

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_pending_decision_required CHECK (
    status <> 'decision_pending_approval' OR decision_id IS NOT NULL
  );

CREATE UNIQUE INDEX support_decisions_one_open_per_case_idx
  ON support_decisions(case_id)
  WHERE approval_status IN ('pending', 'approved')
    AND implementation_status <> 'reversed';

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

CREATE TRIGGER support_decisions_update_guard
BEFORE UPDATE ON support_decisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_decision_update();

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
    (OLD.status = 'under_review' AND NEW.status = 'resolved'
      AND OLD.approval_level = 'green_automatic' AND NEW.decision_id IS NULL) OR
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
  IF NEW.status = 'decision_pending_approval' AND NOT EXISTS (
    SELECT 1 FROM support_decisions
     WHERE id = NEW.decision_id AND case_id = NEW.id
       AND approval_status = 'pending'
  ) THEN
    RAISE EXCEPTION 'support_case_pending_decision_invalid' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'decision_pending_approval' AND NEW.status = 'under_review'
    AND NOT EXISTS (
      SELECT 1 FROM support_decisions
       WHERE id = OLD.decision_id AND case_id = OLD.id
         AND approval_status IN ('rejected', 'superseded')
    ) THEN
    RAISE EXCEPTION 'support_case_decision_review_pending' USING ERRCODE = '23514';
  END IF;
  IF NEW.decision_id IS DISTINCT FROM OLD.decision_id AND NOT (
    NEW.status = 'decision_pending_approval'
    OR
    (OLD.status = 'decision_pending_approval' AND NEW.status = 'under_review'
      AND NEW.decision_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'support_case_decision_binding_invalid' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'decided' AND NOT EXISTS (
    SELECT 1 FROM support_decisions
     WHERE id = NEW.decision_id AND case_id = NEW.id
       AND approval_status = 'approved'
       AND approval_payload_sha256 = payload_sha256
  ) THEN
    RAISE EXCEPTION 'support_case_approved_decision_invalid' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'decision_pending_approval' AND NEW.status = 'decided'
    AND NEW.decision_id IS DISTINCT FROM OLD.decision_id THEN
    RAISE EXCEPTION 'support_case_decision_id_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'resolved'
    AND NOT (
      NEW.approval_level = 'green_automatic' AND NEW.decision_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM support_decisions
       WHERE id = NEW.decision_id AND case_id = NEW.id
         AND approval_status = 'approved'
         AND approval_payload_sha256 = payload_sha256
         AND implementation_status = 'succeeded'
         AND implementation_verified_by IS NOT NULL
         AND implementation_verified_at IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'support_case_implementation_not_verified' USING ERRCODE = '23514';
  END IF;
  IF NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'support_case_updated_at_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
