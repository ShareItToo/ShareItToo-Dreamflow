ALTER TABLE support_cases
  ADD COLUMN appeal_configured_at TIMESTAMPTZ,
  ADD COLUMN appeal_configured_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_cases_appeal_configuration_truth CHECK (
    (appeal_configured_at IS NULL AND appeal_configured_by IS NULL)
    OR (appeal_configured_at IS NOT NULL AND appeal_configured_by IS NOT NULL)
  );

ALTER TABLE support_appeals
  ADD COLUMN human_readable_appeal_number TEXT,
  ADD COLUMN next_update_at TIMESTAMPTZ,
  ADD CONSTRAINT support_appeals_user_receipt_truth CHECK (
    (human_readable_appeal_number IS NULL AND next_update_at IS NULL)
    OR (
      human_readable_appeal_number ~ '^SIT-R-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$'
      AND next_update_at IS NOT NULL
      AND next_update_at > submitted_at
    )
  );

CREATE UNIQUE INDEX support_appeals_human_number_unique
  ON support_appeals(human_readable_appeal_number)
  WHERE human_readable_appeal_number IS NOT NULL;

CREATE UNIQUE INDEX support_appeals_decision_submitter_unique
  ON support_appeals(original_decision_id, submitted_by);

CREATE OR REPLACE FUNCTION sit_validate_support_appeal_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  support_case_record support_cases%ROWTYPE;
BEGIN
  SELECT * INTO support_case_record
    FROM support_cases
   WHERE id = NEW.case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_appeal_case_not_found' USING ERRCODE = '23514';
  END IF;
  IF support_case_record.operating_mode NOT IN ('simulation', 'internal_testing') THEN
    RAISE EXCEPTION 'support_appeal_live_mode_forbidden' USING ERRCODE = '23514';
  END IF;
  IF support_case_record.status <> 'closed'
    OR support_case_record.appeal_available IS NOT TRUE
    OR support_case_record.appeal_id IS NOT NULL
    OR support_case_record.appeal_configured_at IS NULL
    OR support_case_record.appeal_configured_by IS NULL
    OR support_case_record.appeal_deadline IS NULL
    OR support_case_record.appeal_deadline <= NEW.submitted_at THEN
    RAISE EXCEPTION 'support_appeal_window_closed' USING ERRCODE = '23514';
  END IF;
  IF NEW.submitted_by IS DISTINCT FROM support_case_record.reporter_user_id THEN
    RAISE EXCEPTION 'support_appeal_reporter_required' USING ERRCODE = '23514';
  END IF;
  IF NEW.original_decision_id IS DISTINCT FROM support_case_record.decision_id THEN
    RAISE EXCEPTION 'support_appeal_decision_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.human_readable_appeal_number IS NULL OR NEW.next_update_at IS NULL THEN
    RAISE EXCEPTION 'support_appeal_receipt_incomplete' USING ERRCODE = '23514';
  END IF;
  IF cardinality(NEW.new_evidence_ids) <> 0 THEN
    RAISE EXCEPTION 'support_appeal_evidence_not_enabled' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM support_decisions AS decision
     WHERE decision.id = NEW.original_decision_id
       AND decision.case_id = NEW.case_id
       AND decision.approval_status = 'approved'
       AND decision.approval_payload_sha256 = decision.payload_sha256
       AND decision.implementation_status = 'succeeded'
       AND decision.implementation_verified_by IS NOT NULL
       AND decision.implementation_verified_at IS NOT NULL
       AND decision.communicated_at IS NOT NULL
       AND decision.communicated_by IS NOT NULL
       AND decision.communication_payload_sha256 = decision.payload_sha256
  ) THEN
    RAISE EXCEPTION 'support_appeal_decision_not_published' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_appeals_insert_guard
BEFORE INSERT ON support_appeals
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_appeal_insert();

CREATE OR REPLACE FUNCTION sit_validate_support_appeal_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.original_decision_id, NEW.case_id, NEW.grounds,
    NEW.new_evidence_ids, NEW.submitted_by, NEW.submitted_at,
    NEW.idempotency_key, NEW.human_readable_appeal_number,
    NEW.next_update_at
  ) IS DISTINCT FROM ROW(
    OLD.original_decision_id, OLD.case_id, OLD.grounds,
    OLD.new_evidence_ids, OLD.submitted_by, OLD.submitted_at,
    OLD.idempotency_key, OLD.human_readable_appeal_number,
    OLD.next_update_at
  ) THEN
    RAISE EXCEPTION 'support_appeal_submission_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_appeals_update_guard
