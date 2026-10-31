-- P4-A stores one owner-bound, non-binding dimensional/capacity FitCheck.
-- It never creates a listing, reservation, booking, contract, payment or
-- safety guarantee.

CREATE TABLE mission_fit_checks (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^mission_fit_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_need_id TEXT NOT NULL,
  shelf_item_id TEXT NOT NULL,
  domain_version TEXT NOT NULL CHECK (domain_version = 'P4-A-2026-10-01.1'),
  definition_id TEXT NOT NULL CHECK (definition_id = 'plant_container_dimensional_fit_v1'),
  definition_version TEXT NOT NULL CHECK (
    definition_version = 'P4-A-PLANT-CONTAINER-DIMENSIONAL-2026-10-01.1'
  ),
  planner_core_version TEXT NOT NULL CHECK (planner_core_version = 'G4A-2026-08-21.1'),
  need_key TEXT NOT NULL CHECK (need_key = 'plant_container_equipment'),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (id, mission_need_id),
  FOREIGN KEY (mission_need_id, owner_id)
    REFERENCES mission_needs(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_item_id, owner_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX mission_fit_checks_owner_mission_idx
  ON mission_fit_checks(owner_id, mission_need_id, updated_at DESC, id);

CREATE TABLE mission_fit_check_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fit_check_id TEXT NOT NULL,
  mission_need_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  mission_need_revision INTEGER NOT NULL CHECK (mission_need_revision > 0),
  mission_payload_sha256 CHAR(64) NOT NULL CHECK (mission_payload_sha256 ~ '^[0-9a-f]{64}$'),
  shelf_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(shelf_snapshot) = 'object'
    AND shelf_snapshot ?& ARRAY[
      'shelfItemId', 'domainVersion', 'title', 'categoryKey', 'condition', 'updatedAt'
    ]
  ),
  shelf_snapshot_sha256 CHAR(64) NOT NULL CHECK (shelf_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  requirement_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(requirement_snapshot) = 'object'
    AND requirement_snapshot ?& ARRAY['ownerConfirmed', 'facts']
    AND jsonb_typeof(requirement_snapshot -> 'facts') = 'array'
  ),
  requirement_sha256 CHAR(64) NOT NULL CHECK (requirement_sha256 ~ '^[0-9a-f]{64}$'),
  item_facts JSONB NOT NULL CHECK (jsonb_typeof(item_facts) = 'array'),
  item_facts_sha256 CHAR(64) NOT NULL CHECK (item_facts_sha256 ~ '^[0-9a-f]{64}$'),
  evaluation JSONB NOT NULL CHECK (
    jsonb_typeof(evaluation) = 'object'
    AND evaluation ?& ARRAY[
      'status', 'releaseBlocked', 'reasonCodes', 'orientation', 'scope',
      'bindingStatus', 'safetyGuarantee'
    ]
  ),
  outcome TEXT NOT NULL CHECK (outcome IN ('fit', 'unfit', 'unknown')),
  release_blocked BOOLEAN NOT NULL,
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fit_check_id, revision),
  UNIQUE (id, fit_check_id),
  FOREIGN KEY (fit_check_id, mission_need_id)
    REFERENCES mission_fit_checks(id, mission_need_id) ON DELETE CASCADE,
  FOREIGN KEY (mission_need_id, mission_need_revision)
    REFERENCES mission_need_revisions(mission_need_id, revision) ON DELETE CASCADE,
  CHECK (release_blocked = (outcome <> 'fit')),
  CHECK (evaluation ->> 'status' = outcome),
  CHECK ((evaluation ->> 'releaseBlocked')::boolean = release_blocked),
  CHECK (evaluation ->> 'scope' = 'dimensional_capacity_only'),
  CHECK (evaluation ->> 'bindingStatus' = 'non_binding'),
  CHECK ((evaluation ->> 'safetyGuarantee')::boolean = false)
);

CREATE INDEX mission_fit_check_revisions_fit_idx
  ON mission_fit_check_revisions(fit_check_id, revision DESC, id);

CREATE TABLE mission_fit_check_commands (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$'),
  command_type TEXT NOT NULL CHECK (command_type IN ('create', 'correct')),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  fit_check_id TEXT NOT NULL,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  FOREIGN KEY (fit_check_id, owner_id)
    REFERENCES mission_fit_checks(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (fit_check_id, result_revision)
    REFERENCES mission_fit_check_revisions(fit_check_id, revision) ON DELETE CASCADE
);

CREATE INDEX mission_fit_check_commands_fit_idx
  ON mission_fit_check_commands(fit_check_id, result_revision, created_at);

CREATE OR REPLACE FUNCTION sit_validate_mission_fit_check_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target mission_fit_checks%ROWTYPE;
BEGIN
  SELECT * INTO target
    FROM mission_fit_checks
   WHERE id = NEW.fit_check_id
   FOR UPDATE;
  IF target.id IS NULL
     OR NEW.mission_need_id <> target.mission_need_id
     OR NEW.revision <> target.current_revision + 1 THEN
    RAISE EXCEPTION 'mission_fit_check_revision_invalid' USING ERRCODE = '23514';
  END IF;
  UPDATE mission_fit_checks
     SET current_revision = NEW.revision,
         updated_at = now()
   WHERE id = NEW.fit_check_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_mission_fit_check_root_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() <> 2
     OR NEW.id <> OLD.id
     OR NEW.owner_id <> OLD.owner_id
     OR NEW.mission_need_id <> OLD.mission_need_id
     OR NEW.shelf_item_id <> OLD.shelf_item_id
     OR NEW.domain_version <> OLD.domain_version
     OR NEW.definition_id <> OLD.definition_id
     OR NEW.definition_version <> OLD.definition_version
     OR NEW.planner_core_version <> OLD.planner_core_version
     OR NEW.need_key <> OLD.need_key
     OR NEW.created_at <> OLD.created_at
     OR NEW.current_revision <> OLD.current_revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'mission_fit_check_root_update_invalid' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mission_fit_checks_update_guard
BEFORE UPDATE ON mission_fit_checks
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_fit_check_root_update();

CREATE TRIGGER mission_fit_check_revisions_sequence_guard
BEFORE INSERT ON mission_fit_check_revisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_fit_check_revision();

CREATE OR REPLACE FUNCTION sit_reject_mission_fit_check_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mission_fit_check_immutable_record' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER mission_fit_check_revisions_immutable_guard
BEFORE UPDATE ON mission_fit_check_revisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_fit_check_immutable_update();

CREATE TRIGGER mission_fit_check_commands_immutable_guard
BEFORE UPDATE ON mission_fit_check_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_fit_check_immutable_update();
