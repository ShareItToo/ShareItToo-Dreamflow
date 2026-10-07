-- S4BS / SUP-001..SUP-014: align the persisted support lifecycle with the
-- canonical Drive status machine. Source: 10_SIT_SUPPORT_STATUS_MACHINE_V1,
-- SHA-256 3cc58111a6079f9f82ce90d9fed18d4a8b10bd27191777ed30130d03fbbf2f55.
--
-- The former implementation_pending extension is retired without deleting
-- its compatibility column. Existing non-canonical data blocks migration so
-- that no case history is silently rewritten.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM support_cases
     WHERE status = 'implementation_pending'
        OR implementation_pending_action IS NOT NULL
  ) OR EXISTS (
    SELECT 1
      FROM support_case_events
     WHERE from_status = 'implementation_pending'
        OR to_status = 'implementation_pending'
  ) THEN
    RAISE EXCEPTION
      'support_status_machine_alignment_requires_manual_case_review'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_status_check,
  ADD CONSTRAINT support_cases_status_check CHECK (status IN (
    'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
    'under_review', 'escalated', 'decision_pending_approval', 'decided',
    'resolved', 'closed', 'reopened'
  )),
  ADD CONSTRAINT support_cases_implementation_pending_action_retired CHECK (
    implementation_pending_action IS NULL
  );

ALTER TABLE support_case_events
  DROP CONSTRAINT support_case_events_from_status_check,
  DROP CONSTRAINT support_case_events_to_status_check,
  ADD CONSTRAINT support_case_events_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
      'under_review', 'escalated', 'decision_pending_approval', 'decided',
      'resolved', 'closed', 'reopened'
    )
  ),
  ADD CONSTRAINT support_case_events_to_status_check CHECK (
    to_status IS NULL OR to_status IN (
      'received', 'acknowledged', 'waiting_for_user', 'waiting_for_other_party',
      'under_review', 'escalated', 'decision_pending_approval', 'decided',
      'resolved', 'closed', 'reopened'
    )
  );

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
    (OLD.status = 'acknowledged' AND NEW.status IN (
      'waiting_for_user', 'waiting_for_other_party', 'under_review'
    )) OR
    (OLD.status IN ('waiting_for_user', 'waiting_for_other_party')
      AND NEW.status = 'under_review') OR
    (OLD.status = 'under_review' AND NEW.status IN (
      'waiting_for_user', 'waiting_for_other_party', 'escalated',
      'decision_pending_approval', 'decided'
    )) OR
    (OLD.status = 'escalated' AND NEW.status = 'under_review') OR
    (OLD.status = 'decision_pending_approval'
      AND NEW.status IN ('decided', 'under_review')) OR
    (OLD.status = 'decided' AND NEW.status = 'resolved') OR
    (OLD.status = 'resolved' AND NEW.status = 'closed') OR
    (OLD.status = 'closed' AND NEW.status = 'reopened') OR
    (OLD.status = 'reopened' AND NEW.status = 'under_review')
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
    OR (OLD.status = 'under_review' AND NEW.status = 'decided')
    OR (OLD.status = 'decision_pending_approval' AND NEW.status = 'under_review'
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
  IF NEW.status = 'resolved' AND NOT EXISTS (
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
