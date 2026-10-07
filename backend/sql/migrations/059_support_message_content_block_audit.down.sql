DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM audit_log
     WHERE action = 'support.message_content_blocked'
  ) THEN
    RAISE EXCEPTION
      'cannot roll back support message content-block guard while audit evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_support_message_content_block_guard ON audit_log;
DROP FUNCTION IF EXISTS sit_validate_support_message_content_block_audit();
