-- S4H / SUP-095 + SUP-096: account restrictions are either explicitly
-- provisional and finite, or payload-bound to an independent approval.

CREATE TABLE moderation_account_suspension_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  report_id UUID REFERENCES reports(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_sha256 CHAR(64) GENERATED ALWAYS AS (
    encode(digest(payload::text, 'sha256'), 'hex')
  ) STORED,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  approved_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  approval_payload_sha256 CHAR(64),
  rejected_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  applied_suspension_id UUID,
  proposal_idempotency_key TEXT NOT NULL UNIQUE,
  review_idempotency_key TEXT UNIQUE,
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT moderation_account_suspension_proposals_truth_check CHECK (
    (status = 'pending'
      AND approved_by IS NULL AND approved_at IS NULL
      AND approval_payload_sha256 IS NULL
      AND rejected_by IS NULL AND rejected_at IS NULL
      AND rejection_reason IS NULL AND applied_suspension_id IS NULL
      AND review_idempotency_key IS NULL)
    OR
    (status = 'approved'
      AND approved_by IS NOT NULL AND approved_by <> proposed_by
      AND approved_at IS NOT NULL
      AND approval_payload_sha256 = payload_sha256
      AND rejected_by IS NULL AND rejected_at IS NULL
      AND rejection_reason IS NULL AND applied_suspension_id IS NOT NULL
      AND review_idempotency_key IS NOT NULL)
    OR
    (status = 'rejected'
      AND approved_by IS NULL AND approved_at IS NULL
      AND approval_payload_sha256 IS NULL
      AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL
      AND rejected_by <> proposed_by
      AND char_length(rejection_reason) BETWEEN 3 AND 2000
      AND applied_suspension_id IS NULL
      AND review_idempotency_key IS NOT NULL)
  )
);

CREATE UNIQUE INDEX moderation_account_suspension_one_pending_user_idx
  ON moderation_account_suspension_proposals(user_id)
  WHERE status = 'pending';
CREATE INDEX moderation_account_suspension_proposals_status_time_idx
  ON moderation_account_suspension_proposals(status, created_at, id);

CREATE OR REPLACE FUNCTION sit_validate_account_suspension_proposal_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.proposed_by AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'account_suspension_proposer_admin_required'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.payload->>'version' <> 'sit_account_suspension_proposal_v1'
    OR NEW.payload->>'userId' <> NEW.user_id
    OR NEW.payload->>'scope' <> 'account'
    OR NEW.payload->>'durationType' <> 'until_reversed'
    OR NEW.payload->>'noGuiltDetermination' <> 'true'
    OR NEW.payload->>'userFacingMeasureNotice' <>
      'Diese Kontoeinschränkung wurde nach unabhängiger Prüfung freigegeben. Sie ist keine Feststellung strafrechtlicher oder zivilrechtlicher Schuld.'
    OR NEW.payload->>'reasonCode' IS NULL
    OR NEW.payload->'decision' IS NULL
  THEN
    RAISE EXCEPTION 'account_suspension_proposal_payload_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moderation_account_suspension_proposals_insert_guard
BEFORE INSERT ON moderation_account_suspension_proposals
FOR EACH ROW EXECUTE FUNCTION sit_validate_account_suspension_proposal_insert();

ALTER TABLE moderation_decisions
  ADD COLUMN measure_status TEXT NOT NULL DEFAULT 'standard' CHECK (
    measure_status IN ('standard', 'provisional', 'approved')
  ),
  ADD COLUMN no_guilt_determination BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN user_facing_measure_notice TEXT,
  ADD COLUMN account_suspension_proposal_id UUID
    REFERENCES moderation_account_suspension_proposals(id) ON DELETE RESTRICT,
  ADD CONSTRAINT moderation_decisions_account_measure_context_check CHECK (
    (measure_type <> 'account_suspension'
      AND measure_status = 'standard'
      AND no_guilt_determination = false
      AND user_facing_measure_notice IS NULL
      AND account_suspension_proposal_id IS NULL)
    OR
    (measure_type = 'account_suspension' AND measure_status = 'standard'
      AND no_guilt_determination = false
      AND user_facing_measure_notice IS NULL
      AND account_suspension_proposal_id IS NULL)
    OR
    (measure_type = 'account_suspension' AND measure_status = 'provisional'
      AND no_guilt_determination = true
      AND user_facing_measure_notice =
        'Diese Kontoeinschränkung ist vorläufig. Sie ist keine Feststellung von Schuld oder eines Verstoßes. Die Prüfung ist noch nicht abgeschlossen.'
      AND account_suspension_proposal_id IS NULL)
    OR
    (measure_type = 'account_suspension' AND measure_status = 'approved'
      AND no_guilt_determination = true
      AND user_facing_measure_notice =
        'Diese Kontoeinschränkung wurde nach unabhängiger Prüfung freigegeben. Sie ist keine Feststellung strafrechtlicher oder zivilrechtlicher Schuld.'
      AND account_suspension_proposal_id IS NOT NULL)
  );

