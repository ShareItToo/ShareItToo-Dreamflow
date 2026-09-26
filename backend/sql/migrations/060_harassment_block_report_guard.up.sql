CREATE UNIQUE INDEX audit_log_harassment_block_report_request_idx
  ON audit_log(actor_id, request_id)
  WHERE action = 'report.harassment_blocked_for_reporter';

CREATE OR REPLACE FUNCTION sit_validate_harassment_block_report_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  report_target_id TEXT;
BEGIN
  IF NEW.action <> 'report.harassment_blocked_for_reporter' THEN
    RETURN NEW;
  END IF;

  IF NEW.resource_type <> 'report'
     OR NEW.actor_id IS NULL
     OR NEW.actor_role <> 'user'
     OR NEW.request_id IS NULL
     OR NEW.request_id !~ '^report[.]harassment_block:[A-Za-z0-9_.:-]+$'
     OR jsonb_typeof(NEW.metadata) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.metadata)) <> 8
     OR NOT NEW.metadata ?& ARRAY[
       'reasonCode',
       'immediateDanger',
       'directContactBlocked',
       'neutralReviewRequired',
       'guiltDetermined',
       'moderationAccountMeasureTaken',
       'externalActionTaken',
       'requestFingerprint'
     ]
     OR NEW.metadata ->> 'reasonCode' <> 'harassment'
     OR NEW.metadata -> 'immediateDanger' <> 'false'::jsonb
     OR NEW.metadata -> 'directContactBlocked' <> 'true'::jsonb
     OR NEW.metadata -> 'neutralReviewRequired' <> 'true'::jsonb
     OR NEW.metadata -> 'guiltDetermined' <> 'false'::jsonb
     OR NEW.metadata -> 'moderationAccountMeasureTaken' <> 'false'::jsonb
     OR NEW.metadata -> 'externalActionTaken' <> 'false'::jsonb
     OR NEW.metadata ->> 'requestFingerprint' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'harassment block-report audit must remain exact and neutral'
      USING ERRCODE = '23514';
  END IF;

  SELECT report.target_id
    INTO report_target_id
    FROM reports AS report
   WHERE report.id::text = NEW.resource_id
     AND report.reporter_id = NEW.actor_id
     AND report.target_type = 'user'
     AND report.reason_code = 'harassment';

  IF report_target_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM user_blocks
        WHERE blocker_id = NEW.actor_id
          AND blocked_id = report_target_id
          AND unblocked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'harassment block-report audit requires its report and active direct-contact block'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_log_harassment_block_report_guard
BEFORE INSERT ON audit_log
FOR EACH ROW EXECUTE FUNCTION sit_validate_harassment_block_report_audit();
