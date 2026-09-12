DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_article18_assessments) THEN
    RAISE EXCEPTION
      'Cannot roll back support Article 18 guard while assessment evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_article18_assessments_append_only
  ON support_article18_assessments;
DROP TRIGGER IF EXISTS support_article18_assessments_validate
  ON support_article18_assessments;
DROP FUNCTION IF EXISTS sit_validate_support_article18_assessment();
DROP TABLE IF EXISTS support_article18_assessments;
DROP INDEX IF EXISTS support_cases_article18_candidate_queue_idx;
ALTER TABLE support_cases
  DROP CONSTRAINT IF EXISTS support_cases_article18_candidate_guard;
ALTER TABLE support_cases
  DROP COLUMN IF EXISTS article18_candidate_flag;
