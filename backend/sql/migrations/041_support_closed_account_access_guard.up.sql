-- S3M / SUP-029: retained support records must not imply that a closed
-- account can still receive an in-app support message.

CREATE OR REPLACE FUNCTION sit_require_active_support_message_recipient()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recipient users%ROWTYPE;
BEGIN
  SELECT * INTO recipient
    FROM users
   WHERE id = NEW.recipient_user_id
   FOR KEY SHARE;

  IF NOT FOUND OR recipient.account_status <> 'active'
    OR recipient.deactivated_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'Support message recipient account must be active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_message_active_recipient_insert_guard
BEFORE INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION sit_require_active_support_message_recipient();

CREATE TRIGGER support_message_active_recipient_publish_guard
BEFORE UPDATE OF send_status ON support_messages
FOR EACH ROW
WHEN (NEW.send_status = 'sent' AND OLD.send_status IS DISTINCT FROM 'sent')
EXECUTE FUNCTION sit_require_active_support_message_recipient();
