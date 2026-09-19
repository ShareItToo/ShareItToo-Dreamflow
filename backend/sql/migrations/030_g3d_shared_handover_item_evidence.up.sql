-- G3D: a shared operational pickup/return schedule over independently valid
-- V5.2 item bookings. Evidence, chat, timers, return cases and needsReview stay
-- on the item booking. This migration creates no booking, contract or payment.

CREATE TABLE booking_group_position_booking_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_version INTEGER NOT NULL DEFAULT 1 CHECK (binding_version = 1),
  booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
  group_quote_id TEXT NOT NULL,
  group_quote_hash CHAR(64) NOT NULL CHECK (group_quote_hash ~ '^[0-9a-f]{64}$'),
  group_quote_position_id UUID NOT NULL UNIQUE
    REFERENCES booking_group_quote_positions(id) ON DELETE RESTRICT,
  group_position_id TEXT NOT NULL
    REFERENCES booking_group_positions(id) ON DELETE RESTRICT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  platform_contract_id UUID NOT NULL UNIQUE
    REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  booking_quote_id TEXT NOT NULL,
  booking_quote_hash CHAR(64) NOT NULL CHECK (booking_quote_hash ~ '^[0-9a-f]{64}$'),
  bound_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_group_id, group_position_id),
  FOREIGN KEY (group_quote_id, group_quote_hash)
    REFERENCES booking_group_quotes(id, quote_hash) ON DELETE RESTRICT,
  FOREIGN KEY (booking_quote_id, booking_quote_hash)
    REFERENCES booking_quotes(id, quote_hash) ON DELETE RESTRICT
);

CREATE INDEX booking_group_position_bindings_group_idx
  ON booking_group_position_booking_bindings(booking_group_id, group_quote_id, created_at);

CREATE TABLE booking_group_appointment_commands (
  idempotency_key TEXT PRIMARY KEY CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 160
    AND idempotency_key ~ '^[A-Za-z0-9_.:-]+$'
  ),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL DEFAULT 'booking_group.schedule_shared_appointments'
    CHECK (command_type = 'booking_group.schedule_shared_appointments'),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (completed_at IS NULL AND response_payload IS NULL)
    OR (completed_at IS NOT NULL AND response_payload IS NOT NULL)
  )
);

CREATE INDEX booking_group_appointment_commands_group_idx
  ON booking_group_appointment_commands(booking_group_id, created_at DESC);

CREATE TABLE booking_group_appointments (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^booking_group_appointment_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  appointment_version INTEGER NOT NULL DEFAULT 1 CHECK (appointment_version = 1),
  booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
  group_quote_id TEXT NOT NULL,
  group_quote_hash CHAR(64) NOT NULL CHECK (group_quote_hash ~ '^[0-9a-f]{64}$'),
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('pickup', 'return')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  rental_timezone TEXT NOT NULL CHECK (char_length(rental_timezone) BETWEEN 1 AND 120),
  handover_location_key CHAR(64) NOT NULL
    CHECK (handover_location_key ~ '^[0-9a-f]{64}$'),
  evidence_policy TEXT NOT NULL CHECK (evidence_policy = 'v52_item_specific_four_slots_v1'),
  chat_policy TEXT NOT NULL CHECK (chat_policy = 'v52_item_booking_threads_only'),
  timer_policy TEXT NOT NULL CHECK (timer_policy = 'v52_item_booking_timers_only'),
  address_policy TEXT NOT NULL CHECK (address_policy = 'v52_exact_address_in_item_thread_only'),
  created_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_key TEXT NOT NULL
    REFERENCES booking_group_appointment_commands(idempotency_key) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_group_id, appointment_type),
  UNIQUE (command_key, appointment_type),
  FOREIGN KEY (group_quote_id, group_quote_hash)
    REFERENCES booking_group_quotes(id, quote_hash) ON DELETE RESTRICT
);

CREATE INDEX booking_group_appointments_group_schedule_idx
  ON booking_group_appointments(booking_group_id, scheduled_at, appointment_type);

CREATE OR REPLACE FUNCTION sit_validate_booking_group_position_binding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group booking_groups%ROWTYPE;
  target_group_position booking_group_positions%ROWTYPE;
  target_quote_position booking_group_quote_positions%ROWTYPE;
  target_booking bookings%ROWTYPE;
  target_contract platform_contracts%ROWTYPE;
  target_single_quote booking_quotes%ROWTYPE;
  target_handover_document legal_document_snapshots%ROWTYPE;
  final_event booking_group_state_events%ROWTYPE;
  declaration_count INTEGER;
  valid_declaration_count INTEGER;
