-- Rollback is possible only before any post-migration intake evidence exists.
-- Once user confirmation has been recorded, the audit truth is preserved.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support_cases WHERE intake_scope_evidence IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back support single-issue intake while evidence exists';
  END IF;
END;
$$;

DROP TRIGGER support_cases_intake_scope_guard ON support_cases;
DROP FUNCTION sit_validate_support_intake_scope();
ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_intake_scope_evidence_shape_check;
ALTER TABLE support_cases DROP COLUMN intake_scope_evidence;
