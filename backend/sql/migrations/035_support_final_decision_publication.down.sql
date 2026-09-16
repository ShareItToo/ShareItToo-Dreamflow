DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support_decisions
     WHERE user_facing_decision IS NOT NULL
        OR user_facing_effect IS NOT NULL
        OR user_facing_implementation_result IS NOT NULL
        OR communicated_by IS NOT NULL
        OR communication_payload_sha256 IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Support final-decision rollback blocked: publication data exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_cases_final_decision_publication_guard ON support_cases;
DROP FUNCTION IF EXISTS sit_validate_support_case_final_decision_publication();

DROP TRIGGER IF EXISTS support_decisions_communication_guard ON support_decisions;
DROP FUNCTION IF EXISTS sit_validate_support_decision_communication_update();

ALTER TABLE support_decisions
  DROP CONSTRAINT IF EXISTS support_decisions_communication_truth_check,
  DROP CONSTRAINT IF EXISTS support_decisions_user_publication_payload_check,
  DROP COLUMN communication_payload_sha256,
  DROP COLUMN communicated_by,
  DROP COLUMN user_facing_implementation_result,
  DROP COLUMN user_facing_effect,
  DROP COLUMN user_facing_decision;
