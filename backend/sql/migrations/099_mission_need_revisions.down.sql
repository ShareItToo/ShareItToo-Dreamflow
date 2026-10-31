DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM mission_needs) THEN
    RAISE EXCEPTION 'mission_need_rows_active';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS mission_need_commands_immutable_guard ON mission_need_commands;
DROP TRIGGER IF EXISTS mission_need_revisions_immutable_guard ON mission_need_revisions;
DROP TRIGGER IF EXISTS mission_need_revisions_sequence_guard ON mission_need_revisions;
DROP FUNCTION IF EXISTS sit_reject_mission_need_immutable_update();
DROP FUNCTION IF EXISTS sit_validate_mission_need_revision();
DROP TABLE IF EXISTS mission_need_commands;
DROP TABLE IF EXISTS mission_need_revisions;
DROP TABLE IF EXISTS mission_needs;
