-- Identity-verification audit entries are attributable personal data. The
-- global append-only trigger remains unchanged for every other table/resource;
-- only this dedicated audit trigger permits the bounded, transaction-local
-- retention exception for old redacted identity rows.
CREATE OR REPLACE FUNCTION sit_reject_identity_audit_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- PostgreSQL performs this narrow FK hygiene UPDATE when a referenced
  -- actor account is erased. It changes no audit fact and must not be treated
  -- as an application mutation.
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND OLD.id = NEW.id
     AND OLD.actor_role = NEW.actor_role
     AND OLD.action = NEW.action
     AND OLD.resource_type = NEW.resource_type
     AND OLD.resource_id = NEW.resource_id
     AND OLD.request_id IS NOT DISTINCT FROM NEW.request_id
     AND OLD.before_hash IS NOT DISTINCT FROM NEW.before_hash
     AND OLD.after_hash IS NOT DISTINCT FROM NEW.after_hash
     AND OLD.metadata IS NOT DISTINCT FROM NEW.metadata
     AND OLD.created_at = NEW.created_at THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
     AND OLD.resource_type = 'identity_verification_session'
     AND OLD.created_at <= now() - interval '30 days'
     AND EXISTS (
       SELECT 1
         FROM identity_verification_sessions AS session
        WHERE session.id = OLD.resource_id
          AND session.status = 'redacted'
          AND session.created_at <= now() - interval '30 days'
     )
     AND current_setting('sit.identity_audit_retention', true) = '1' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_reject_identity_audit_retention();
