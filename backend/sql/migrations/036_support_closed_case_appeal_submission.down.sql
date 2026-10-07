DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support_appeals
     WHERE human_readable_appeal_number IS NOT NULL OR next_update_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM support_cases
     WHERE appeal_configured_at IS NOT NULL OR appeal_configured_by IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Support appeal rollback blocked: appeal configuration or submissions exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_case_appeal_update_guard ON support_cases;
DROP FUNCTION IF EXISTS sit_validate_support_case_appeal_update();
DROP TRIGGER IF EXISTS support_appeals_update_guard ON support_appeals;
DROP FUNCTION IF EXISTS sit_validate_support_appeal_update();
DROP TRIGGER IF EXISTS support_appeals_insert_guard ON support_appeals;
DROP FUNCTION IF EXISTS sit_validate_support_appeal_insert();

DROP INDEX IF EXISTS support_appeals_decision_submitter_unique;
DROP INDEX IF EXISTS support_appeals_human_number_unique;

ALTER TABLE support_appeals
  DROP CONSTRAINT IF EXISTS support_appeals_user_receipt_truth,
  DROP COLUMN IF EXISTS next_update_at,
  DROP COLUMN IF EXISTS human_readable_appeal_number;

ALTER TABLE support_cases
  DROP CONSTRAINT IF EXISTS support_cases_appeal_configuration_truth,
  DROP COLUMN IF EXISTS appeal_configured_by,
  DROP COLUMN IF EXISTS appeal_configured_at;
