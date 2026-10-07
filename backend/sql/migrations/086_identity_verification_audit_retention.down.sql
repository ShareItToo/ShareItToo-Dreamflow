DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
DROP FUNCTION IF EXISTS sit_reject_identity_audit_retention();
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

-- Restore the original global audit trigger function verbatim if a deployment
-- rolls back this retention migration.
CREATE OR REPLACE FUNCTION sit_reject_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