ALTER TABLE user_suspensions
  ADD COLUMN measure_status TEXT NOT NULL DEFAULT 'legacy' CHECK (
    measure_status IN ('legacy', 'scope', 'provisional', 'approved')
  ),
  ADD COLUMN no_guilt_determination BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN user_facing_notice TEXT,
  ADD COLUMN account_suspension_proposal_id UUID
    REFERENCES moderation_account_suspension_proposals(id) ON DELETE RESTRICT,
  ADD COLUMN moderation_decision_id UUID
    REFERENCES moderation_decisions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT user_suspensions_measure_context_check CHECK (
    (measure_status = 'legacy'
      AND no_guilt_determination = false
      AND user_facing_notice IS NULL
      AND account_suspension_proposal_id IS NULL
      AND moderation_decision_id IS NULL)
    OR
    (scope <> 'account' AND measure_status = 'scope'
      AND no_guilt_determination = false
      AND user_facing_notice IS NULL
      AND account_suspension_proposal_id IS NULL
      AND moderation_decision_id IS NOT NULL)
    OR
    (scope = 'account' AND measure_status = 'provisional'
      AND ends_at IS NOT NULL
      AND no_guilt_determination = true
      AND user_facing_notice =
        'Diese Kontoeinschränkung ist vorläufig. Sie ist keine Feststellung von Schuld oder eines Verstoßes. Die Prüfung ist noch nicht abgeschlossen.'
      AND account_suspension_proposal_id IS NULL
      AND moderation_decision_id IS NOT NULL)
    OR
    (scope = 'account' AND measure_status = 'approved'
      AND ends_at IS NULL
      AND no_guilt_determination = true
      AND user_facing_notice =
        'Diese Kontoeinschränkung wurde nach unabhängiger Prüfung freigegeben. Sie ist keine Feststellung strafrechtlicher oder zivilrechtlicher Schuld.'
      AND account_suspension_proposal_id IS NOT NULL
      AND moderation_decision_id IS NOT NULL)
  );

ALTER TABLE moderation_account_suspension_proposals
  ADD CONSTRAINT moderation_account_suspension_proposals_applied_fk
  FOREIGN KEY (applied_suspension_id) REFERENCES user_suspensions(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION sit_validate_account_suspension_proposal_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.user_id, NEW.proposed_by, NEW.report_id, NEW.payload,
    NEW.proposal_idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.user_id, OLD.proposed_by, OLD.report_id, OLD.payload,
    OLD.proposal_idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'account_suspension_proposal_payload_immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'account_suspension_proposal_review_final'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'account_suspension_proposal_transition_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'account_suspension_proposal_lock_version_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'account_suspension_proposal_updated_at_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users
     WHERE id = COALESCE(NEW.approved_by, NEW.rejected_by) AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'account_suspension_reviewer_admin_required'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moderation_account_suspension_proposals_update_guard
BEFORE UPDATE ON moderation_account_suspension_proposals
FOR EACH ROW EXECUTE FUNCTION sit_validate_account_suspension_proposal_update();

CREATE OR REPLACE FUNCTION sit_validate_new_user_suspension_measure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  proposal moderation_account_suspension_proposals%ROWTYPE;
  decision moderation_decisions%ROWTYPE;
BEGIN
  IF NEW.measure_status = 'legacy' THEN
    RAISE EXCEPTION 'new_legacy_suspension_forbidden' USING ERRCODE = '23514';
  END IF;
  IF NEW.scope = 'account' AND NEW.measure_status = 'approved' THEN
    SELECT * INTO proposal
      FROM moderation_account_suspension_proposals
     WHERE id = NEW.account_suspension_proposal_id;
    IF NOT FOUND
      OR proposal.status <> 'approved'
      OR proposal.user_id <> NEW.user_id
      OR proposal.applied_suspension_id <> NEW.id
      OR proposal.payload->>'reasonCode' <> NEW.reason_code
      OR COALESCE(proposal.report_id::text, '') <> COALESCE(NEW.report_id::text, '')
      OR NEW.imposed_by <> proposal.approved_by
    THEN
      RAISE EXCEPTION 'approved_account_suspension_evidence_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.scope = 'account' THEN
    SELECT * INTO decision
      FROM moderation_decisions WHERE id = NEW.moderation_decision_id;
    IF NOT FOUND
      OR decision.recipient_user_id <> NEW.user_id
      OR decision.measure_type <> 'account_suspension'
      OR decision.measure_status <> NEW.measure_status
      OR decision.no_guilt_determination <> NEW.no_guilt_determination
      OR decision.user_facing_measure_notice <> NEW.user_facing_notice
      OR COALESCE(decision.account_suspension_proposal_id::text, '') <>
         COALESCE(NEW.account_suspension_proposal_id::text, '')
      OR decision.issued_by <> NEW.imposed_by
    THEN
      RAISE EXCEPTION 'account_suspension_decision_evidence_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_suspensions_measure_guard
BEFORE INSERT ON user_suspensions
FOR EACH ROW EXECUTE FUNCTION sit_validate_new_user_suspension_measure();

CREATE OR REPLACE FUNCTION sit_validate_new_moderation_account_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  proposal moderation_account_suspension_proposals%ROWTYPE;
BEGIN
  IF NEW.measure_type = 'account_suspension' AND NEW.measure_status = 'standard' THEN
    RAISE EXCEPTION 'account_suspension_decision_context_required'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.measure_type = 'account_suspension' AND NEW.measure_status = 'approved' THEN
    SELECT * INTO proposal
      FROM moderation_account_suspension_proposals
     WHERE id = NEW.account_suspension_proposal_id;
    IF NOT FOUND
      OR proposal.status <> 'approved'
      OR proposal.user_id <> NEW.recipient_user_id
      OR COALESCE(proposal.report_id::text, '') <> COALESCE(NEW.report_id::text, '')
      OR proposal.payload->'decision'->>'facts' <> NEW.facts
      OR proposal.payload->'decision'->>'basis' <> NEW.basis
      OR proposal.payload->'decision'->>'reasoning' <> NEW.reasoning
      OR NEW.issued_by <> proposal.approved_by
    THEN
      RAISE EXCEPTION 'approved_account_decision_evidence_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER moderation_decisions_account_measure_guard
BEFORE INSERT ON moderation_decisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_new_moderation_account_decision();
