ALTER TABLE support_messages
  ADD COLUMN message_title TEXT,
  ADD COLUMN rendered_content_sha256 CHAR(64),
  ADD COLUMN approval_payload_sha256 CHAR(64),
  ADD COLUMN reviewed_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN review_outcome TEXT,
  ADD COLUMN review_notes TEXT,
  ADD COLUMN corrects_message_id UUID REFERENCES support_messages(id) ON DELETE RESTRICT,
  ADD COLUMN lock_version INTEGER NOT NULL DEFAULT 1;

UPDATE support_messages
SET message_title = COALESCE(NULLIF(template_id, ''), 'Supportnachricht'),
    rendered_content_sha256 = encode(digest(rendered_content, 'sha256'), 'hex');

ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS support_messages_check,
  DROP CONSTRAINT IF EXISTS support_messages_approval_state,
  ALTER COLUMN message_title SET NOT NULL,
  ALTER COLUMN rendered_content_sha256 SET NOT NULL,
  ADD CONSTRAINT support_messages_title_length
    CHECK (char_length(message_title) BETWEEN 3 AND 200),
  ADD CONSTRAINT support_messages_rendered_hash_format
    CHECK (rendered_content_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT support_messages_approval_hash_format
    CHECK (approval_payload_sha256 IS NULL OR approval_payload_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT support_messages_review_outcome_check
    CHECK (review_outcome IS NULL OR review_outcome IN ('approved', 'rejected')),
  ADD CONSTRAINT support_messages_review_notes_length
    CHECK (review_notes IS NULL OR char_length(review_notes) BETWEEN 12 AND 1000),
  ADD CONSTRAINT support_messages_lock_version_positive
    CHECK (lock_version > 0),
  ADD CONSTRAINT support_messages_sent_truth
    CHECK (
      (send_status = 'sent' AND sent_at IS NOT NULL AND delivery_status = 'in_app_recorded')
      OR (send_status <> 'sent' AND sent_at IS NULL)
    ),
  ADD CONSTRAINT support_messages_no_external_notification
    CHECK (notification_ids = '{}'),
  ADD CONSTRAINT support_messages_review_truth
    CHECK (
      (approval_level = 'green_automatic'
        AND reviewed_by IS NULL AND reviewed_at IS NULL
        AND review_outcome IS NULL AND review_notes IS NULL
        AND approved_by IS NULL AND approved_at IS NULL
        AND approval_payload_sha256 IS NULL
        AND send_status IN ('draft', 'sent', 'suppressed'))
      OR
      (approval_level IN ('yellow_human_review', 'red_explicit_decision')
        AND send_status = 'pending_approval'
        AND reviewed_by IS NULL AND reviewed_at IS NULL
        AND review_outcome IS NULL AND review_notes IS NULL
        AND approved_by IS NULL AND approved_at IS NULL
        AND approval_payload_sha256 IS NULL)
      OR
      (approval_level IN ('yellow_human_review', 'red_explicit_decision')
        AND send_status IN ('approved', 'sent')
        AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND review_outcome = 'approved' AND review_notes IS NOT NULL
        AND approved_by = reviewed_by AND approved_at = reviewed_at
        AND approval_payload_sha256 = rendered_content_sha256)
      OR
      (approval_level IN ('yellow_human_review', 'red_explicit_decision')
        AND send_status = 'suppressed'
        AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND review_outcome = 'rejected' AND review_notes IS NOT NULL
        AND approved_by IS NULL AND approved_at IS NULL
        AND approval_payload_sha256 IS NULL)
    );

CREATE INDEX support_messages_recipient_sent_idx
  ON support_messages(recipient_user_id, sent_at DESC, id)
  WHERE send_status = 'sent';

CREATE INDEX support_messages_review_queue_idx
  ON support_messages(send_status, created_at, id)
  WHERE send_status = 'pending_approval';

CREATE OR REPLACE FUNCTION sit_validate_support_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_case support_cases%ROWTYPE;
  sender users%ROWTYPE;
  correction support_messages%ROWTYPE;
BEGIN
  IF NEW.rendered_content_sha256 <> encode(digest(NEW.rendered_content, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'Support message rendered-content hash mismatch';
  END IF;
  IF NEW.template_id IS NULL OR NEW.template_id !~ '^T-[0-9]{3}$'
    OR NEW.template_version IS NULL OR NEW.template_version <> '1.0.0'
  THEN
    RAISE EXCEPTION 'Support message requires a versioned packet template';
  END IF;
  IF NEW.sender_type <> 'support' OR NEW.sender_id IS NULL THEN
    RAISE EXCEPTION 'Support template messages require an accountable staff sender';
  END IF;
  SELECT * INTO target_case FROM support_cases WHERE id = NEW.case_id;
  IF NOT FOUND OR target_case.operating_mode NOT IN ('simulation', 'internal_testing') THEN
    RAISE EXCEPTION 'Support message delivery is restricted to non-live cases';
  END IF;
  IF NEW.recipient_user_id <> target_case.reporter_user_id
    AND NOT (NEW.recipient_user_id = ANY(target_case.affected_user_ids))
  THEN
    RAISE EXCEPTION 'Support message recipient is outside the case';
  END IF;
  SELECT * INTO sender FROM users WHERE id = NEW.sender_id;
  IF NOT FOUND OR sender.role NOT IN ('support', 'admin')
    OR sender.account_status <> 'active' OR sender.deactivated_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'Support message sender must be active staff';
  END IF;
  IF sender.role = 'support' AND target_case.current_owner_id IS DISTINCT FROM sender.id THEN
    RAISE EXCEPTION 'Support message sender must own the case';
  END IF;
  IF NEW.corrects_message_id IS NOT NULL THEN
    SELECT * INTO correction FROM support_messages WHERE id = NEW.corrects_message_id;
    IF NOT FOUND OR correction.id = NEW.id
      OR correction.case_id <> NEW.case_id
      OR correction.recipient_user_id <> NEW.recipient_user_id
      OR correction.send_status <> 'sent' OR correction.sent_at IS NULL
    THEN
      RAISE EXCEPTION 'Support message correction target must be an immutable sent message';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_message_insert_guard
BEFORE INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_message_insert();

CREATE OR REPLACE FUNCTION sit_validate_support_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  reviewer users%ROWTYPE;
BEGIN
  IF ROW(
    NEW.id, NEW.case_id, NEW.sender_type, NEW.sender_id, NEW.recipient_user_id,
    NEW.message_type, NEW.message_title, NEW.template_id, NEW.template_version,
    NEW.locale, NEW.rendered_content, NEW.rendered_content_sha256,
    NEW.structured_variables, NEW.approval_level, NEW.notification_ids,
    NEW.ai_disclosure_included, NEW.human_handoff_available,
    NEW.corrects_message_id, NEW.idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.case_id, OLD.sender_type, OLD.sender_id, OLD.recipient_user_id,
    OLD.message_type, OLD.message_title, OLD.template_id, OLD.template_version,
    OLD.locale, OLD.rendered_content, OLD.rendered_content_sha256,
    OLD.structured_variables, OLD.approval_level, OLD.notification_ids,
    OLD.ai_disclosure_included, OLD.human_handoff_available,
    OLD.corrects_message_id, OLD.idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Support message payload is immutable';
  END IF;
  IF OLD.send_status IN ('sent', 'suppressed') THEN
    RAISE EXCEPTION 'Published or suppressed support messages are immutable';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'Support message update requires one version increment';
  END IF;
  IF NOT (
    (OLD.approval_level = 'green_automatic' AND OLD.send_status = 'draft'
      AND NEW.send_status IN ('sent', 'suppressed'))
    OR
    (OLD.approval_level IN ('yellow_human_review', 'red_explicit_decision')
      AND OLD.send_status = 'pending_approval'
      AND NEW.send_status IN ('approved', 'suppressed'))
    OR
    (OLD.approval_level IN ('yellow_human_review', 'red_explicit_decision')
      AND OLD.send_status = 'approved' AND NEW.send_status = 'sent')
  ) THEN
    RAISE EXCEPTION 'Invalid support message lifecycle transition';
  END IF;
  IF NEW.reviewed_by IS NOT NULL THEN
    SELECT * INTO reviewer FROM users WHERE id = NEW.reviewed_by;
    IF NOT FOUND OR reviewer.role <> 'admin'
      OR reviewer.account_status <> 'active' OR reviewer.deactivated_at IS NOT NULL
      OR reviewer.id = NEW.sender_id
    THEN
      RAISE EXCEPTION 'Support message review requires independent active admin';
    END IF;
  END IF;
  IF NEW.send_status = 'sent'
    AND NEW.approval_level <> 'green_automatic'
    AND NEW.approval_payload_sha256 IS DISTINCT FROM NEW.rendered_content_sha256
  THEN
    RAISE EXCEPTION 'Support message approval no longer matches payload';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_message_update_guard
BEFORE UPDATE ON support_messages
FOR EACH ROW EXECUTE FUNCTION sit_validate_support_message_update();

CREATE OR REPLACE FUNCTION sit_block_support_message_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Support message history is append-only';
END;
$$;

CREATE TRIGGER support_message_delete_guard
BEFORE DELETE ON support_messages
FOR EACH ROW EXECUTE FUNCTION sit_block_support_message_delete();
