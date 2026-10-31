-- S4C / SUP-015: immutable, human-reviewed duplicate-case linking. The link
-- records one leading non-live case, but never merges rows or closes a case by
-- itself. Privacy, DSA and authority lanes remain separate.

CREATE TABLE support_case_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  object_type TEXT NOT NULL CHECK (object_type = 'another_support_case'),
  object_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL CHECK (relation_type = 'duplicate_of'),
  link_version TEXT NOT NULL CHECK (
    link_version = 'support_duplicate_case_link_v1'
  ),
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  leading_case_version INTEGER NOT NULL CHECK (leading_case_version > 0),
  assessment_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(assessment_snapshot) = 'object'
  ),
  snapshot_sha256 CHAR(64) GENERATED ALWAYS AS (
    encode(digest(assessment_snapshot::text, 'sha256'), 'hex')
  ) STORED,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_session_id UUID NOT NULL,
  staff_elevation_id UUID NOT NULL,
  same_core_facts_confirmed BOOLEAN NOT NULL CHECK (same_core_facts_confirmed),
  same_participants_objects_confirmed BOOLEAN NOT NULL
    CHECK (same_participants_objects_confirmed),
  same_decision_question_confirmed BOOLEAN NOT NULL
    CHECK (same_decision_question_confirmed),
  no_separate_deadline_loss_confirmed BOOLEAN NOT NULL
    CHECK (no_separate_deadline_loss_confirmed),
  privacy_dsa_separation_confirmed BOOLEAN NOT NULL
    CHECK (privacy_dsa_separation_confirmed),
  human_reviewed BOOLEAN NOT NULL CHECK (human_reviewed),
  automatic_merge_executed BOOLEAN NOT NULL DEFAULT false
    CHECK (NOT automatic_merge_executed),
  external_delivery_enabled BOOLEAN NOT NULL DEFAULT false
    CHECK (NOT external_delivery_enabled),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (
    char_length(idempotency_key) BETWEEN 3 AND 220
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]+$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (case_id <> object_id),
  UNIQUE (case_id, object_type, relation_type)
);

CREATE INDEX support_case_links_leading_created_idx
  ON support_case_links(object_id, created_at, id);

CREATE FUNCTION sit_validate_support_case_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  duplicate_case support_cases%ROWTYPE;
  leading_case support_cases%ROWTYPE;
  reviewer users%ROWTYPE;
  reviewer_session auth_sessions%ROWTYPE;
  reviewer_elevation staff_elevations%ROWTYPE;