BEGIN
  SELECT * INTO target_group FROM booking_groups
    WHERE id = NEW.booking_group_id FOR KEY SHARE;
  SELECT * INTO target_group_position FROM booking_group_positions
    WHERE id = NEW.group_position_id FOR KEY SHARE;
  SELECT * INTO target_quote_position FROM booking_group_quote_positions
    WHERE id = NEW.group_quote_position_id FOR KEY SHARE;
  SELECT * INTO target_booking FROM bookings
    WHERE id = NEW.booking_id FOR KEY SHARE;
  SELECT * INTO target_contract FROM platform_contracts
    WHERE id = NEW.platform_contract_id FOR KEY SHARE;
  SELECT * INTO target_single_quote FROM booking_quotes
    WHERE id = NEW.booking_quote_id AND quote_hash = NEW.booking_quote_hash FOR KEY SHARE;
  SELECT * INTO target_handover_document FROM legal_document_snapshots
    WHERE id = target_contract.handover_return_damage_snapshot_id FOR KEY SHARE;
  SELECT * INTO final_event FROM booking_group_state_events
    WHERE booking_group_id = NEW.booking_group_id
    ORDER BY event_sequence DESC LIMIT 1 FOR KEY SHARE;

  IF target_group.id IS NULL OR target_group_position.id IS NULL
    OR target_quote_position.id IS NULL OR target_booking.id IS NULL
    OR target_contract.id IS NULL OR target_single_quote.id IS NULL
  THEN
    RAISE EXCEPTION 'booking_group_item_binding_reference_not_found'
      USING ERRCODE = '23503';
  END IF;
  IF final_event.to_state NOT IN ('owner_accepted', 'counteroffer_accepted')
    OR final_event.group_quote_id <> NEW.group_quote_id
    OR final_event.group_quote_hash <> NEW.group_quote_hash
  THEN
    RAISE EXCEPTION 'booking_group_item_binding_final_quote_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF target_group_position.booking_group_id <> NEW.booking_group_id
    OR target_group_position.id <> target_quote_position.group_position_id
    OR target_group_position.listing_id <> NEW.listing_id
    OR target_quote_position.booking_group_id <> NEW.booking_group_id
    OR target_quote_position.group_quote_id <> NEW.group_quote_id
    OR target_quote_position.listing_id <> NEW.listing_id
    OR target_quote_position.booking_quote_id <> NEW.booking_quote_id
    OR target_quote_position.booking_quote_hash <> NEW.booking_quote_hash
  THEN
    RAISE EXCEPTION 'booking_group_item_binding_position_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF target_group_position.booking_id IS NOT NULL
    AND target_group_position.booking_id <> NEW.booking_id
  THEN
    RAISE EXCEPTION 'booking_group_item_binding_legacy_booking_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF target_booking.listing_id <> NEW.listing_id
    OR target_booking.owner_id <> target_group.owner_id
    OR target_booking.renter_id <> target_group.renter_id
    OR target_booking.starts_at <> target_group.starts_at
    OR target_booking.ends_at <> target_group.ends_at
    OR target_booking.currency <> target_group.currency
    OR target_booking.quoted_total_minor <> target_quote_position.total_minor
    OR target_booking.workflow_version < 1
    OR target_booking.workflow_status NOT IN (
      'accepted', 'confirmed', 'active', 'returned', 'completed'
    )
    OR NOT EXISTS (SELECT 1 FROM rental_requests WHERE id = target_booking.id)
  THEN
    RAISE EXCEPTION 'booking_group_item_binding_booking_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF target_contract.booking_id <> NEW.booking_id
    OR target_contract.user_id <> target_group.renter_id
    OR target_contract.quote_id <> NEW.booking_quote_id
    OR target_contract.quote_hash <> NEW.booking_quote_hash
    OR target_contract.contract_version NOT LIKE 'V5.2-%'
    OR target_contract.accepted_at < target_single_quote.issued_at
    OR target_contract.accepted_at > target_single_quote.expires_at
    OR target_handover_document.document_key <> 'handover_return_damage'
    OR target_handover_document.document_version <> target_contract.contract_version
    OR target_handover_document.locale <> target_contract.locale
  THEN
    RAISE EXCEPTION 'booking_group_item_binding_contract_mismatch'
      USING ERRCODE = '23514';
  END IF;
  SELECT count(*)::int,
         count(*) FILTER (
           WHERE declaration.user_id = target_contract.user_id
             AND declaration.booking_id = target_contract.booking_id
             AND declaration.document_version = target_contract.contract_version
             AND declaration.locale = target_contract.locale
             AND declaration.client_build = target_contract.client_build
             AND declaration.quote_id = target_contract.quote_id
             AND declaration.quote_hash = target_contract.quote_hash
         )::int
    INTO declaration_count, valid_declaration_count
    FROM platform_contract_declarations AS declaration
   WHERE declaration.contract_id = target_contract.id;
  IF declaration_count <> 2 OR valid_declaration_count <> 2 THEN
    RAISE EXCEPTION 'booking_group_item_binding_declarations_incomplete'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.bound_by_id NOT IN (target_group.owner_id, target_group.renter_id) THEN
    RAISE EXCEPTION 'booking_group_item_binding_actor_mismatch'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_appointment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group booking_groups%ROWTYPE;
  final_event booking_group_state_events%ROWTYPE;
  target_command booking_group_appointment_commands%ROWTYPE;
  required_bindings INTEGER;
  actual_bindings INTEGER;
