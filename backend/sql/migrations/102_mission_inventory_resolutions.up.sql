-- P5-A stores bounded, owner-bound, non-binding mission inventory snapshots.
-- It never creates a public Shelf/listing, reservation, booking, contract or payment.

CREATE TABLE mission_inventory_resolutions (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^mission_inventory_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_need_id TEXT NOT NULL,
  domain_version TEXT NOT NULL CHECK (domain_version = 'P5-A-2026-10-01.1'),
  planner_core_version TEXT NOT NULL CHECK (planner_core_version = 'G4A-2026-08-21.1'),
  planner_inventory_version TEXT NOT NULL CHECK (planner_inventory_version = 'G4B-2026-08-21.1'),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id),
  UNIQUE (id, mission_need_id),
  UNIQUE (owner_id, mission_need_id),
  FOREIGN KEY (mission_need_id, owner_id)
    REFERENCES mission_needs(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX mission_inventory_resolutions_owner_mission_idx
  ON mission_inventory_resolutions(owner_id, mission_need_id, updated_at DESC, id);

CREATE TABLE mission_inventory_resolution_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id TEXT NOT NULL,
  mission_need_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  mission_need_revision INTEGER NOT NULL CHECK (mission_need_revision > 0),
  mission_payload_sha256 CHAR(64) NOT NULL CHECK (mission_payload_sha256 ~ '^[0-9a-f]{64}$'),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  location_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(location_snapshot) = 'object'
    AND location_snapshot ?& ARRAY[
      'sourceType', 'sourceVersion', 'ownerConfirmed', 'radiusKm',
      'coordinateDigest', 'exactCoordinatesStored'
    ]
    AND location_snapshot ->> 'sourceType' = 'owner_confirmed_search_origin'
    AND (location_snapshot ->> 'ownerConfirmed')::boolean = true
    AND (location_snapshot ->> 'exactCoordinatesStored')::boolean = false
    AND location_snapshot ->> 'coordinateDigest' ~ '^[0-9a-f]{64}$'
  ),
  location_snapshot_sha256 CHAR(64) NOT NULL CHECK (
    location_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  resolution_snapshot JSONB NOT NULL CHECK (
    jsonb_typeof(resolution_snapshot) = 'object'
    AND resolution_snapshot ?& ARRAY[
      'coverage', 'slots', 'requiredCoverageComplete', 'searchLimited',
      'quotePersisted', 'revalidationRequiredBeforeRequest', 'bindingStatus',
      'reservationCreated', 'bookingCreated', 'contractCreated', 'paymentCreated',
      'publicShelfCreated', 'publicListingCreated', 'automaticPublicationPerformed',
      'externalGenerativeAiUsed'
    ]
    AND jsonb_typeof(resolution_snapshot -> 'coverage') = 'array'
    AND jsonb_typeof(resolution_snapshot -> 'slots') = 'array'
    AND (resolution_snapshot ->> 'quotePersisted')::boolean = false
    AND (resolution_snapshot ->> 'revalidationRequiredBeforeRequest')::boolean = true
    AND resolution_snapshot ->> 'bindingStatus' = 'non_binding'
    AND (resolution_snapshot ->> 'reservationCreated')::boolean = false
    AND (resolution_snapshot ->> 'bookingCreated')::boolean = false
    AND (resolution_snapshot ->> 'contractCreated')::boolean = false
    AND (resolution_snapshot ->> 'paymentCreated')::boolean = false
    AND (resolution_snapshot ->> 'publicShelfCreated')::boolean = false
    AND (resolution_snapshot ->> 'publicListingCreated')::boolean = false
    AND (resolution_snapshot ->> 'automaticPublicationPerformed')::boolean = false
    AND (resolution_snapshot ->> 'externalGenerativeAiUsed')::boolean = false
  ),
  resolution_snapshot_sha256 CHAR(64) NOT NULL CHECK (
    resolution_snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resolution_id, revision),
  UNIQUE (id, resolution_id, revision),
  FOREIGN KEY (resolution_id, mission_need_id)
    REFERENCES mission_inventory_resolutions(id, mission_need_id) ON DELETE CASCADE,
  FOREIGN KEY (mission_need_id, mission_need_revision)
    REFERENCES mission_need_revisions(mission_need_id, revision) ON DELETE CASCADE
);

CREATE INDEX mission_inventory_resolution_revisions_root_idx
  ON mission_inventory_resolution_revisions(resolution_id, revision DESC, id);

