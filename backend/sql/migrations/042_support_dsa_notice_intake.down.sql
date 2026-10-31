-- Rollback is possible only before any DSA notice evidence exists. Once a
-- notice has been recorded, its audit truth must remain available.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM support_cases WHERE dsa_notice_evidence IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot roll back DSA notice intake while evidence exists';
  END IF;
END;
$$;

DROP TRIGGER support_cases_dsa_notice_intake_guard ON support_cases;
DROP FUNCTION sit_validate_support_dsa_notice_intake();
DROP INDEX support_cases_dsa_notice_number_unique;
ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_dsa_notice_evidence_shape_check,
  DROP CONSTRAINT support_cases_dsa_notice_route_check,
  DROP CONSTRAINT support_cases_dsa_notice_pair_check,
  DROP CONSTRAINT support_cases_dsa_notice_number_shape_check,
  DROP COLUMN dsa_notice_evidence,
  DROP COLUMN dsa_notice_number;
