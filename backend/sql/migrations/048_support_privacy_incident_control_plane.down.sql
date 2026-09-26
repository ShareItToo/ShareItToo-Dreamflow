-- Rollback is permitted only before incident awareness or containment truth exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_privacy_incident_containment_actions)
    OR EXISTS (SELECT 1 FROM support_privacy_incidents)
  THEN
    RAISE EXCEPTION 'Privacy-incident rollback blocked: incident data exists';
  END IF;
END;
$$;

DROP INDEX IF EXISTS support_case_events_privacy_incident_alert_idx;
DROP TRIGGER IF EXISTS support_privacy_incident_actions_append_only
  ON support_privacy_incident_containment_actions;
DROP TRIGGER IF EXISTS support_privacy_incident_actions_apply
  ON support_privacy_incident_containment_actions;
DROP TRIGGER IF EXISTS support_privacy_incident_actions_validate
  ON support_privacy_incident_containment_actions;
DROP FUNCTION IF EXISTS sit_reject_support_privacy_incident_action_mutation();
DROP FUNCTION IF EXISTS sit_apply_support_privacy_incident_action();
DROP FUNCTION IF EXISTS sit_validate_support_privacy_incident_action();
DROP TABLE IF EXISTS support_privacy_incident_containment_actions;
DROP TRIGGER IF EXISTS support_privacy_incidents_validate
  ON support_privacy_incidents;
DROP FUNCTION IF EXISTS sit_validate_support_privacy_incident();
DROP TABLE IF EXISTS support_privacy_incidents;
