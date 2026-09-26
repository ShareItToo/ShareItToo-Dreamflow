-- S3Q / SUP-119 and SUP-120: independent, human moderation review and
-- auditable correction evidence. This migration does not enable production,
-- external delivery, payment, Store or public pilot operation.

CREATE TABLE moderation_review_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id UUID NOT NULL UNIQUE
    REFERENCES moderation_review_requests(id) ON DELETE RESTRICT,
  original_decision_id UUID NOT NULL
    REFERENCES moderation_decisions(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK (outcome IN ('upheld', 'modified', 'reversed')),
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  human_reviewed BOOLEAN NOT NULL CHECK (human_reviewed),
  independence_verified BOOLEAN NOT NULL CHECK (independence_verified),
  automation_role TEXT NOT NULL CHECK (automation_role = 'none'),
  user_facing_reason TEXT NOT NULL CHECK (
    char_length(user_facing_reason) BETWEEN 3 AND 8000
  ),
  correction_decision_id UUID UNIQUE
    REFERENCES moderation_decisions(id) ON DELETE RESTRICT,
  measure_changed BOOLEAN NOT NULL,
  communicated_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (outcome = 'upheld' AND correction_decision_id IS NULL AND NOT measure_changed)
    OR
    (outcome IN ('modified', 'reversed')
      AND correction_decision_id IS NOT NULL AND measure_changed)
  ),
  CHECK (communicated_at >= created_at)
);

CREATE INDEX moderation_review_resolutions_reviewer_time_idx
  ON moderation_review_resolutions(reviewer_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION sit_validate_moderation_review_resolution()
RETURNS TRIGGER AS $$
DECLARE
  request_row moderation_review_requests%ROWTYPE;
  original_row moderation_decisions%ROWTYPE;
  correction_row moderation_decisions%ROWTYPE;
  expected_correction_idempotency_key TEXT;
BEGIN
  SELECT * INTO request_row
    FROM moderation_review_requests
   WHERE id = NEW.review_request_id;
  IF NOT FOUND OR request_row.decision_id IS DISTINCT FROM NEW.original_decision_id THEN
    RAISE EXCEPTION 'moderation_review_resolution_request_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF request_row.status <> 'in_review'
     OR request_row.assigned_to IS DISTINCT FROM NEW.reviewer_id THEN
    RAISE EXCEPTION 'moderation_review_resolution_assignment_required'
      USING ERRCODE = '23514';
  END IF;
  SELECT * INTO original_row
    FROM moderation_decisions
   WHERE id = NEW.original_decision_id;
  IF NOT FOUND OR original_row.issued_by IS NULL
     OR original_row.issued_by = NEW.reviewer_id THEN
    RAISE EXCEPTION 'moderation_review_independent_reviewer_required'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE id = NEW.reviewer_id
       AND role = 'admin'
       AND account_status = 'active'
       AND deactivated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'moderation_review_active_admin_required'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.correction_decision_id IS NOT NULL THEN
    expected_correction_idempotency_key := CASE
      WHEN original_row.measure_type = 'listing_restriction' THEN
        'moderation.decision:listing.moderation:'
          || NEW.idempotency_key || ':correction:decision'
      WHEN original_row.measure_type = 'private_marketplace_review' THEN
        'moderation.decision:private.marketplace.review:'
          || NEW.idempotency_key || ':correction:decision'
      WHEN original_row.measure_type IN ('account_suspension', 'scope_suspension') THEN
        'moderation.decision:user.suspension.lift:'
          || NEW.idempotency_key || ':correction:decision'
      ELSE NULL
    END;
    SELECT * INTO correction_row
      FROM moderation_decisions
     WHERE id = NEW.correction_decision_id;
    IF NOT FOUND
       OR correction_row.issued_by IS DISTINCT FROM NEW.reviewer_id
       OR correction_row.recipient_user_id IS DISTINCT FROM original_row.recipient_user_id
       OR correction_row.target_type IS DISTINCT FROM original_row.target_type
       OR correction_row.target_id IS DISTINCT FROM original_row.target_id
       OR correction_row.created_at < request_row.submitted_at
       OR correction_row.idempotency_key IS DISTINCT FROM
            expected_correction_idempotency_key
       OR (NEW.outcome = 'reversed' AND correction_row.measure_type <> 'measure_reversal')
       OR (NEW.outcome = 'modified' AND (
            original_row.measure_type NOT IN (
              'listing_restriction', 'private_marketplace_review'
            )
            OR correction_row.measure_type IS DISTINCT FROM original_row.measure_type
          )) THEN
      RAISE EXCEPTION 'moderation_review_correction_decision_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER moderation_review_resolutions_validate
BEFORE INSERT ON moderation_review_resolutions
FOR EACH ROW EXECUTE FUNCTION sit_validate_moderation_review_resolution();

CREATE TRIGGER moderation_review_resolutions_append_only
BEFORE UPDATE OR DELETE ON moderation_review_resolutions
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE OR REPLACE FUNCTION sit_validate_moderation_review_request_update()
RETURNS TRIGGER AS $$
DECLARE
  original_issuer TEXT;
BEGIN
  IF ROW(
    NEW.decision_id, NEW.requester_id, NEW.reason,
    NEW.idempotency_key, NEW.submitted_at
  ) IS DISTINCT FROM ROW(
    OLD.decision_id, OLD.requester_id, OLD.reason,
    OLD.idempotency_key, OLD.submitted_at
  ) THEN
    RAISE EXCEPTION 'moderation_review_submission_immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('upheld', 'modified', 'reversed') THEN
    RAISE EXCEPTION 'moderation_review_resolution_immutable'
      USING ERRCODE = '23514';
  END IF;
  SELECT issued_by INTO original_issuer
    FROM moderation_decisions
   WHERE id = OLD.decision_id;
  IF OLD.status = 'submitted' AND NEW.status = 'in_review' THEN
    IF original_issuer IS NULL OR NEW.assigned_to IS NULL
       OR NEW.assigned_to = original_issuer
       OR NEW.resolution IS NOT NULL OR NEW.resolved_by IS NOT NULL
       OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'moderation_review_independent_assignment_required'
        USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'in_review'
        AND NEW.status IN ('upheld', 'modified', 'reversed') THEN
    IF OLD.assigned_to IS NULL
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.resolved_by IS DISTINCT FROM OLD.assigned_to
       OR NEW.resolved_by = original_issuer
       OR NEW.resolution IS NULL OR NEW.resolved_at IS NULL THEN
      RAISE EXCEPTION 'moderation_review_independent_resolution_required'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'moderation_review_transition_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER moderation_review_requests_update_guard
BEFORE UPDATE ON moderation_review_requests
FOR EACH ROW EXECUTE FUNCTION sit_validate_moderation_review_request_update();

CREATE OR REPLACE FUNCTION sit_require_moderation_review_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('upheld', 'modified', 'reversed') AND NOT EXISTS (
    SELECT 1 FROM moderation_review_resolutions AS resolution
     WHERE resolution.review_request_id = NEW.id
       AND resolution.original_decision_id = NEW.decision_id
       AND resolution.outcome = NEW.status
       AND resolution.reviewer_id = NEW.resolved_by
       AND resolution.user_facing_reason = NEW.resolution
  ) THEN
    RAISE EXCEPTION 'moderation_review_resolution_evidence_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER moderation_review_requests_resolution_required
AFTER UPDATE ON moderation_review_requests
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_require_moderation_review_resolution();
