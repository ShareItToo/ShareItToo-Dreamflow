DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_inventory_resolutions) THEN
    RAISE EXCEPTION 'mission_inventory_resolution_rows_active' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_inventory_resolution_revisions) THEN
    RAISE EXCEPTION 'mission_inventory_resolution_revision_rows_active' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_inventory_resolution_assignments) THEN
    RAISE EXCEPTION 'mission_inventory_resolution_assignment_rows_active' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_inventory_resolution_commands) THEN
    RAISE EXCEPTION 'mission_inventory_resolution_command_rows_active' USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER mission_inventory_resolution_commands_immutable_guard
  ON mission_inventory_resolution_commands;
DROP TRIGGER mission_inventory_resolution_assignments_immutable_guard
  ON mission_inventory_resolution_assignments;
DROP TRIGGER mission_inventory_resolution_revisions_immutable_guard
  ON mission_inventory_resolution_revisions;
DROP TRIGGER mission_inventory_resolution_revisions_sequence_guard
  ON mission_inventory_resolution_revisions;
DROP TRIGGER mission_inventory_resolutions_update_guard
  ON mission_inventory_resolutions;
DROP FUNCTION sit_reject_mission_inventory_resolution_immutable_update();
DROP FUNCTION sit_validate_mission_inventory_resolution_revision();
DROP FUNCTION sit_validate_mission_inventory_resolution_root_update();
DROP TABLE mission_inventory_resolution_commands;
DROP TABLE mission_inventory_resolution_assignments;
DROP TABLE mission_inventory_resolution_revisions;
DROP TABLE mission_inventory_resolutions;
