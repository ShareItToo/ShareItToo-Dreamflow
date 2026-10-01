-- P6-A stores one private, purpose-bound demand for one exact P5 gap.
-- These rows never create a public listing, notification, reservation, booking or payment.

ALTER TABLE mission_inventory_resolution_revisions
  ADD CONSTRAINT mission_inventory_resolution_revisions_p6_binding_unique UNIQUE (
    resolution_id, revision, mission_need_id, mission_need_revision,
    mission_payload_sha256, start_date, end_date, location_snapshot,
    location_snapshot_sha256
  );

ALTER TABLE mission_inventory_resolution_assignments
  ADD CONSTRAINT mission_inventory_resolution_assignments_p6_gap_unique UNIQUE (
    resolution_id, resolution_revision, slot_key, need_key, necessity,
    slot_ordinal, gap_reason
  );

ALTER TABLE mission_need_revisions
  ADD CONSTRAINT mission_need_revisions_p6_binding_unique UNIQUE (
    mission_need_id, revision, payload_sha256
  );

CREATE TABLE mission_supply_demands (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^mission_demand_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resolution_id TEXT NOT NULL,
  resolution_revision INTEGER NOT NULL CHECK (resolution_revision > 0),
  mission_need_id TEXT NOT NULL,
  mission_need_revision INTEGER NOT NULL CHECK (mission_need_revision > 0),
  mission_payload_sha256 CHAR(64) NOT NULL CHECK (mission_payload_sha256 ~ '^[0-9a-f]{64}$'),
  slot_key TEXT NOT NULL CHECK (length(slot_key) BETWEEN 5 AND 240),
  need_key TEXT NOT NULL CHECK (need_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$'),
  necessity TEXT NOT NULL CHECK (necessity IN ('required', 'optional')),
  quantity INTEGER NOT NULL CHECK (quantity = 1),
  slot_ordinal INTEGER NOT NULL CHECK (slot_ordinal BETWEEN 1 AND 100),
  gap_reason TEXT NOT NULL CHECK (gap_reason = 'no_current_unique_candidate'),
  candidate_shelf_item_id TEXT NOT NULL,
  eligibility_version TEXT NOT NULL CHECK (
    eligibility_version ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$'
  ),
  purpose TEXT NOT NULL CHECK (purpose = 'mission_gap_supply_v1'),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (
    end_date > start_date AND end_date <= start_date + 365
  ),
  region_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(region_snapshot) = 'object'
    AND region_snapshot ?& ARRAY[
      'sourceType', 'sourceVersion', 'ownerConfirmed', 'radiusKm',
      'coordinateDigest', 'exactCoordinatesStored'
    ]
    AND region_snapshot ->> 'sourceType' = 'owner_confirmed_search_origin'
    AND (region_snapshot ->> 'ownerConfirmed')::boolean = true
    AND (region_snapshot ->> 'exactCoordinatesStored')::boolean = false
    AND region_snapshot ->> 'coordinateDigest' ~ '^[0-9a-f]{64}$'
    AND region_snapshot - ARRAY[
      'sourceType', 'sourceVersion', 'ownerConfirmed', 'radiusKm',
      'coordinateDigest', 'exactCoordinatesStored'
    ] = '{}'::jsonb
    AND NOT (region_snapshot ? 'latitudeE5')
    AND NOT (region_snapshot ? 'longitudeE5')
  ),
  region_snapshot_sha256 CHAR(64) NOT NULL CHECK (region_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  domain_version TEXT NOT NULL CHECK (domain_version = 'P6-A-2026-10-01.1'),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  current_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    current_status IN ('pending', 'rejected', 'released', 'revoked')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> recipient_id),
  UNIQUE (id, requester_id),
  UNIQUE (id, recipient_id),
  UNIQUE (id, recipient_id, candidate_shelf_item_id, purpose, expires_at),
  UNIQUE (resolution_id, resolution_revision, slot_key),
  FOREIGN KEY (resolution_id, requester_id)
    REFERENCES mission_inventory_resolutions(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (resolution_id, resolution_revision)
    REFERENCES mission_inventory_resolution_revisions(resolution_id, revision) ON DELETE CASCADE,
  FOREIGN KEY (
    resolution_id, resolution_revision, mission_need_id, mission_need_revision,
    mission_payload_sha256, start_date, end_date, region_snapshot,
    region_snapshot_sha256
  ) REFERENCES mission_inventory_resolution_revisions (
    resolution_id, revision, mission_need_id, mission_need_revision,
    mission_payload_sha256, start_date, end_date, location_snapshot,
    location_snapshot_sha256
  ) ON DELETE CASCADE,
  FOREIGN KEY (mission_need_id, mission_need_revision)
    REFERENCES mission_need_revisions(mission_need_id, revision) ON DELETE CASCADE,
  FOREIGN KEY (mission_need_id, mission_need_revision, mission_payload_sha256)
    REFERENCES mission_need_revisions(
      mission_need_id, revision, payload_sha256
    ) ON DELETE CASCADE,
  FOREIGN KEY (
    resolution_id, resolution_revision, slot_key, need_key, necessity,
    slot_ordinal, gap_reason
  ) REFERENCES mission_inventory_resolution_assignments (
    resolution_id, resolution_revision, slot_key, need_key, necessity,
    slot_ordinal, gap_reason
  ) ON DELETE CASCADE,
  FOREIGN KEY (candidate_shelf_item_id, recipient_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX mission_supply_demands_requester_idx
  ON mission_supply_demands(requester_id, updated_at DESC, id);
CREATE INDEX mission_supply_demands_recipient_idx
  ON mission_supply_demands(recipient_id, updated_at DESC, id);

CREATE TABLE mission_supply_demand_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id TEXT NOT NULL REFERENCES mission_supply_demands(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'reject', 'release', 'revoke')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'rejected', 'released', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (demand_id, revision),
  UNIQUE (demand_id, revision, actor_id, action, status)
);

CREATE INDEX mission_supply_demand_revisions_root_idx
  ON mission_supply_demand_revisions(demand_id, revision, created_at);

CREATE TABLE mission_supply_releases (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^mission_release_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  demand_id TEXT NOT NULL UNIQUE,
  recipient_id TEXT NOT NULL,
  shelf_item_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose = 'mission_gap_supply_v1'),
  released_revision INTEGER NOT NULL CHECK (released_revision > 0),
  release_action TEXT NOT NULL DEFAULT 'release' CHECK (release_action = 'release'),
  release_status TEXT NOT NULL DEFAULT 'released' CHECK (release_status = 'released'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (demand_id, recipient_id, shelf_item_id, purpose, expires_at)
    REFERENCES mission_supply_demands(
      id, recipient_id, candidate_shelf_item_id, purpose, expires_at
    ) ON DELETE CASCADE,
  FOREIGN KEY (
    demand_id, released_revision, recipient_id, release_action, release_status
  ) REFERENCES mission_supply_demand_revisions(
    demand_id, revision, actor_id, action, status
  ) ON DELETE CASCADE,
  FOREIGN KEY (shelf_item_id, recipient_id)
    REFERENCES private_shelf_items(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX mission_supply_releases_recipient_idx
  ON mission_supply_releases(recipient_id, created_at, id);

CREATE TABLE mission_supply_demand_commands (
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$'
  ),
  command_type TEXT NOT NULL CHECK (command_type IN ('create', 'respond', 'revoke')),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  demand_id TEXT NOT NULL REFERENCES mission_supply_demands(id) ON DELETE CASCADE,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key),
  FOREIGN KEY (demand_id, result_revision)
    REFERENCES mission_supply_demand_revisions(demand_id, revision) ON DELETE CASCADE
);

CREATE INDEX mission_supply_demand_commands_root_idx
  ON mission_supply_demand_commands(demand_id, result_revision, created_at);

CREATE OR REPLACE FUNCTION sit_validate_mission_supply_demand_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target mission_supply_demands%ROWTYPE;
BEGIN
  SELECT * INTO target FROM mission_supply_demands WHERE id = NEW.demand_id FOR UPDATE;
  IF target.id IS NULL
     OR NEW.revision <> target.current_revision + 1
     OR NOT (
       (target.current_revision = 0
        AND NEW.revision = 1
        AND NEW.actor_id = target.requester_id
        AND NEW.action = 'create'
        AND NEW.status = 'pending')
       OR
       (target.current_revision > 0
        AND target.current_status = 'pending'
        AND NEW.actor_id = target.recipient_id
        AND ((NEW.action = 'reject' AND NEW.status = 'rejected')
          OR (NEW.action = 'release' AND NEW.status = 'released')))
       OR
       (target.current_status = 'released'
        AND NEW.actor_id = target.recipient_id
        AND NEW.action = 'revoke'
        AND NEW.status = 'revoked')
     ) THEN
    RAISE EXCEPTION 'mission_supply_demand_revision_invalid' USING ERRCODE = '23514';
  END IF;
  UPDATE mission_supply_demands
     SET current_revision = NEW.revision,
         current_status = NEW.status,
         updated_at = now()
   WHERE id = NEW.demand_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_mission_supply_demand_root_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() <> 2
     OR NEW.id <> OLD.id
     OR NEW.requester_id <> OLD.requester_id
     OR NEW.recipient_id <> OLD.recipient_id
     OR NEW.resolution_id <> OLD.resolution_id
     OR NEW.resolution_revision <> OLD.resolution_revision
     OR NEW.mission_need_id <> OLD.mission_need_id
     OR NEW.mission_need_revision <> OLD.mission_need_revision
     OR NEW.mission_payload_sha256 <> OLD.mission_payload_sha256
     OR NEW.slot_key <> OLD.slot_key
     OR NEW.need_key <> OLD.need_key
     OR NEW.necessity <> OLD.necessity
     OR NEW.quantity <> OLD.quantity
     OR NEW.slot_ordinal <> OLD.slot_ordinal
     OR NEW.gap_reason <> OLD.gap_reason
     OR NEW.candidate_shelf_item_id <> OLD.candidate_shelf_item_id
     OR NEW.eligibility_version <> OLD.eligibility_version
     OR NEW.purpose <> OLD.purpose
     OR NEW.start_date <> OLD.start_date
     OR NEW.end_date <> OLD.end_date
     OR NEW.region_snapshot <> OLD.region_snapshot
     OR NEW.region_snapshot_sha256 <> OLD.region_snapshot_sha256
     OR NEW.expires_at <> OLD.expires_at
     OR NEW.domain_version <> OLD.domain_version
     OR NEW.created_at <> OLD.created_at
     OR NEW.current_revision <> OLD.current_revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'mission_supply_demand_root_update_invalid' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_reject_mission_supply_demand_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mission_supply_demand_immutable_record' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER mission_supply_demands_update_guard
BEFORE UPDATE ON mission_supply_demands
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_supply_demand_root_update();

CREATE TRIGGER mission_supply_demand_revisions_sequence_guard
BEFORE INSERT ON mission_supply_demand_revisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_supply_demand_revision();

CREATE TRIGGER mission_supply_demand_revisions_immutable_guard
BEFORE UPDATE ON mission_supply_demand_revisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_demand_immutable_update();

CREATE TRIGGER mission_supply_releases_immutable_guard
BEFORE UPDATE ON mission_supply_releases
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_demand_immutable_update();

CREATE TRIGGER mission_supply_demand_commands_immutable_guard
BEFORE UPDATE ON mission_supply_demand_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_supply_demand_immutable_update();