BEFORE UPDATE ON support_appeals
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_appeal_update();

CREATE OR REPLACE FUNCTION sit_validate_support_case_appeal_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status <> 'closed' AND NEW.status = 'closed' THEN
    IF NEW.appeal_configured_at IS NULL OR NEW.appeal_configured_by IS NULL
      OR NEW.appeal_id IS NOT NULL THEN
      RAISE EXCEPTION 'support_appeal_configuration_required' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM users
       WHERE id = NEW.appeal_configured_by
         AND role IN ('support', 'admin')
         AND account_status = 'active'
         AND deactivated_at IS NULL
    ) THEN
      RAISE EXCEPTION 'support_appeal_configurator_invalid' USING ERRCODE = '23514';
    END IF;
    IF NEW.appeal_available THEN
      IF NEW.decision_id IS NULL OR NEW.appeal_deadline IS NULL
        OR NEW.appeal_deadline <= NEW.closed_at THEN
        RAISE EXCEPTION 'support_appeal_deadline_invalid' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM support_decisions AS decision
         WHERE decision.id = NEW.decision_id
           AND decision.case_id = NEW.id
           AND decision.approval_status = 'approved'
           AND decision.approval_payload_sha256 = decision.payload_sha256
           AND decision.implementation_status = 'succeeded'
           AND decision.implementation_verified_by IS NOT NULL
           AND decision.implementation_verified_at IS NOT NULL
           AND decision.communicated_at IS NOT NULL
           AND decision.communicated_by IS NOT NULL
           AND decision.communication_payload_sha256 = decision.payload_sha256
      ) THEN
        RAISE EXCEPTION 'support_appeal_requires_published_decision' USING ERRCODE = '23514';
      END IF;
    ELSIF NEW.appeal_deadline IS NOT NULL THEN
      RAISE EXCEPTION 'support_appeal_deadline_without_availability' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'closed' AND NEW.status = 'closed' THEN
    IF OLD.appeal_id IS NULL AND NEW.appeal_id IS NOT NULL THEN
      IF OLD.appeal_available IS NOT TRUE OR NEW.appeal_available IS NOT FALSE
        OR NEW.appeal_deadline IS DISTINCT FROM OLD.appeal_deadline
        OR NEW.appeal_configured_at IS DISTINCT FROM OLD.appeal_configured_at
        OR NEW.appeal_configured_by IS DISTINCT FROM OLD.appeal_configured_by
        OR NOT EXISTS (
          SELECT 1 FROM support_appeals AS appeal
           WHERE appeal.id = NEW.appeal_id
             AND appeal.case_id = NEW.id
             AND appeal.original_decision_id = NEW.decision_id
             AND appeal.submitted_by = NEW.reporter_user_id
        ) THEN
        RAISE EXCEPTION 'support_appeal_case_binding_invalid' USING ERRCODE = '23514';
      END IF;
    ELSIF ROW(
      NEW.appeal_available, NEW.appeal_deadline, NEW.appeal_id,
      NEW.appeal_configured_at, NEW.appeal_configured_by
    ) IS DISTINCT FROM ROW(
      OLD.appeal_available, OLD.appeal_deadline, OLD.appeal_id,
      OLD.appeal_configured_at, OLD.appeal_configured_by
    ) THEN
      RAISE EXCEPTION 'support_appeal_case_state_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.status = 'closed' AND NEW.status = 'reopened' THEN
    IF NEW.current_owner_id IS NULL OR NEW.next_update_at IS NULL
      OR NEW.reopen_reason IS NULL OR NEW.appeal_available IS NOT FALSE
      OR NEW.appeal_id IS DISTINCT FROM OLD.appeal_id
      OR NEW.appeal_deadline IS DISTINCT FROM OLD.appeal_deadline
      OR NEW.appeal_configured_at IS DISTINCT FROM OLD.appeal_configured_at
      OR NEW.appeal_configured_by IS DISTINCT FROM OLD.appeal_configured_by THEN
      RAISE EXCEPTION 'support_reopen_assignment_incomplete' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_case_appeal_update_guard
BEFORE UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_case_appeal_update();
