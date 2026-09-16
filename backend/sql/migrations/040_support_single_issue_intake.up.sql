-- S3K / SUP-026: one independently reviewable issue per support case.
-- Existing rows remain explicitly legacy (NULL); every new row must carry the
-- versioned, immutable confirmation. This migration does not activate live
-- support delivery, payments, provider actions or public access.

ALTER TABLE support_cases
  ADD COLUMN intake_scope_evidence JSONB;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_intake_scope_evidence_shape_check CHECK (
    intake_scope_evidence IS NULL OR (
      jsonb_typeof(intake_scope_evidence) = 'object'
      AND intake_scope_evidence ?& ARRAY[
        'version', 'singleIssueConfirmed', 'separationGuidanceShown'
      ]
      AND (
        intake_scope_evidence
          - 'version'
          - 'singleIssueConfirmed'
          - 'separationGuidanceShown'
      ) = '{}'::jsonb
      AND intake_scope_evidence ->> 'version' = 'sit_support_single_issue_scope_v1'
      AND intake_scope_evidence -> 'singleIssueConfirmed' = 'true'::jsonb
      AND jsonb_typeof(intake_scope_evidence -> 'separationGuidanceShown') = 'boolean'
    )
  );

CREATE OR REPLACE FUNCTION sit_validate_support_intake_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.intake_scope_evidence IS NULL THEN
    RAISE EXCEPTION 'support_issue_scope_required' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.intake_scope_evidence IS DISTINCT FROM OLD.intake_scope_evidence
  THEN
    RAISE EXCEPTION 'support_issue_scope_immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_cases_intake_scope_guard
BEFORE INSERT OR UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_intake_scope();
