-- Support rollback is permitted only before any case, policy or audit truth
-- exists. Once user intent exists the additive schema remains preserved.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM support_appeals)
    OR EXISTS (SELECT 1 FROM support_messages)
    OR EXISTS (SELECT 1 FROM support_evidence)
    OR EXISTS (SELECT 1 FROM support_case_events)
    OR EXISTS (SELECT 1 FROM support_decisions)
    OR EXISTS (SELECT 1 FROM support_cases)
    OR EXISTS (SELECT 1 FROM support_policy_snapshots)
  THEN
    RAISE EXCEPTION 'Support rollback blocked: support data exists';
  END IF;
END;
$$;

DROP TRIGGER support_cases_update_guard ON support_cases;
DROP TRIGGER support_case_events_append_only ON support_case_events;
DROP TRIGGER support_policy_snapshots_append_only ON support_policy_snapshots;
DROP FUNCTION sit_validate_support_case_update();
DROP FUNCTION sit_reject_support_audit_mutation();

ALTER TABLE support_cases DROP CONSTRAINT support_cases_appeal_fk;
DROP TABLE support_appeals;
DROP TABLE support_messages;
DROP TABLE support_evidence;
DROP TABLE support_case_events;
ALTER TABLE support_cases DROP CONSTRAINT support_cases_decision_fk;
DROP TABLE support_decisions;
DROP TABLE support_cases;
DROP TABLE support_policy_snapshots;
