-- WP160: technical special-category/health-data intake binding.
-- This records only the technical warning/necessity/owner boundary. It does
-- not decide or assert an Article 9 legal basis.

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
          - 'specialCategoryHandling'
      ) = '{}'::jsonb
      AND intake_scope_evidence ->> 'version' = 'sit_support_single_issue_scope_v1'
      AND intake_scope_evidence -> 'singleIssueConfirmed' = 'true'::jsonb
      AND jsonb_typeof(intake_scope_evidence -> 'separationGuidanceShown') = 'boolean'
      AND (
        NOT (intake_scope_evidence ? 'specialCategoryHandling')
        OR (
          jsonb_typeof(intake_scope_evidence -> 'specialCategoryHandling') = 'object'
          AND (intake_scope_evidence -> 'specialCategoryHandling') ?& ARRAY[
            'version', 'classification', 'necessityAcknowledged', 'warningShown',
            'ownerRole', 'scope', 'replicationPolicy', 'detectionVersion',
            'detectedFields'
          ]
          AND (
            intake_scope_evidence -> 'specialCategoryHandling'
              - 'version'
              - 'classification'
              - 'necessityAcknowledged'
              - 'warningShown'
              - 'ownerRole'
              - 'scope'
              - 'replicationPolicy'
              - 'detectionVersion'
              - 'detectedFields'
          ) = '{}'::jsonb
          AND intake_scope_evidence -> 'specialCategoryHandling' ->> 'version' =
            'sit_special_category_handling_v1'
          AND intake_scope_evidence -> 'specialCategoryHandling' ->> 'classification' =
            'possible_special_category'
          AND intake_scope_evidence -> 'specialCategoryHandling' -> 'necessityAcknowledged' =
            'true'::jsonb
          AND intake_scope_evidence -> 'specialCategoryHandling' -> 'warningShown' =
            'true'::jsonb
          AND intake_scope_evidence -> 'specialCategoryHandling' ->> 'ownerRole' IN (
            'trust_safety_owner', 'privacy_owner', 'legal_authority_owner'
          )
          AND intake_scope_evidence -> 'specialCategoryHandling' ->> 'scope' = 'case_bound'
          AND intake_scope_evidence -> 'specialCategoryHandling' ->> 'replicationPolicy' =
            'no_unrestricted_replication'
          AND intake_scope_evidence -> 'specialCategoryHandling' ->> 'detectionVersion' =
            'sit_special_category_detection_v1'
          AND jsonb_typeof(
            intake_scope_evidence -> 'specialCategoryHandling' -> 'detectedFields'
          ) = 'array'
          AND jsonb_array_length(
            intake_scope_evidence -> 'specialCategoryHandling' -> 'detectedFields'
          ) BETWEEN 1 AND 8
        )
      )
    )
  );
