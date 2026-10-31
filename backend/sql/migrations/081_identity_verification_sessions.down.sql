DROP TRIGGER IF EXISTS identity_verification_sessions_set_updated_at
  ON identity_verification_sessions;
DROP FUNCTION IF EXISTS sit_identity_verification_sessions_updated_at();
DROP TABLE IF EXISTS identity_verification_webhook_events;
DROP TABLE IF EXISTS identity_verification_sessions;
