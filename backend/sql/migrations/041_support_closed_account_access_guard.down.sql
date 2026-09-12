DROP TRIGGER IF EXISTS support_message_active_recipient_publish_guard
  ON support_messages;
DROP TRIGGER IF EXISTS support_message_active_recipient_insert_guard
  ON support_messages;
DROP FUNCTION IF EXISTS sit_require_active_support_message_recipient();
