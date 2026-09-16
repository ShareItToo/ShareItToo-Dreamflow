-- S3R / SUP-121 and SUP-122: non-live Article 18 candidate assessment and
-- authority-referral guard. This migration deliberately provides no external
-- authority transport and cannot mark a disclosure as sent.

ALTER TABLE support_cases
  ADD COLUMN article18_candidate_flag BOOLEAN NOT NULL DEFAULT false;

UPDATE support_cases
   SET article18_candidate_flag = true,
       authority_flag = true
 WHERE case_type = 'trust_safety'
   AND case_subtype IN ('threat_or_violence', 'immediate_physical_danger')
   AND priority = 'p0'
   AND safety_flag = true;

ALTER TABLE support_cases
  ADD CONSTRAINT support_cases_article18_candidate_guard CHECK (
    NOT article18_candidate_flag
    OR (
      case_type = 'trust_safety'
      AND case_subtype IN ('threat_or_violence', 'immediate_physical_danger')
      AND priority = 'p0'
      AND safety_flag
      AND authority_flag
      AND operating_mode IN ('simulation', 'internal_testing')
    )
  );

CREATE INDEX support_cases_article18_candidate_queue_idx
  ON support_cases(priority, next_update_at, created_at, id)
  WHERE article18_candidate_flag
    AND status NOT IN ('resolved', 'closed');

CREATE TABLE support_article18_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  supersedes_assessment_id UUID UNIQUE
    REFERENCES support_article18_assessments(id) ON DELETE RESTRICT,
  determination TEXT NOT NULL CHECK (determination IN (
    'information_required', 'not_established', 'reporting_path_required'
  )),
  routing_basis TEXT NOT NULL CHECK (routing_basis IN (
    'not_applicable', 'concerned_member_state_identified',
    'state_not_identified_fallback_required'
  )),
  factual_basis TEXT NOT NULL CHECK (char_length(factual_basis) BETWEEN 20 AND 8000),
  evidence_references TEXT[] NOT NULL CHECK (
    cardinality(evidence_references) BETWEEN 1 AND 50
  ),
  concerned_member_states TEXT[] NOT NULL DEFAULT '{}',
  information_scope TEXT[] NOT NULL DEFAULT '{}',
  reviewer_authorization_evidence_ref TEXT NOT NULL CHECK (
    char_length(reviewer_authorization_evidence_ref) BETWEEN 12 AND 300
    AND reviewer_authorization_evidence_ref
      ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]+$'
  ),
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_session_id UUID NOT NULL,
  staff_elevation_id UUID NOT NULL,
  human_reviewed BOOLEAN NOT NULL CHECK (human_reviewed),
  automation_role TEXT NOT NULL CHECK (automation_role = 'none'),
  external_delivery_allowed BOOLEAN NOT NULL DEFAULT false
    CHECK (NOT external_delivery_allowed),
  external_delivery_status TEXT NOT NULL DEFAULT 'disabled_not_configured'
    CHECK (external_delivery_status = 'disabled_not_configured'),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cardinality(concerned_member_states) <= 27),
  CHECK (cardinality(information_scope) <= 8),
  CHECK (
    (determination = 'reporting_path_required'
      AND routing_basis <> 'not_applicable'
      AND cardinality(information_scope) >= 1
      AND (
        (routing_basis = 'concerned_member_state_identified'
          AND cardinality(concerned_member_states) >= 1)
        OR
        (routing_basis = 'state_not_identified_fallback_required'
          AND cardinality(concerned_member_states) = 0)
      ))
    OR
    (determination IN ('information_required', 'not_established')
      AND routing_basis = 'not_applicable'
      AND cardinality(concerned_member_states) = 0
      AND cardinality(information_scope) = 0)
  )
);

CREATE UNIQUE INDEX support_article18_assessments_root_idx
  ON support_article18_assessments(case_id)
  WHERE supersedes_assessment_id IS NULL;