BEGIN
  IF NEW.created_at < clock_timestamp() - interval '30 seconds'
    OR NEW.created_at > clock_timestamp() + interval '30 seconds'
  THEN
    RAISE EXCEPTION 'support_case_link_database_time_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO duplicate_case FROM support_cases
   WHERE id = NEW.case_id
   FOR UPDATE;
  SELECT * INTO leading_case FROM support_cases
   WHERE id = NEW.object_id
   FOR UPDATE;
  IF duplicate_case.id IS NULL OR leading_case.id IS NULL
    OR duplicate_case.status <> 'resolved'
    OR leading_case.status IN ('resolved', 'closed')
    OR duplicate_case.operating_mode NOT IN ('simulation', 'internal_testing')
    OR duplicate_case.operating_mode <> leading_case.operating_mode
    OR duplicate_case.lock_version <> NEW.case_version
    OR leading_case.lock_version <> NEW.leading_case_version
  THEN
    RAISE EXCEPTION 'support_duplicate_case_state_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF duplicate_case.case_type IN (
      'privacy_security', 'moderation_content', 'legal_authority'
    )
    OR leading_case.case_type IN (
      'privacy_security', 'moderation_content', 'legal_authority'
    )
    OR duplicate_case.privacy_flag OR leading_case.privacy_flag
    OR duplicate_case.dsa_flag OR leading_case.dsa_flag
    OR duplicate_case.authority_flag OR leading_case.authority_flag
  THEN
    RAISE EXCEPTION 'support_duplicate_case_separate_lane_required'
      USING ERRCODE = '23514';
  END IF;

  IF duplicate_case.case_type <> leading_case.case_type
    OR duplicate_case.case_subtype <> leading_case.case_subtype
    OR duplicate_case.reporter_user_id <> leading_case.reporter_user_id
    OR ARRAY(
      SELECT value FROM unnest(duplicate_case.affected_user_ids) AS item(value)
      ORDER BY value
    ) IS DISTINCT FROM ARRAY(
      SELECT value FROM unnest(leading_case.affected_user_ids) AS item(value)
      ORDER BY value
    )
    OR duplicate_case.linked_booking_id IS DISTINCT FROM leading_case.linked_booking_id
    OR duplicate_case.linked_listing_id IS DISTINCT FROM leading_case.linked_listing_id
    OR duplicate_case.linked_payment_id IS DISTINCT FROM leading_case.linked_payment_id
    OR duplicate_case.linked_refund_id IS DISTINCT FROM leading_case.linked_refund_id
    OR duplicate_case.linked_payout_id IS DISTINCT FROM leading_case.linked_payout_id
  THEN
    RAISE EXCEPTION 'support_duplicate_case_scope_mismatch'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO reviewer FROM users WHERE id = NEW.created_by;
  SELECT * INTO reviewer_session FROM auth_sessions
   WHERE id = NEW.reviewer_session_id;
  SELECT * INTO reviewer_elevation FROM staff_elevations
   WHERE id = NEW.staff_elevation_id;
  IF reviewer.id IS NULL
    OR reviewer.role <> 'admin'
    OR reviewer.account_status <> 'active'
    OR reviewer.deactivated_at IS NOT NULL
    OR reviewer_session.id IS NULL
    OR reviewer_session.user_id <> NEW.created_by
    OR reviewer_session.revoked_at IS NOT NULL
    OR reviewer_elevation.id IS NULL
    OR reviewer_elevation.user_id <> NEW.created_by
    OR reviewer_elevation.session_id <> NEW.reviewer_session_id
    OR reviewer_elevation.role <> 'admin'
    OR reviewer_elevation.revoked_at IS NOT NULL
    OR reviewer_elevation.expires_at <= NEW.created_at
  THEN
    RAISE EXCEPTION 'support_duplicate_case_active_admin_step_up_required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.assessment_snapshot ->> 'version' <> NEW.link_version
    OR NEW.assessment_snapshot ->> 'duplicateCaseNumber'
      <> duplicate_case.human_readable_case_number
    OR NEW.assessment_snapshot ->> 'leadingCaseNumber'
      <> leading_case.human_readable_case_number
    OR (NEW.assessment_snapshot ->> 'duplicateCaseVersion')::integer
      <> NEW.case_version
    OR (NEW.assessment_snapshot ->> 'leadingCaseVersion')::integer
      <> NEW.leading_case_version
    OR NEW.assessment_snapshot ->> 'caseType' <> duplicate_case.case_type
    OR NEW.assessment_snapshot ->> 'caseSubType' <> duplicate_case.case_subtype
    OR NEW.assessment_snapshot ->> 'sameCoreFactsConfirmed' <> 'true'
    OR NEW.assessment_snapshot ->> 'sameParticipantsAndObjectsConfirmed' <> 'true'
    OR NEW.assessment_snapshot ->> 'sameDecisionQuestionConfirmed' <> 'true'
    OR NEW.assessment_snapshot ->> 'noSeparateDeadlineLossConfirmed' <> 'true'
    OR NEW.assessment_snapshot ->> 'privacyDsaSeparationConfirmed' <> 'true'
    OR NEW.assessment_snapshot ->> 'userVisibleReferenceRequired' <> 'true'
    OR NEW.assessment_snapshot ->> 'automaticMergeAllowed' <> 'false'
    OR NEW.assessment_snapshot ->> 'externalDeliveryAllowed' <> 'false'
  THEN
    RAISE EXCEPTION 'support_duplicate_case_snapshot_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_case_links_validate
BEFORE INSERT ON support_case_links
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_case_link();

CREATE TRIGGER support_case_links_append_only
BEFORE UPDATE OR DELETE ON support_case_links
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();

CREATE FUNCTION sit_validate_support_duplicate_case_closure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  duplicate_link support_case_links%ROWTYPE;
BEGIN
  IF OLD.status <> 'closed' AND NEW.status = 'closed' THEN
    SELECT * INTO duplicate_link FROM support_case_links
     WHERE case_id = NEW.id
       AND object_type = 'another_support_case'
       AND relation_type = 'duplicate_of';
    IF NEW.closure_reason = 'duplicate_merged' THEN
      IF duplicate_link.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM support_case_events
         WHERE case_id = NEW.id
           AND entity_type = 'support_case_link'
           AND entity_id = duplicate_link.id::text
           AND event_type = 'case.duplicate_link_recorded'
           AND visibility = 'user_visible'
      ) THEN
        RAISE EXCEPTION 'support_duplicate_case_link_required'
          USING ERRCODE = '23514';
      END IF;
    ELSIF duplicate_link.id IS NOT NULL THEN
      RAISE EXCEPTION 'support_duplicate_case_closure_reason_required'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_duplicate_case_closure_guard
BEFORE UPDATE ON support_cases
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_duplicate_case_closure();
