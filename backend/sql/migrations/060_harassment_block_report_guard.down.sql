DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM audit_log
     WHERE action = 'report.harassment_blocked_for_reporter'
  ) THEN
    RAISE EXCEPTION
      'cannot roll back harassment block-report guard while audit evidence exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_harassment_block_report_guard ON audit_log;
DROP FUNCTION IF EXISTS sit_validate_harassment_block_report_audit();
DROP INDEX IF EXISTS audit_log_harassment_block_report_request_idx;
