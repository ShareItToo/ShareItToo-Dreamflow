DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_supply_demands) THEN
    RAISE EXCEPTION 'mission_supply_demand_rows_active' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_demand_revisions) THEN
    RAISE EXCEPTION 'mission_supply_demand_revision_rows_active' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_releases) THEN
    RAISE EXCEPTION 'mission_supply_release_rows_active' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_demand_commands) THEN
    RAISE EXCEPTION 'mission_supply_demand_command_rows_active' USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER mission_supply_demand_commands_immutable_guard ON mission_supply_demand_commands;
DROP TRIGGER mission_supply_releases_immutable_guard ON mission_supply_releases;
DROP TRIGGER mission_supply_demand_revisions_immutable_guard ON mission_supply_demand_revisions;
DROP TRIGGER mission_supply_demand_revisions_sequence_guard ON mission_supply_demand_revisions;
DROP TRIGGER mission_supply_demands_update_guard ON mission_supply_demands;
DROP FUNCTION sit_reject_mission_supply_demand_immutable_update();
DROP FUNCTION sit_validate_mission_supply_demand_revision();
DROP FUNCTION sit_validate_mission_supply_demand_root_update();
DROP TABLE mission_supply_demand_commands;
DROP TABLE mission_supply_releases;
DROP TABLE mission_supply_demand_revisions;
DROP TABLE mission_supply_demands;
ALTER TABLE mission_inventory_resolution_revisions
  DROP CONSTRAINT mission_inventory_resolution_revisions_p6_binding_unique;
ALTER TABLE mission_inventory_resolution_assignments
  DROP CONSTRAINT mission_inventory_resolution_assignments_p6_gap_unique;
ALTER TABLE mission_need_revisions
  DROP CONSTRAINT mission_need_revisions_p6_binding_unique;