CREATE TABLE mission_inventory_resolution_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL,
  resolution_id TEXT NOT NULL,
  resolution_revision INTEGER NOT NULL CHECK (resolution_revision > 0),
  slot_key TEXT NOT NULL CHECK (length(slot_key) BETWEEN 5 AND 240),
  need_key TEXT NOT NULL CHECK (need_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{1,79}$'),
  necessity TEXT NOT NULL CHECK (necessity IN ('required', 'optional')),
  slot_ordinal INTEGER NOT NULL CHECK (slot_ordinal BETWEEN 1 AND 100),
  listing_id TEXT,
  listing_snapshot JSONB,
  quote_snapshot JSONB,
  gap_reason TEXT CHECK (
    gap_reason IS NULL OR gap_reason IN ('unsupported_need_key', 'no_current_unique_candidate')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, slot_key),
  UNIQUE (revision_id, need_key, slot_ordinal),
  UNIQUE (revision_id, listing_id),
  FOREIGN KEY (revision_id, resolution_id, resolution_revision)
    REFERENCES mission_inventory_resolution_revisions(id, resolution_id, revision)
    ON DELETE CASCADE,
  CHECK (
    (listing_id IS NOT NULL AND listing_snapshot IS NOT NULL
      AND quote_snapshot IS NOT NULL AND gap_reason IS NULL)
    OR
    (listing_id IS NULL AND listing_snapshot IS NULL
      AND quote_snapshot IS NULL AND gap_reason IS NOT NULL)
  ),
  CHECK (listing_snapshot IS NULL OR (
    jsonb_typeof(listing_snapshot) = 'object'
    AND listing_snapshot ?& ARRAY[
      'listingId', 'catalogRevision', 'availabilityRevision', 'handoverLocationKey'
    ]
    AND listing_snapshot ->> 'listingId' = listing_id
    AND listing_snapshot ->> 'handoverLocationKey' ~ '^[0-9a-f]{64}$'
  )),
  CHECK (quote_snapshot IS NULL OR (
    jsonb_typeof(quote_snapshot) = 'object'
    AND quote_snapshot ?& ARRAY[
      'quoteHash', 'availabilityRevision', 'currency', 'preview', 'persisted'
    ]
    AND quote_snapshot ->> 'quoteHash' ~ '^[0-9a-f]{64}$'
    AND quote_snapshot ->> 'currency' = 'EUR'
    AND (quote_snapshot ->> 'preview')::boolean = true
    AND (quote_snapshot ->> 'persisted')::boolean = false
  ))
);

CREATE INDEX mission_inventory_resolution_assignments_root_idx
  ON mission_inventory_resolution_assignments(resolution_id, resolution_revision, slot_key);

CREATE TABLE mission_inventory_resolution_commands (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$'
  ),
  command_type TEXT NOT NULL CHECK (command_type IN ('create', 'revise')),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  resolution_id TEXT NOT NULL,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  FOREIGN KEY (resolution_id, owner_id)
    REFERENCES mission_inventory_resolutions(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (resolution_id, result_revision)
    REFERENCES mission_inventory_resolution_revisions(resolution_id, revision) ON DELETE CASCADE
);

CREATE INDEX mission_inventory_resolution_commands_root_idx
  ON mission_inventory_resolution_commands(resolution_id, result_revision, created_at);

CREATE OR REPLACE FUNCTION sit_validate_mission_inventory_resolution_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target mission_inventory_resolutions%ROWTYPE;
BEGIN
  SELECT * INTO target
    FROM mission_inventory_resolutions
   WHERE id = NEW.resolution_id
   FOR UPDATE;
  IF target.id IS NULL
     OR NEW.mission_need_id <> target.mission_need_id
     OR NEW.revision <> target.current_revision + 1 THEN
    RAISE EXCEPTION 'mission_inventory_resolution_revision_invalid' USING ERRCODE = '23514';
  END IF;
  UPDATE mission_inventory_resolutions
     SET current_revision = NEW.revision,
         updated_at = now()
   WHERE id = NEW.resolution_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_mission_inventory_resolution_root_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_trigger_depth() <> 2
     OR NEW.id <> OLD.id
     OR NEW.owner_id <> OLD.owner_id
     OR NEW.mission_need_id <> OLD.mission_need_id
     OR NEW.domain_version <> OLD.domain_version
     OR NEW.planner_core_version <> OLD.planner_core_version
     OR NEW.planner_inventory_version <> OLD.planner_inventory_version
     OR NEW.created_at <> OLD.created_at
     OR NEW.current_revision <> OLD.current_revision + 1
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'mission_inventory_resolution_root_update_invalid' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mission_inventory_resolutions_update_guard
BEFORE UPDATE ON mission_inventory_resolutions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_inventory_resolution_root_update();

CREATE TRIGGER mission_inventory_resolution_revisions_sequence_guard
BEFORE INSERT ON mission_inventory_resolution_revisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_inventory_resolution_revision();

CREATE OR REPLACE FUNCTION sit_reject_mission_inventory_resolution_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mission_inventory_resolution_immutable_record' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER mission_inventory_resolution_revisions_immutable_guard
BEFORE UPDATE ON mission_inventory_resolution_revisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_inventory_resolution_immutable_update();

CREATE TRIGGER mission_inventory_resolution_assignments_immutable_guard
BEFORE UPDATE ON mission_inventory_resolution_assignments
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_inventory_resolution_immutable_update();

CREATE TRIGGER mission_inventory_resolution_commands_immutable_guard
BEFORE UPDATE ON mission_inventory_resolution_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_inventory_resolution_immutable_update();
