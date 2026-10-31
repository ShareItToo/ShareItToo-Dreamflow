DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_fit_checks)
     OR EXISTS (SELECT 1 FROM mission_fit_check_revisions)
     OR EXISTS (SELECT 1 FROM mission_fit_check_commands) THEN
    RAISE EXCEPTION 'mission_fit_check_rows_active' USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER mission_fit_check_commands_immutable_guard ON mission_fit_check_commands;
DROP TRIGGER mission_fit_check_revisions_immutable_guard ON mission_fit_check_revisions;
DROP TRIGGER mission_fit_check_revisions_sequence_guard ON mission_fit_check_revisions;
DROP TRIGGER mission_fit_checks_update_guard ON mission_fit_checks;
DROP FUNCTION sit_reject_mission_fit_check_immutable_update();
DROP FUNCTION sit_validate_mission_fit_check_revision();
DROP FUNCTION sit_validate_mission_fit_check_root_update();
DROP TABLE mission_fit_check_commands;
DROP TABLE mission_fit_check_revisions;
DROP TABLE mission_fit_checks;
