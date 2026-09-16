-- Rollback is permitted only before any privacy-rights request truth exists.
-- Once intake, identity verification or an extension has been recorded the
-- additive records remain preserved.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_privacy_deadline_extensions)
    OR EXISTS (SELECT 1 FROM support_privacy_identity_verifications)
    OR EXISTS (SELECT 1 FROM support_privacy_rights_requests)
  THEN
    RAISE EXCEPTION 'Privacy-rights rollback blocked: request data exists';
  END IF;
END;
$$;

DROP INDEX IF EXISTS support_case_events_privacy_deadline_alert_idx;
DROP TRIGGER IF EXISTS support_privacy_deadline_extensions_validate
  ON support_privacy_deadline_extensions;
DROP FUNCTION IF EXISTS sit_validate_support_privacy_extension();
DROP TRIGGER IF EXISTS support_privacy_identity_verifications_validate
  ON support_privacy_identity_verifications;
DROP FUNCTION IF EXISTS sit_validate_support_privacy_identity_verification();
DROP TRIGGER IF EXISTS support_privacy_rights_requests_validate
  ON support_privacy_rights_requests;
DROP FUNCTION IF EXISTS sit_validate_support_privacy_request();
DROP TABLE IF EXISTS support_privacy_deadline_extensions;
DROP TABLE IF EXISTS support_privacy_identity_verifications;
DROP TABLE IF EXISTS support_privacy_rights_requests;
