-- S4B / SUP-106 through SUP-112: restricted, non-live Trust & Safety impact
-- review. The record inventories one linked listing and its bookings, but it
-- cannot execute a listing, booking, account, authority or notification action.

CREATE TABLE support_safety_impact_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  case_version INTEGER NOT NULL CHECK (case_version > 0),
  review_version TEXT NOT NULL CHECK (
    review_version = 'support_safety_impact_review_v1'
  ),
  linked_listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  action_relevant_booking_ids TEXT[] NOT NULL DEFAULT '{}',
  historical_booking_ids TEXT[] NOT NULL DEFAULT '{}',
  impact_snapshot JSONB NOT NULL CHECK (jsonb_typeof(impact_snapshot) = 'object'),
  snapshot_sha256 CHAR(64) GENERATED ALWAYS AS (
    encode(digest(impact_snapshot::text, 'sha256'), 'hex')
  ) STORED,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_session_id UUID NOT NULL,
  staff_elevation_id UUID NOT NULL,
  human_reviewed BOOLEAN NOT NULL CHECK (human_reviewed),
  decision_required BOOLEAN NOT NULL CHECK (decision_required),
  proportionality_required BOOLEAN NOT NULL CHECK (proportionality_required),
  action_executed BOOLEAN NOT NULL DEFAULT false CHECK (NOT action_executed),
  external_delivery_enabled BOOLEAN NOT NULL DEFAULT false
    CHECK (NOT external_delivery_enabled),
  automation_role TEXT NOT NULL CHECK (automation_role = 'none'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (
    char_length(idempotency_key) BETWEEN 3 AND 220
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]+$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_safety_impact_reviews_case_created_idx
  ON support_safety_impact_reviews(case_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION sit_validate_support_safety_impact_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  reviewer users%ROWTYPE;
  reviewer_session auth_sessions%ROWTYPE;
  reviewer_elevation staff_elevations%ROWTYPE;
  entry TEXT;
BEGIN
  IF NEW.created_at < clock_timestamp() - interval '30 seconds'
    OR NEW.created_at > clock_timestamp() + interval '30 seconds'
  THEN
    RAISE EXCEPTION 'support_safety_impact_database_time_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO target_case FROM support_cases
   WHERE id = NEW.case_id
   FOR UPDATE;
  IF NOT FOUND
    OR target_case.status IN ('resolved', 'closed')
    OR target_case.operating_mode NOT IN ('simulation', 'internal_testing')
    OR target_case.linked_listing_id IS DISTINCT FROM NEW.linked_listing_id
    OR target_case.lock_version <> NEW.case_version
    OR NOT (
      (target_case.case_type = 'moderation_content'
        AND target_case.case_subtype = 'prohibited_or_restricted_listing')
      OR
      (target_case.case_type = 'trust_safety'
        AND target_case.case_subtype = 'dangerous_item_or_injury'
        AND target_case.safety_flag
        AND target_case.approval_level = 'red_explicit_decision')
    )
  THEN
    RAISE EXCEPTION 'support_safety_impact_case_required'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO reviewer FROM users WHERE id = NEW.reviewer_id;
  SELECT * INTO reviewer_session FROM auth_sessions
   WHERE id = NEW.reviewer_session_id;
  SELECT * INTO reviewer_elevation FROM staff_elevations
   WHERE id = NEW.staff_elevation_id;
  IF reviewer.id IS NULL
    OR reviewer.role <> 'admin'
    OR reviewer.account_status <> 'active'
    OR reviewer.deactivated_at IS NOT NULL
    OR reviewer_session.id IS NULL
    OR reviewer_session.user_id <> NEW.reviewer_id
    OR reviewer_session.revoked_at IS NOT NULL
    OR reviewer_elevation.id IS NULL
    OR reviewer_elevation.user_id <> NEW.reviewer_id
    OR reviewer_elevation.session_id <> NEW.reviewer_session_id
    OR reviewer_elevation.role <> 'admin'
    OR reviewer_elevation.revoked_at IS NOT NULL
    OR reviewer_elevation.expires_at <= NEW.created_at
  THEN
    RAISE EXCEPTION 'support_safety_impact_active_admin_step_up_required'
      USING ERRCODE = '23514';
  END IF;

  IF cardinality(NEW.action_relevant_booking_ids) <> (
      SELECT count(DISTINCT value) FROM unnest(NEW.action_relevant_booking_ids) AS item(value)
    )
    OR cardinality(NEW.historical_booking_ids) <> (
      SELECT count(DISTINCT value) FROM unnest(NEW.historical_booking_ids) AS item(value)
    )
    OR NEW.action_relevant_booking_ids && NEW.historical_booking_ids
  THEN
    RAISE EXCEPTION 'support_safety_impact_booking_scope_duplicate'
      USING ERRCODE = '23514';
  END IF;

  FOREACH entry IN ARRAY NEW.action_relevant_booking_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM bookings
       WHERE id = entry
         AND listing_id = NEW.linked_listing_id
         AND workflow_status IN (
           'requested', 'accepted', 'payment_pending', 'confirmed', 'active',
           'withdrawalReturnRequired', 'returned', 'disputed'
         )
    ) THEN
      RAISE EXCEPTION 'support_safety_impact_active_booking_invalid'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOREACH entry IN ARRAY NEW.historical_booking_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM bookings
       WHERE id = entry
         AND listing_id = NEW.linked_listing_id
         AND workflow_status NOT IN (
           'requested', 'accepted', 'payment_pending', 'confirmed', 'active',
           'withdrawalReturnRequired', 'returned', 'disputed'
         )
    ) THEN
      RAISE EXCEPTION 'support_safety_impact_historical_booking_invalid'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  IF NEW.impact_snapshot ->> 'version' <> NEW.review_version
    OR NEW.impact_snapshot ->> 'caseId' <> NEW.case_id::text
    OR (NEW.impact_snapshot ->> 'caseVersion')::integer <> NEW.case_version
    OR NEW.impact_snapshot #>> '{listing,id}' <> NEW.linked_listing_id
    OR NEW.impact_snapshot ->> 'decisionBoundary' <> 'red_human_decision_required'
    OR NEW.impact_snapshot ->> 'proportionalityRequired' <> 'true'
    OR NEW.impact_snapshot ->> 'automaticActionAllowed' <> 'false'
    OR NEW.impact_snapshot ->> 'externalDeliveryAllowed' <> 'false'
  THEN
    RAISE EXCEPTION 'support_safety_impact_snapshot_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_safety_impact_reviews_validate
BEFORE INSERT ON support_safety_impact_reviews
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_safety_impact_review();

CREATE TRIGGER support_safety_impact_reviews_append_only
BEFORE UPDATE OR DELETE ON support_safety_impact_reviews
FOR EACH ROW EXECUTE FUNCTION sit_reject_support_audit_mutation();
