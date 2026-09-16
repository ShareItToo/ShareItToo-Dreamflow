-- Rollback is safe only while no incomplete notice or locator amendment exists.
-- Otherwise the original and supplemental DSA evidence must remain available.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_dsa_notice_locator_amendments)
    OR EXISTS (
      SELECT 1 FROM support_cases
      WHERE dsa_notice_locator_status = 'needs_clarification'
    )
  THEN
    RAISE EXCEPTION 'Cannot roll back DSA locator completion while evidence exists';
  END IF;
END;
$$;

DROP TRIGGER support_dsa_notice_locator_amendments_append_only
  ON support_dsa_notice_locator_amendments;
DROP TRIGGER support_dsa_notice_locator_amendment_guard
  ON support_dsa_notice_locator_amendments;
DROP FUNCTION sit_validate_support_dsa_notice_locator_amendment();
DROP INDEX support_dsa_notice_locator_amendments_reporter_idx;
DROP TABLE support_dsa_notice_locator_amendments;

CREATE OR REPLACE FUNCTION sit_validate_support_dsa_notice_intake()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_type = 'moderation_content'
    AND NEW.case_subtype = 'illegal_content_notice'
    AND (NEW.dsa_notice_number IS NULL OR NEW.dsa_notice_evidence IS NULL)
    AND (
      TG_OP = 'INSERT'
      OR OLD.case_type IS DISTINCT FROM NEW.case_type
      OR OLD.case_subtype IS DISTINCT FROM NEW.case_subtype
    )
  THEN
    RAISE EXCEPTION 'support_dsa_notice_required' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.dsa_notice_number IS DISTINCT FROM OLD.dsa_notice_number
    OR NEW.dsa_notice_evidence IS DISTINCT FROM OLD.dsa_notice_evidence
  ) THEN
    RAISE EXCEPTION 'support_dsa_notice_immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_dsa_notice_evidence_shape_check,
  DROP CONSTRAINT support_cases_dsa_notice_locator_state_check,
  DROP COLUMN dsa_notice_locator_kind,
  DROP COLUMN dsa_notice_locator_status,
  ADD CONSTRAINT support_cases_dsa_notice_evidence_shape_check CHECK (
    dsa_notice_evidence IS NULL OR (
      jsonb_typeof(dsa_notice_evidence) = 'object'
      AND dsa_notice_evidence ?& ARRAY[
        'version', 'contentType', 'contentLocator', 'illegalityStatement',
        'jurisdictionOrLegalBasis', 'goodFaithConfirmed', 'reporterName',
        'reporterEmail', 'sourceChannel', 'submittedAt'
      ]
      AND (
        dsa_notice_evidence
          - 'version'
          - 'contentType'
          - 'contentLocator'
          - 'illegalityStatement'
          - 'jurisdictionOrLegalBasis'
          - 'goodFaithConfirmed'
          - 'reporterName'
          - 'reporterEmail'
          - 'sourceChannel'
          - 'submittedAt'
      ) = '{}'::jsonb
      AND jsonb_typeof(dsa_notice_evidence -> 'version') = 'string'
      AND dsa_notice_evidence ->> 'version' = 'sit_dsa_notice_intake_v1'
      AND jsonb_typeof(dsa_notice_evidence -> 'contentType') = 'string'
      AND dsa_notice_evidence ->> 'contentType'
        IN ('listing', 'profile', 'review', 'message', 'other')
      AND jsonb_typeof(dsa_notice_evidence -> 'contentLocator') = 'string'
      AND length(BTRIM(dsa_notice_evidence ->> 'contentLocator'))
        BETWEEN 3 AND 2000
      AND jsonb_typeof(dsa_notice_evidence -> 'illegalityStatement') = 'string'
      AND length(BTRIM(dsa_notice_evidence ->> 'illegalityStatement'))
        BETWEEN 20 AND 8000
      AND (
        dsa_notice_evidence -> 'jurisdictionOrLegalBasis' = 'null'::jsonb
        OR (
          jsonb_typeof(dsa_notice_evidence -> 'jurisdictionOrLegalBasis') = 'string'
          AND length(BTRIM(dsa_notice_evidence ->> 'jurisdictionOrLegalBasis'))
            BETWEEN 1 AND 2000
        )
      )
      AND dsa_notice_evidence -> 'goodFaithConfirmed' = 'true'::jsonb
      AND jsonb_typeof(dsa_notice_evidence -> 'reporterName') = 'string'
      AND length(BTRIM(dsa_notice_evidence ->> 'reporterName')) BETWEEN 1 AND 200
      AND jsonb_typeof(dsa_notice_evidence -> 'reporterEmail') = 'string'
      AND length(BTRIM(dsa_notice_evidence ->> 'reporterEmail')) BETWEEN 3 AND 320
      AND jsonb_typeof(dsa_notice_evidence -> 'sourceChannel') = 'string'
      AND dsa_notice_evidence ->> 'sourceChannel'
        IN ('app', 'web', 'email', 'phone', 'internal', 'api')
      AND jsonb_typeof(dsa_notice_evidence -> 'submittedAt') = 'string'
      AND dsa_notice_evidence ->> 'submittedAt'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$'
    )
  );