CREATE INDEX support_article18_assessments_case_created_idx
  ON support_article18_assessments(case_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION sit_validate_support_article18_assessment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  reviewer users%ROWTYPE;
  reviewer_session auth_sessions%ROWTYPE;
  reviewer_elevation staff_elevations%ROWTYPE;
  prior_assessment support_article18_assessments%ROWTYPE;
  entry TEXT;
BEGIN
  IF NEW.created_at < clock_timestamp() - interval '30 seconds'
    OR NEW.created_at > clock_timestamp() + interval '30 seconds'
  THEN
    RAISE EXCEPTION 'support_article18_database_time_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id FOR UPDATE;
  IF NOT FOUND
    OR NOT target_case.article18_candidate_flag
    OR NOT target_case.safety_flag
    OR NOT target_case.authority_flag
    OR target_case.priority <> 'p0'
    OR target_case.status IN ('resolved', 'closed')
    OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
  THEN
    RAISE EXCEPTION 'support_article18_candidate_case_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO reviewer FROM users WHERE id = NEW.reviewer_id;
  IF NOT FOUND
    OR reviewer.role <> 'admin'
    OR reviewer.account_status <> 'active'
    OR reviewer.deactivated_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'support_article18_active_admin_required'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO reviewer_session FROM auth_sessions WHERE id = NEW.reviewer_session_id;
  SELECT * INTO reviewer_elevation FROM staff_elevations WHERE id = NEW.staff_elevation_id;
  IF reviewer_session.id IS NULL
    OR reviewer_session.user_id <> NEW.reviewer_id
    OR reviewer_session.revoked_at IS NOT NULL
    OR reviewer_elevation.id IS NULL
    OR reviewer_elevation.user_id <> NEW.reviewer_id
    OR reviewer_elevation.session_id <> NEW.reviewer_session_id
    OR reviewer_elevation.role <> 'admin'
    OR reviewer_elevation.revoked_at IS NOT NULL
    OR reviewer_elevation.expires_at <= NEW.created_at
  THEN
    RAISE EXCEPTION 'support_article18_active_admin_step_up_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO prior_assessment
    FROM support_article18_assessments
   WHERE case_id = NEW.case_id
   ORDER BY created_at DESC, id DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    IF NEW.supersedes_assessment_id IS NOT NULL THEN
      RAISE EXCEPTION 'support_article18_supersession_invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF prior_assessment.determination <> 'information_required'
    OR NEW.supersedes_assessment_id IS DISTINCT FROM prior_assessment.id
  THEN
    RAISE EXCEPTION 'support_article18_prior_assessment_final'
      USING ERRCODE = '23514';
  END IF;

  FOREACH entry IN ARRAY NEW.evidence_references LOOP
    IF entry !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$' THEN
      RAISE EXCEPTION 'support_article18_evidence_reference_invalid'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF cardinality(NEW.evidence_references) <> (
    SELECT count(DISTINCT entry_value)
      FROM unnest(NEW.evidence_references) AS item(entry_value)
  ) THEN
    RAISE EXCEPTION 'support_article18_evidence_reference_duplicate'
      USING ERRCODE = '23514';
  END IF;
  FOREACH entry IN ARRAY NEW.concerned_member_states LOOP
    IF entry !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'support_article18_member_state_invalid'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF cardinality(NEW.concerned_member_states) <> (
    SELECT count(DISTINCT entry_value)
      FROM unnest(NEW.concerned_member_states) AS item(entry_value)
  ) THEN
    RAISE EXCEPTION 'support_article18_member_state_duplicate'
      USING ERRCODE = '23514';
  END IF;
  FOREACH entry IN ARRAY NEW.information_scope LOOP
    IF entry NOT IN (
      'case_reference', 'account_identifier', 'content_reference',
      'evidence_digest', 'affected_location', 'contact_reference'
    ) THEN
      RAISE EXCEPTION 'support_article18_information_scope_invalid'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF cardinality(NEW.information_scope) <> (
    SELECT count(DISTINCT entry_value)
      FROM unnest(NEW.information_scope) AS item(entry_value)
  ) THEN
    RAISE EXCEPTION 'support_article18_information_scope_duplicate'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_article18_assessments_validate
BEFORE INSERT ON support_article18_assessments
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_article18_assessment();

CREATE TRIGGER support_article18_assessments_append_only
BEFORE UPDATE OR DELETE ON support_article18_assessments
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();
