DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_messages) THEN
    RAISE EXCEPTION 'Support message template-guard rollback blocked: message truth exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_message_delete_guard ON support_messages;
DROP FUNCTION IF EXISTS sit_block_support_message_delete();
DROP TRIGGER IF EXISTS support_message_update_guard ON support_messages;
DROP FUNCTION IF EXISTS sit_validate_support_message_update();
DROP TRIGGER IF EXISTS support_message_insert_guard ON support_messages;
DROP FUNCTION IF EXISTS sit_validate_support_message_insert();
DROP INDEX IF EXISTS support_messages_review_queue_idx;
DROP INDEX IF EXISTS support_messages_recipient_sent_idx;

ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS support_messages_review_truth,
  DROP CONSTRAINT IF EXISTS support_messages_no_external_notification,
  DROP CONSTRAINT IF EXISTS support_messages_sent_truth,
  DROP CONSTRAINT IF EXISTS support_messages_lock_version_positive,
  DROP CONSTRAINT IF EXISTS support_messages_review_notes_length,
  DROP CONSTRAINT IF EXISTS support_messages_review_outcome_check,
  DROP CONSTRAINT IF EXISTS support_messages_approval_hash_format,
  DROP CONSTRAINT IF EXISTS support_messages_rendered_hash_format,
  DROP CONSTRAINT IF EXISTS support_messages_title_length,
  DROP COLUMN IF EXISTS lock_version,
  DROP COLUMN IF EXISTS corrects_message_id,
  DROP COLUMN IF EXISTS review_notes,
  DROP COLUMN IF EXISTS review_outcome,
  DROP COLUMN IF EXISTS reviewed_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS approval_payload_sha256,
  DROP COLUMN IF EXISTS rendered_content_sha256,
  DROP COLUMN IF EXISTS message_title;

ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_approval_state CHECK (
    approval_level = 'green_automatic'
    OR send_status IN ('draft', 'pending_approval')
    OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  );
