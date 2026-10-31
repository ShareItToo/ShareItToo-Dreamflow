-- S3N / SUP-027: a report of allegedly illegal content has its own DSA
-- notice-and-action intake and immutable evidence snapshot. Existing rows stay
-- legacy-null. This does not decide illegality, remove content, notify another
-- party, or activate a public/live support channel.

ALTER TABLE support_cases
  ADD COLUMN dsa_notice_number TEXT,
  ADD COLUMN dsa_notice_evidence JSONB;

CREATE UNIQUE INDEX support_cases_dsa_notice_number_unique
  ON support_cases (dsa_notice_number)
  WHERE dsa_notice_number IS NOT NULL;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_dsa_notice_number_shape_check CHECK (
    dsa_notice_number IS NULL
    OR dsa_notice_number ~ '^SIT-N-[A-HJ-NP-Z2-9]{12}$'
  ),
  ADD CONSTRAINT support_cases_dsa_notice_pair_check CHECK (
    (dsa_notice_number IS NULL) = (dsa_notice_evidence IS NULL)
  ),
  ADD CONSTRAINT support_cases_dsa_notice_route_check CHECK (
    dsa_notice_evidence IS NULL OR (
      case_type = 'moderation_content'
      AND case_subtype = 'illegal_content_notice'
    )
  ),
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

CREATE TRIGGER support_cases_dsa_notice_intake_guard
BEFORE INSERT OR UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_dsa_notice_intake();
