DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_supply_participation_item_commands) THEN
    RAISE EXCEPTION 'mission_supply_participation_item_command_rows_active'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_participation_item_revisions) THEN
    RAISE EXCEPTION 'mission_supply_participation_item_revision_rows_active'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_participation_commands) THEN
    RAISE EXCEPTION 'mission_supply_participation_command_rows_active'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_participation_revisions) THEN
    RAISE EXCEPTION 'mission_supply_participation_revision_rows_active'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM mission_supply_participations) THEN
    RAISE EXCEPTION 'mission_supply_participation_rows_active'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

DROP TRIGGER mission_supply_participation_item_commands_immutable_guard
  ON mission_supply_participation_item_commands;
DROP TRIGGER mission_supply_participation_commands_immutable_guard
  ON mission_supply_participation_commands;
DROP TRIGGER mission_supply_participation_item_revisions_immutable_guard
  ON mission_supply_participation_item_revisions;
DROP TRIGGER mission_supply_participation_revisions_immutable_guard
  ON mission_supply_participation_revisions;
DROP TRIGGER mission_supply_participation_item_revisions_sequence_guard
  ON mission_supply_participation_item_revisions;
DROP TRIGGER mission_supply_participation_revisions_sequence_guard
  ON mission_supply_participation_revisions;
DROP FUNCTION sit_reject_mission_supply_participation_immutable_update();
DROP FUNCTION sit_validate_mission_supply_participation_item_revision();
DROP FUNCTION sit_validate_mission_supply_participation_revision();
DROP TABLE mission_supply_participation_item_commands;
DROP TABLE mission_supply_participation_item_revisions;
DROP TABLE mission_supply_participation_commands;
DROP TABLE mission_supply_participation_revisions;
DROP TABLE mission_supply_participations;
