-- S3F keeps final user communication simulation-only and binds every visible
-- statement to the exact payload that passed the existing four-eyes review.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_decisions WHERE communicated_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Support final-decision migration blocked: existing communication requires manual review';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM support_cases
     WHERE status IN ('resolved', 'closed')
       AND decision_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Support final-decision migration blocked: existing resolved decision requires manual review';
  END IF;
END;
$$;

ALTER TABLE support_decisions
  ADD COLUMN user_facing_decision TEXT,
  ADD COLUMN user_facing_effect TEXT,
  ADD COLUMN user_facing_implementation_result TEXT,
  ADD COLUMN communicated_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN communication_payload_sha256 CHAR(64),
  ADD CONSTRAINT support_decisions_user_publication_payload_check CHECK (
    (
      user_facing_decision IS NULL
      AND user_facing_effect IS NULL
      AND user_facing_implementation_result IS NULL
    )
    OR
    (
      char_length(user_facing_decision) BETWEEN 3 AND 4000
      AND char_length(user_facing_effect) BETWEEN 3 AND 4000
      AND char_length(user_facing_implementation_result) BETWEEN 3 AND 4000
    )
  ),
  ADD CONSTRAINT support_decisions_communication_truth_check CHECK (
    (
      communicated_at IS NULL
      AND communicated_by IS NULL
      AND communication_payload_sha256 IS NULL
    )
    OR
    (
      communicated_at IS NOT NULL
      AND communicated_by IS NOT NULL
      AND communication_payload_sha256 = payload_sha256
      AND communication_payload_sha256 ~ '^[0-9a-f]{64}$'
      AND approval_status = 'approved'
      AND approval_payload_sha256 = payload_sha256
      AND implementation_status = 'succeeded'
      AND implementation_verified_by IS NOT NULL
      AND implementation_verified_at IS NOT NULL
      AND implemented_at IS NOT NULL
      AND communicated_at >= implemented_at
      AND user_facing_decision IS NOT NULL
      AND user_facing_effect IS NOT NULL
      AND user_facing_implementation_result IS NOT NULL
    )
  );

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
      NEW.communicated_at,
      NEW.communicated_by,
      NEW.communication_payload_sha256
    ) IS DISTINCT FROM ROW(
      OLD.communicated_at,
      OLD.communicated_by,
      OLD.communication_payload_sha256
    ) THEN
    RAISE EXCEPTION 'support_decision_communication_final' USING ERRCODE = '23514';
  END IF;

  IF NEW.communicated_at IS NOT NULL
    AND (TG_OP = 'INSERT' OR OLD.communicated_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM support_cases
       WHERE id = NEW.case_id
         AND decision_id = NEW.id
         AND status IN ('decided', 'implementation_pending')
         AND operating_mode IN ('simulation', 'internal_testing')
    ) THEN
    RAISE EXCEPTION 'support_decision_communication_case_invalid' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_decisions_communication_guard
BEFORE INSERT OR UPDATE ON support_decisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_decision_communication_update();

CREATE OR REPLACE FUNCTION sit_validate_support_case_final_decision_publication()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'resolved'
    AND NEW.decision_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM support_decisions
       WHERE id = NEW.decision_id
         AND case_id = NEW.id
         AND approval_status = 'approved'
         AND approval_payload_sha256 = payload_sha256
         AND implementation_status = 'succeeded'
         AND implementation_verified_by IS NOT NULL
         AND implementation_verified_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM support_decisions
       WHERE id = NEW.decision_id
         AND case_id = NEW.id
         AND approval_status = 'approved'
         AND approval_payload_sha256 = payload_sha256
         AND implementation_status = 'succeeded'
         AND implementation_verified_by IS NOT NULL
         AND implementation_verified_at IS NOT NULL
         AND communicated_at IS NOT NULL
         AND communicated_by IS NOT NULL
         AND communication_payload_sha256 = payload_sha256
    ) THEN
    RAISE EXCEPTION 'support_case_decision_not_communicated' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_cases_final_decision_publication_guard
BEFORE UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_case_final_decision_publication();
