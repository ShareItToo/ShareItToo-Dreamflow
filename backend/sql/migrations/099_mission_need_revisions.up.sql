-- P2-A adds owner-bound, non-binding mission needs with immutable revisions.
-- It does not create bookings, reservations, contracts, payments, AI output or photos.

CREATE TABLE mission_needs (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^mission_need_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_version TEXT NOT NULL CHECK (domain_version = 'P2-A-2026-10-01.1'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'planned')),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);

CREATE INDEX mission_needs_owner_updated_idx
  ON mission_needs(owner_id, updated_at DESC, id);

CREATE TABLE mission_need_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_need_id TEXT NOT NULL REFERENCES mission_needs(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'planned')),
  payload JSONB NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['title', 'status', 'needs']
    AND payload - ARRAY['title', 'status', 'needs'] = '{}'::jsonb
    AND jsonb_typeof(payload -> 'title') = 'string'
    AND jsonb_typeof(payload -> 'status') = 'string'
    AND payload ->> 'status' = status
    AND jsonb_typeof(payload -> 'needs') = 'array'
    AND jsonb_array_length(payload -> 'needs') BETWEEN 1 AND 50
  ),
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_need_id, revision),
  UNIQUE (id, mission_need_id)
);

CREATE INDEX mission_need_revisions_need_idx
  ON mission_need_revisions(mission_need_id, revision DESC, id);

CREATE TABLE mission_need_commands (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9_.:-]{8,160}$'
  ),
  command_type TEXT NOT NULL CHECK (command_type IN ('create', 'correct')),
  request_sha256 CHAR(64) NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  mission_need_id TEXT NOT NULL,
  result_revision INTEGER NOT NULL CHECK (result_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  FOREIGN KEY (mission_need_id, owner_id)
    REFERENCES mission_needs(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (mission_need_id, result_revision)
    REFERENCES mission_need_revisions(mission_need_id, revision) ON DELETE CASCADE
);

CREATE INDEX mission_need_commands_need_idx
  ON mission_need_commands(mission_need_id, result_revision, created_at);

CREATE OR REPLACE FUNCTION sit_validate_mission_need_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_need mission_needs%ROWTYPE;
BEGIN
  SELECT * INTO target_need
    FROM mission_needs
   WHERE id = NEW.mission_need_id
   FOR UPDATE;
  IF target_need.id IS NULL OR NEW.revision <> target_need.current_revision + 1 THEN
    RAISE EXCEPTION 'mission_need_revision_invalid' USING ERRCODE = '23514';
  END IF;
  UPDATE mission_needs
     SET current_revision = NEW.revision,
         status = NEW.status,
         updated_at = now()
   WHERE id = NEW.mission_need_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mission_need_revisions_sequence_guard
BEFORE INSERT ON mission_need_revisions
FOR EACH ROW EXECUTE FUNCTION sit_validate_mission_need_revision();

CREATE OR REPLACE FUNCTION sit_reject_mission_need_immutable_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'mission_need_immutable_record' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER mission_need_revisions_immutable_guard
BEFORE UPDATE ON mission_need_revisions
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_need_immutable_update();

CREATE TRIGGER mission_need_commands_immutable_guard
BEFORE UPDATE ON mission_need_commands
FOR EACH ROW EXECUTE FUNCTION sit_reject_mission_need_immutable_update();
