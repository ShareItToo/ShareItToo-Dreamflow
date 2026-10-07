-- S3O / SUP-113 + SUP-114: record every otherwise valid DSA notice before
-- checking whether its locator is exact. Missing or descriptive locators stay
-- reviewable and may be completed once through append-only reporter evidence.
-- This migration does not decide illegality or trigger a content measure.

ALTER TABLE support_cases
  ADD COLUMN dsa_notice_locator_status TEXT,
  ADD COLUMN dsa_notice_locator_kind TEXT;

-- S3N accepted only non-empty locators, but did not persist an exactness
-- classification. Treat any legacy notice conservatively as needing a fresh,
-- explicit locator instead of silently assuming completeness.
UPDATE support_cases
SET dsa_notice_locator_status = 'needs_clarification',
    lock_version = lock_version + 1,
    updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond')
WHERE dsa_notice_evidence IS NOT NULL;

ALTER TABLE support_cases
  DROP CONSTRAINT support_cases_dsa_notice_evidence_shape_check,
  ADD CONSTRAINT support_cases_dsa_notice_locator_state_check CHECK (
    (dsa_notice_evidence IS NULL
      AND dsa_notice_locator_status IS NULL
      AND dsa_notice_locator_kind IS NULL)
    OR
    (dsa_notice_evidence IS NOT NULL
      AND dsa_notice_locator_status IN ('complete', 'needs_clarification')
      AND (
        (dsa_notice_locator_status = 'needs_clarification'
          AND dsa_notice_locator_kind IS NULL)
        OR
        (dsa_notice_locator_status = 'complete'
          AND dsa_notice_locator_kind IN (
            'url', 'listing_reference', 'profile_reference',
            'review_reference', 'message_reference'
          ))
      ))
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
      AND (
        dsa_notice_evidence -> 'contentLocator' = 'null'::jsonb
        OR (
          jsonb_typeof(dsa_notice_evidence -> 'contentLocator') = 'string'
          AND length(BTRIM(dsa_notice_evidence ->> 'contentLocator'))
            BETWEEN 1 AND 2000
        )
      )
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

CREATE TABLE support_dsa_notice_locator_amendments (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL UNIQUE REFERENCES support_cases(id) ON DELETE RESTRICT,
  dsa_notice_number TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content_locator TEXT NOT NULL CHECK (
    length(BTRIM(content_locator)) BETWEEN 3 AND 2000
  ),
  locator_kind TEXT NOT NULL CHECK (locator_kind IN (
    'url', 'listing_reference', 'profile_reference',
    'review_reference', 'message_reference'
  )),
  idempotency_key TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  UNIQUE (reporter_user_id, idempotency_key)
);

CREATE INDEX support_dsa_notice_locator_amendments_reporter_idx
  ON support_dsa_notice_locator_amendments(reporter_user_id, submitted_at, id);

CREATE FUNCTION sit_validate_support_dsa_notice_locator_amendment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM support_cases AS support_case
    WHERE support_case.id = NEW.case_id
      AND support_case.dsa_notice_number = NEW.dsa_notice_number
      AND support_case.reporter_user_id = NEW.reporter_user_id
      AND support_case.dsa_notice_locator_status = 'needs_clarification'
      AND (
        NEW.locator_kind = 'url'
        OR NEW.locator_kind =
          (support_case.dsa_notice_evidence ->> 'contentType') || '_reference'
      )
  ) THEN
    RAISE EXCEPTION 'support_dsa_notice_locator_amendment_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_dsa_notice_locator_amendment_guard
BEFORE INSERT ON support_dsa_notice_locator_amendments
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_dsa_notice_locator_amendment();

CREATE TRIGGER support_dsa_notice_locator_amendments_append_only
BEFORE UPDATE OR DELETE ON support_dsa_notice_locator_amendments
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();

CREATE OR REPLACE FUNCTION sit_validate_support_dsa_notice_intake()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.case_type = 'moderation_content'
    AND NEW.case_subtype = 'illegal_content_notice'
    AND (
      NEW.dsa_notice_number IS NULL
      OR NEW.dsa_notice_evidence IS NULL
      OR NEW.dsa_notice_locator_status IS NULL
    )
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

  IF TG_OP = 'UPDATE' AND (
    NEW.dsa_notice_locator_status IS DISTINCT FROM OLD.dsa_notice_locator_status
    OR NEW.dsa_notice_locator_kind IS DISTINCT FROM OLD.dsa_notice_locator_kind
  ) AND NOT (
    OLD.dsa_notice_locator_status = 'needs_clarification'
    AND OLD.dsa_notice_locator_kind IS NULL
    AND NEW.dsa_notice_locator_status = 'complete'
    AND NEW.dsa_notice_locator_kind IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM support_dsa_notice_locator_amendments AS amendment
      WHERE amendment.case_id = NEW.id
        AND amendment.dsa_notice_number = NEW.dsa_notice_number
        AND amendment.reporter_user_id = NEW.reporter_user_id
        AND amendment.locator_kind = NEW.dsa_notice_locator_kind
    )
  ) THEN
    RAISE EXCEPTION 'support_dsa_notice_locator_state_immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
