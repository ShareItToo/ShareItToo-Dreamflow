-- S4E / SUP-042 and SUP-043: reviewed progress and overdue-update proposals.
-- No user-visible message is published until independent review succeeds and
-- the new case checkpoint is committed atomically by the dedicated workflow.

CREATE TABLE support_case_progress_updates (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES support_cases(id) ON DELETE RESTRICT,
  message_id UUID NOT NULL UNIQUE REFERENCES support_messages(id) ON DELETE RESTRICT,
  progress_version TEXT NOT NULL,
  template_id TEXT NOT NULL,
  prior_next_update_at TIMESTAMPTZ NOT NULL,
  proposed_next_update_at TIMESTAMPTZ NOT NULL,
  was_overdue BOOLEAN NOT NULL,
  expected_case_version INTEGER NOT NULL,
  resulting_case_version INTEGER,
  next_action TEXT NOT NULL,
  proposal_status TEXT NOT NULL DEFAULT 'pending_review',
  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  published_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  publication_idempotency_key TEXT UNIQUE,
  lock_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_case_progress_updates_shape CHECK (
    progress_version = 'sit_support_progress_update_v1'
    AND template_id IN ('T-008', 'T-010')
    AND expected_case_version > 0
    AND (resulting_case_version IS NULL
      OR resulting_case_version = expected_case_version + 1)
    AND proposed_next_update_at > prior_next_update_at
    AND proposed_next_update_at > created_at
    AND proposed_next_update_at <= created_at + INTERVAL '31 days'
    AND char_length(next_action) BETWEEN 3 AND 2000
    AND proposal_status IN ('pending_review', 'approved', 'rejected', 'published')
    AND lock_version > 0
  ),
  CONSTRAINT support_case_progress_updates_lifecycle CHECK (
    (proposal_status = 'pending_review'
      AND reviewed_by IS NULL AND reviewed_at IS NULL
      AND published_by IS NULL AND published_at IS NULL
      AND publication_idempotency_key IS NULL
      AND resulting_case_version IS NULL)
    OR
    (proposal_status IN ('approved', 'rejected')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND published_by IS NULL AND published_at IS NULL
      AND publication_idempotency_key IS NULL
      AND resulting_case_version IS NULL)
    OR
    (proposal_status = 'published'
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND published_by IS NOT NULL AND published_at IS NOT NULL
      AND publication_idempotency_key IS NOT NULL
      AND resulting_case_version = expected_case_version + 1)
  )
);

CREATE UNIQUE INDEX support_case_progress_updates_one_live_proposal
  ON support_case_progress_updates(case_id)
  WHERE proposal_status IN ('pending_review', 'approved');

CREATE INDEX support_case_progress_updates_case_created
  ON support_case_progress_updates(case_id, created_at, id);

CREATE FUNCTION sit_validate_support_progress_update_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  target_message support_messages%ROWTYPE;
BEGIN
  SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_progress_update_case_missing';
  END IF;
  IF target_case.operating_mode NOT IN ('simulation', 'internal_testing') THEN
    RAISE EXCEPTION 'support_progress_update_case_mode_invalid';
  END IF;
  IF target_case.status IN ('resolved', 'closed') THEN
    RAISE EXCEPTION 'support_progress_update_case_inactive';
  END IF;
  IF target_case.lock_version <> NEW.expected_case_version THEN
    RAISE EXCEPTION 'support_progress_update_case_version_mismatch';
  END IF;
  IF date_trunc('milliseconds', target_case.next_update_at)
      IS DISTINCT FROM date_trunc('milliseconds', NEW.prior_next_update_at) THEN
    RAISE EXCEPTION 'support_progress_update_case_deadline_mismatch';
  END IF;
  IF NEW.was_overdue IS DISTINCT FROM (NEW.prior_next_update_at <= NEW.created_at)
    OR NEW.template_id <> (CASE WHEN NEW.was_overdue THEN 'T-010' ELSE 'T-008' END)
  THEN
    RAISE EXCEPTION 'support_progress_update_template_mismatch';
  END IF;
  SELECT * INTO target_message FROM support_messages WHERE id = NEW.message_id;
  IF NOT FOUND
    OR target_message.case_id <> NEW.case_id
    OR target_message.sender_id <> NEW.proposed_by
    OR target_message.template_id <> NEW.template_id
    OR target_message.approval_level <> 'yellow_human_review'
    OR target_message.send_status <> 'pending_approval'
    OR target_message.sent_at IS NOT NULL
    OR target_message.structured_variables ->> 'next_update_date'
      <> to_char(NEW.proposed_next_update_at AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY')
    OR target_message.structured_variables ->> 'next_update_time'
      <> to_char(NEW.proposed_next_update_at AT TIME ZONE 'Europe/Berlin', 'HH24:MI')
  THEN
    RAISE EXCEPTION 'support_progress_update_message_invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_progress_update_insert_guard
BEFORE INSERT ON support_case_progress_updates
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_progress_update_insert();

CREATE FUNCTION sit_validate_support_progress_update_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  target_message support_messages%ROWTYPE;
BEGIN
  IF ROW(
    NEW.id, NEW.case_id, NEW.message_id, NEW.progress_version,
    NEW.template_id, NEW.prior_next_update_at, NEW.proposed_next_update_at,
    NEW.was_overdue, NEW.expected_case_version, NEW.next_action,
    NEW.proposed_by, NEW.idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.case_id, OLD.message_id, OLD.progress_version,
    OLD.template_id, OLD.prior_next_update_at, OLD.proposed_next_update_at,
    OLD.was_overdue, OLD.expected_case_version, OLD.next_action,
    OLD.proposed_by, OLD.idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'support_progress_update_payload_immutable';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'support_progress_update_version_invalid';
  END IF;
  SELECT * INTO target_message FROM support_messages WHERE id = OLD.message_id;
  IF OLD.proposal_status = 'pending_review'
    AND NEW.proposal_status IN ('approved', 'rejected')
  THEN
    IF NEW.reviewed_by IS DISTINCT FROM target_message.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM target_message.reviewed_at
      OR (NEW.proposal_status = 'approved'
        AND target_message.send_status <> 'approved')
      OR (NEW.proposal_status = 'rejected'
        AND target_message.send_status <> 'suppressed')
    THEN
      RAISE EXCEPTION 'support_progress_update_review_mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.proposal_status = 'approved' AND NEW.proposal_status = 'published' THEN
    SELECT * INTO target_case FROM support_cases WHERE id = OLD.case_id;
    IF target_message.send_status <> 'sent'
      OR target_message.sent_at IS NULL
      OR target_case.lock_version <> NEW.resulting_case_version
      OR target_case.next_update_at IS DISTINCT FROM OLD.proposed_next_update_at
      OR target_case.next_action IS DISTINCT FROM OLD.next_action
    THEN
      RAISE EXCEPTION 'support_progress_update_publication_mismatch';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'support_progress_update_lifecycle_invalid';
END;
$$;

CREATE TRIGGER support_progress_update_change_guard
BEFORE UPDATE ON support_case_progress_updates
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_progress_update_change();

CREATE FUNCTION sit_block_support_progress_update_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'support_progress_update_history_append_only';
END;
$$;

CREATE TRIGGER support_progress_update_delete_guard
BEFORE DELETE ON support_case_progress_updates
FOR EACH ROW EXECUTE FUNCTION sit_block_support_progress_update_delete();