BEGIN
  SELECT * INTO target_group FROM booking_groups
    WHERE id = NEW.booking_group_id FOR KEY SHARE;
  SELECT * INTO final_event FROM booking_group_state_events
    WHERE booking_group_id = NEW.booking_group_id
    ORDER BY event_sequence DESC LIMIT 1 FOR KEY SHARE;
  SELECT * INTO target_command FROM booking_group_appointment_commands
    WHERE idempotency_key = NEW.command_key FOR KEY SHARE;
  SELECT count(*)::int INTO required_bindings
    FROM booking_group_quote_positions
    WHERE booking_group_id = NEW.booking_group_id
      AND group_quote_id = NEW.group_quote_id;
  SELECT count(*)::int INTO actual_bindings
    FROM booking_group_position_booking_bindings
    WHERE booking_group_id = NEW.booking_group_id
      AND group_quote_id = NEW.group_quote_id
      AND group_quote_hash = NEW.group_quote_hash;

  IF target_group.id IS NULL OR final_event.id IS NULL THEN
    RAISE EXCEPTION 'booking_group_appointment_reference_not_found'
      USING ERRCODE = '23503';
  END IF;
  IF final_event.to_state NOT IN ('owner_accepted', 'counteroffer_accepted')
    OR final_event.group_quote_id <> NEW.group_quote_id
    OR final_event.group_quote_hash <> NEW.group_quote_hash
    OR required_bindings < 1 OR actual_bindings <> required_bindings
  THEN
    RAISE EXCEPTION 'booking_group_appointment_item_bindings_incomplete'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.rental_timezone <> target_group.rental_timezone
    OR NEW.handover_location_key <> target_group.handover_location_key
    OR (NEW.appointment_type = 'pickup' AND NEW.scheduled_at <> target_group.starts_at)
    OR (NEW.appointment_type = 'return' AND NEW.scheduled_at <> target_group.ends_at)
    OR NEW.created_by_id NOT IN (target_group.owner_id, target_group.renter_id)
    OR target_command.idempotency_key IS NULL
    OR target_command.booking_group_id <> NEW.booking_group_id
    OR target_command.actor_id <> NEW.created_by_id
  THEN
    RAISE EXCEPTION 'booking_group_appointment_context_mismatch'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM user_suspensions
     WHERE user_id IN (target_group.owner_id, target_group.renter_id)
       AND scope = 'account' AND lifted_at IS NULL
       AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
  ) THEN
    RAISE EXCEPTION 'booking_group_appointment_system_risk_hold'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_appointment_set()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  appointment_count INTEGER;
  appointment_type_count INTEGER;
BEGIN
  SELECT count(*)::int, count(DISTINCT appointment_type)::int
    INTO appointment_count, appointment_type_count
    FROM booking_group_appointments
    WHERE booking_group_id = NEW.booking_group_id;
  IF appointment_count <> 2 OR appointment_type_count <> 2 THEN
    RAISE EXCEPTION 'booking_group_appointment_set_incomplete'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_group_position_bindings_context_guard
BEFORE INSERT ON booking_group_position_booking_bindings
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_position_binding();

CREATE TRIGGER booking_group_appointments_context_guard
BEFORE INSERT ON booking_group_appointments
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_appointment();

CREATE CONSTRAINT TRIGGER booking_group_appointments_set_guard
AFTER INSERT ON booking_group_appointments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_appointment_set();

CREATE TRIGGER booking_group_position_bindings_append_only
BEFORE UPDATE OR DELETE ON booking_group_position_booking_bindings
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE TRIGGER booking_group_appointments_append_only
BEFORE UPDATE OR DELETE ON booking_group_appointments
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
