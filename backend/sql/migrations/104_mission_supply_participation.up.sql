-- P6-C1 adds only the private, owner-controlled eligibility foundation.
-- It stores no location, address, listing, message, notification, contract,
-- payment or provider data.  It is standard-off until a later gate proves
-- location/radius semantics and the user-facing legal wording.

CREATE TABLE mission_supply_participations (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^mission_supply_participation_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_version TEXT NOT NULL CHECK (
    domain_version = 'P6-C1-2026-10-02.1'
  ),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  current_status TEXT NOT NULL DEFAULT 'withdrawn' CHECK (
    current_status IN ('active', 'withdrawn')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (owner_id)
);

CREATE INDEX mission_supply_participations_owner_idx
  ON mission_supply_participations(owner_id, updated_at DESC, id);

CREATE TABLE mission_supply_participation_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participation_id, revision),
  UNIQUE (id, participation_id, revision),
  FOREIGN KEY (participation_id, owner_id)
    REFERENCES mission_supply_participations(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX mission_supply_participation_revisions_owner_idx
  ON mission_supply_participation_revisions(owner_id, participation_id, revision);

CREATE TABLE mission_supply_participation_commands (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$'
  ),
  command_type TEXT NOT NULL CHECK (
    command_type IN ('activate', 'withdraw')
  ),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  participation_id TEXT NOT NULL,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  FOREIGN KEY (participation_id, owner_id)
    REFERENCES mission_supply_participations(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (participation_id, result_revision)
    REFERENCES mission_supply_participation_revisions(participation_id, revision)
    ON DELETE CASCADE
);

CREATE INDEX mission_supply_participation_commands_root_idx
  ON mission_supply_participation_commands(participation_id, result_revision, created_at);

CREATE TABLE mission_supply_participation_item_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  shelf_item_id TEXT NOT NULL,
  need_key TEXT NOT NULL CHECK (
    need_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$'
  ),
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  availability_status TEXT NOT NULL CHECK (
    availability_status IN ('confirmed_available', 'withdrawn')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (participation_id, shelf_item_id, need_key, revision),
  UNIQUE (id, participation_id, shelf_item_id, need_key, revision),
  FOREIGN KEY (participation_id, owner_id)
    REFERENCES mission_supply_participations(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_item_id, owner_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX mission_supply_participation_item_current_idx
  ON mission_supply_participation_item_revisions(
    participation_id, shelf_item_id, need_key, revision DESC
  );

CREATE TABLE mission_supply_participation_item_commands (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$'
  ),
  command_type TEXT NOT NULL CHECK (command_type IN ('confirm', 'withdraw')),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  participation_id TEXT NOT NULL,
  shelf_item_id TEXT NOT NULL,
  need_key TEXT NOT NULL CHECK (
    need_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$'
  ),
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  result_status TEXT NOT NULL CHECK (
    result_status IN ('confirmed_available', 'withdrawn')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  CHECK (
    (command_type = 'confirm' AND result_status = 'confirmed_available')
    OR (command_type = 'withdraw' AND result_status = 'withdrawn')
  ),
  FOREIGN KEY (participation_id, owner_id)
    REFERENCES mission_supply_participations(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (shelf_item_id, owner_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (
    participation_id, shelf_item_id, need_key, result_revision
  ) REFERENCES mission_supply_participation_item_revisions(
    participation_id, shelf_item_id, need_key, revision
  ) ON DELETE CASCADE
);

CREATE INDEX mission_supply_participation_item_commands_item_idx
  ON mission_supply_participation_item_commands(
    participation_id, shelf_item_id, need_key, result_revision, created_at
  );

CREATE OR REPLACE FUNCTION sit_validate_mission_supply_participation_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target mission_supply_participations%ROWTYPE;
BEGIN
  SELECT * INTO target
    FROM mission_supply_participations
   WHERE id = NEW.participation_id
   FOR UPDATE;
  IF target.id IS NULL
     OR NEW.owner_id <> target.owner_id
     OR NEW.actor_id <> target.owner_id
     OR NEW.revision <> target.current_revision + 1 THEN
    RAISE EXCEPTION 'mission_supply_participation_revision_invalid'
      USING ERRCODE = '23514';
  END IF;
  UPDATE mission_supply_participations
     SET current_revision = NEW.revision,
         current_status = NEW.status,
         updated_at = now()
   WHERE id = NEW.participation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mission_supply_participation_revisions_sequence_guard
BEFORE INSERT ON mission_supply_participation_revisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_supply_participation_revision();

CREATE OR REPLACE FUNCTION sit_validate_mission_supply_participation_item_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  participation mission_supply_participations%ROWTYPE;
  expected_revision INTEGER;
BEGIN
  SELECT * INTO participation
    FROM mission_supply_participations
   WHERE id = NEW.participation_id
   FOR UPDATE;
  SELECT COALESCE(MAX(revision), 0) + 1 INTO expected_revision
    FROM mission_supply_participation_item_revisions
   WHERE participation_id = NEW.participation_id
     AND shelf_item_id = NEW.shelf_item_id
     AND need_key = NEW.need_key;
  IF participation.id IS NULL
     OR NEW.owner_id <> participation.owner_id
     OR NEW.actor_id <> participation.owner_id
     OR NEW.revision <> expected_revision
     OR (NEW.availability_status = 'confirmed_available'
         AND participation.current_status <> 'active') THEN
    RAISE EXCEPTION 'mission_supply_participation_item_revision_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mission_supply_participation_item_revisions_sequence_guard
BEFORE INSERT ON mission_supply_participation_item_revisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_supply_participation_item_revision();

CREATE OR REPLACE FUNCTION sit_reject_mission_supply_participation_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mission_supply_participation_immutable_record'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER mission_supply_participation_revisions_immutable_guard
BEFORE UPDATE ON mission_supply_participation_revisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_participation_immutable_update();

CREATE TRIGGER mission_supply_participation_item_revisions_immutable_guard
BEFORE UPDATE ON mission_supply_participation_item_revisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_participation_immutable_update();

CREATE TRIGGER mission_supply_participation_commands_immutable_guard
BEFORE UPDATE ON mission_supply_participation_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_participation_immutable_update();

CREATE TRIGGER mission_supply_participation_item_commands_immutable_guard
BEFORE UPDATE ON mission_supply_participation_item_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_participation_immutable_update();
