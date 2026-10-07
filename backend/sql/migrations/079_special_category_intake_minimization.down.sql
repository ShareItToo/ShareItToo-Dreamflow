DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM support_cases
     WHERE intake_scope_evidence ? 'specialCategoryHandling'
  ) THEN
    RAISE EXCEPTION
      'rollback blocked: special-category intake handling evidence exists';
  END IF;
END $$;

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_intake_scope_evidence_shape_check;

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
