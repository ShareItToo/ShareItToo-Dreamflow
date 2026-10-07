DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_messages WHERE template_id = 'T-035') THEN
    RAISE EXCEPTION
      'Cannot roll back account recovery guidance while retained message evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS support_account_recovery_message_publication_guard
  ON support_messages;
DROP TRIGGER IF EXISTS support_account_recovery_message_insert_guard
  ON support_messages;
DROP FUNCTION IF EXISTS sit_validate_support_account_recovery_message();
