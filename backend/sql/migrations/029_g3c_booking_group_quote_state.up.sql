-- G3C: disabled group quote and decision orchestration. The tables are
-- additive and append-only except for the internal idempotency command record.
-- No booking, contract, payment, reservation or public activation is created.

CREATE TABLE booking_group_quotes (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^booking_group_quote_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
  quote_revision INTEGER NOT NULL CHECK (quote_revision > 0),
  predecessor_quote_id TEXT REFERENCES booking_group_quotes(id) ON DELETE RESTRICT,
  proposal_kind TEXT NOT NULL CHECK (
    proposal_kind IN ('initial', 'owner_counteroffer')
  ),
  proposed_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_by_role TEXT NOT NULL CHECK (proposed_by_role IN ('renter', 'owner')),
  compatibility_hash CHAR(64) NOT NULL CHECK (compatibility_hash ~ '^[0-9a-f]{64}$'),
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 1 AND 20),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rental_subtotal_minor BIGINT NOT NULL CHECK (rental_subtotal_minor >= 0),
  platform_fee_minor BIGINT NOT NULL CHECK (platform_fee_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  owner_payout_minor BIGINT NOT NULL CHECK (owner_payout_minor >= 0),
  security_deposit_minor BIGINT NOT NULL CHECK (security_deposit_minor = 0),
  quote_payload JSONB NOT NULL,
  quote_hash CHAR(64) NOT NULL CHECK (quote_hash ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (booking_group_id, quote_revision),
  UNIQUE (id, quote_hash),
  CHECK (issued_at < expires_at),
  CHECK (owner_payout_minor + platform_fee_minor = total_minor),
  CHECK (
    (proposal_kind = 'initial' AND quote_revision = 1 AND predecessor_quote_id IS NULL
      AND proposed_by_role = 'renter')
    OR
    (proposal_kind = 'owner_counteroffer' AND quote_revision > 1
      AND predecessor_quote_id IS NOT NULL AND proposed_by_role = 'owner')
  )
);

CREATE INDEX booking_group_quotes_group_created_idx
  ON booking_group_quotes(booking_group_id, quote_revision DESC, issued_at DESC);
CREATE INDEX booking_group_quotes_predecessor_idx
  ON booking_group_quotes(predecessor_quote_id)
  WHERE predecessor_quote_id IS NOT NULL;

CREATE TABLE booking_group_quote_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_quote_id TEXT NOT NULL REFERENCES booking_group_quotes(id) ON DELETE RESTRICT,
  booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
  group_position_id TEXT NOT NULL
    REFERENCES booking_group_positions(id) ON DELETE RESTRICT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
  booking_quote_id TEXT NOT NULL REFERENCES booking_quotes(id) ON DELETE RESTRICT,
  booking_quote_hash CHAR(64) NOT NULL CHECK (booking_quote_hash ~ '^[0-9a-f]{64}$'),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  rental_subtotal_minor BIGINT NOT NULL CHECK (rental_subtotal_minor >= 0),
  platform_fee_minor BIGINT NOT NULL CHECK (platform_fee_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
  owner_payout_minor BIGINT NOT NULL CHECK (owner_payout_minor >= 0),
  security_deposit_minor BIGINT NOT NULL CHECK (security_deposit_minor = 0),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 19),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_quote_id, group_position_id),
  UNIQUE (group_quote_id, listing_id),
  UNIQUE (group_quote_id, booking_quote_id),
  UNIQUE (group_quote_id, sort_order),
  CHECK (owner_payout_minor + platform_fee_minor = total_minor)
);

CREATE INDEX booking_group_quote_positions_group_idx
  ON booking_group_quote_positions(booking_group_id, group_quote_id, sort_order);
CREATE INDEX booking_group_quote_positions_single_quote_idx
  ON booking_group_quote_positions(booking_quote_id);

CREATE TABLE booking_group_state_events (
  id TEXT PRIMARY KEY CHECK (
    id ~ '^booking_group_event_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  booking_group_id TEXT NOT NULL REFERENCES booking_groups(id) ON DELETE RESTRICT,
  event_sequence INTEGER NOT NULL CHECK (event_sequence > 0),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_group_role TEXT NOT NULL CHECK (actor_group_role IN ('renter', 'owner')),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'booking_group.requested',
    'booking_group.owner_accepted_all',
    'booking_group.owner_declined_all',
    'booking_group.owner_counteroffered',
    'booking_group.renter_accepted_counteroffer'
  )),
  from_state TEXT CHECK (from_state IS NULL OR from_state IN (
    'requested', 'counteroffered'
  )),
  to_state TEXT NOT NULL CHECK (to_state IN (
    'requested', 'owner_accepted', 'declined', 'counteroffered',
    'counteroffer_accepted'
  )),
  group_quote_id TEXT NOT NULL,
  group_quote_hash CHAR(64) NOT NULL CHECK (group_quote_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 160
    AND idempotency_key ~ '^[A-Za-z0-9_.:-]+$'
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_group_id, event_sequence),
  FOREIGN KEY (group_quote_id, group_quote_hash)
    REFERENCES booking_group_quotes(id, quote_hash) ON DELETE RESTRICT
);

CREATE INDEX booking_group_state_events_group_idx
  ON booking_group_state_events(booking_group_id, event_sequence DESC, created_at DESC);

CREATE TABLE booking_group_commands (
  idempotency_key TEXT PRIMARY KEY CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 160
    AND idempotency_key ~ '^[A-Za-z0-9_.:-]+$'
  ),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'booking_group.request',
    'booking_group.owner_decision',
    'booking_group.renter_consent'
  )),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  booking_group_id TEXT REFERENCES booking_groups(id) ON DELETE RESTRICT,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (
    (completed_at IS NULL AND response_payload IS NULL)
    OR (completed_at IS NOT NULL AND response_payload IS NOT NULL)
  )
);

CREATE INDEX booking_group_commands_group_created_idx
  ON booking_group_commands(booking_group_id, created_at DESC)
  WHERE booking_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group booking_groups%ROWTYPE;
  target_predecessor booking_group_quotes%ROWTYPE;
BEGIN
  SELECT * INTO target_group
    FROM booking_groups WHERE id = NEW.booking_group_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_group_not_found' USING ERRCODE = '23503';
  END IF;
  IF NEW.currency <> target_group.currency
    OR NEW.compatibility_hash <> target_group.compatibility_hash
  THEN
    RAISE EXCEPTION 'booking_group_quote_compatibility_mismatch' USING ERRCODE = '23514';
  END IF;
  IF (NEW.proposed_by_role = 'renter' AND NEW.proposed_by_id <> target_group.renter_id)
    OR (NEW.proposed_by_role = 'owner' AND NEW.proposed_by_id <> target_group.owner_id)
  THEN
    RAISE EXCEPTION 'booking_group_quote_actor_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.predecessor_quote_id IS NOT NULL THEN
    SELECT * INTO target_predecessor
      FROM booking_group_quotes WHERE id = NEW.predecessor_quote_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'booking_group_predecessor_quote_not_found' USING ERRCODE = '23503';
    END IF;
    IF target_predecessor.booking_group_id <> NEW.booking_group_id
      OR target_predecessor.quote_revision + 1 <> NEW.quote_revision
    THEN
      RAISE EXCEPTION 'booking_group_predecessor_quote_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.quote_payload->>'bookingGroupId' <> NEW.booking_group_id
    OR sit_try_numeric(NEW.quote_payload->>'quoteRevision')
         IS DISTINCT FROM NEW.quote_revision::numeric
    OR NEW.quote_payload->>'proposalKind' <> NEW.proposal_kind
    OR NEW.quote_payload->>'proposedById' <> NEW.proposed_by_id
    OR NEW.quote_payload->>'proposedByRole' <> NEW.proposed_by_role
    OR NEW.quote_payload->>'compatibilityHash' <> NEW.compatibility_hash
    OR NEW.quote_payload->>'currency' <> NEW.currency
    OR sit_try_numeric(NEW.quote_payload->>'itemCount')
         IS DISTINCT FROM NEW.item_count::numeric
    OR sit_try_numeric(NEW.quote_payload->>'rentalSubtotalMinor')
         IS DISTINCT FROM NEW.rental_subtotal_minor::numeric
    OR sit_try_numeric(NEW.quote_payload->>'platformFeeMinor')
         IS DISTINCT FROM NEW.platform_fee_minor::numeric
    OR sit_try_numeric(NEW.quote_payload->>'totalMinor')
         IS DISTINCT FROM NEW.total_minor::numeric
    OR sit_try_numeric(NEW.quote_payload->>'ownerPayoutMinor')
         IS DISTINCT FROM NEW.owner_payout_minor::numeric
    OR sit_try_numeric(NEW.quote_payload->>'securityDepositMinor')
         IS DISTINCT FROM NEW.security_deposit_minor::numeric
  THEN
    RAISE EXCEPTION 'booking_group_quote_payload_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_quote_position()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group_quote booking_group_quotes%ROWTYPE;
  target_group_position booking_group_positions%ROWTYPE;
  target_single_quote booking_quotes%ROWTYPE;
  target_group booking_groups%ROWTYPE;
BEGIN
  SELECT * INTO target_group_quote
    FROM booking_group_quotes WHERE id = NEW.group_quote_id FOR KEY SHARE;
  SELECT * INTO target_group_position
    FROM booking_group_positions WHERE id = NEW.group_position_id FOR KEY SHARE;
  SELECT * INTO target_single_quote
    FROM booking_quotes WHERE id = NEW.booking_quote_id FOR KEY SHARE;
  SELECT * INTO target_group
    FROM booking_groups WHERE id = NEW.booking_group_id FOR KEY SHARE;
  IF target_group_quote.id IS NULL OR target_group_position.id IS NULL
    OR target_single_quote.id IS NULL OR target_group.id IS NULL
  THEN
    RAISE EXCEPTION 'booking_group_quote_position_reference_not_found'
      USING ERRCODE = '23503';
  END IF;
  IF target_group_quote.booking_group_id <> NEW.booking_group_id
    OR target_group_position.booking_group_id <> NEW.booking_group_id
    OR target_group_position.listing_id <> NEW.listing_id
    OR target_single_quote.renter_id <> target_group.renter_id
    OR target_single_quote.listing_id <> NEW.listing_id
    OR target_single_quote.rental_start_date <> target_group.rental_start_date
    OR target_single_quote.rental_end_date <> target_group.rental_end_date
    OR target_single_quote.rental_timezone <> target_group.rental_timezone
    OR target_single_quote.starts_at <> target_group.starts_at
    OR target_single_quote.ends_at <> target_group.ends_at
    OR target_single_quote.currency <> NEW.currency
    OR target_single_quote.quote_hash <> NEW.booking_quote_hash
    OR target_single_quote.total_minor <> NEW.total_minor
    OR target_single_quote.expires_at <= now()
    OR sit_try_numeric(target_single_quote.quote_payload->>'rentalSubtotalMinor')
         IS DISTINCT FROM NEW.rental_subtotal_minor::numeric
    OR sit_try_numeric(target_single_quote.quote_payload->>'platformFeeMinor')
         IS DISTINCT FROM NEW.platform_fee_minor::numeric
    OR sit_try_numeric(target_single_quote.quote_payload->>'ownerPayoutMinor')
         IS DISTINCT FROM NEW.owner_payout_minor::numeric
    OR sit_try_numeric(target_single_quote.quote_payload->>'securityDepositMinor')
         IS DISTINCT FROM NEW.security_deposit_minor::numeric
  THEN
    RAISE EXCEPTION 'booking_group_quote_position_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_quote_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_quote booking_group_quotes%ROWTYPE;
  totals RECORD;
  target_quote_id TEXT;
BEGIN
  target_quote_id := COALESCE(
    to_jsonb(NEW)->>'group_quote_id',
    to_jsonb(NEW)->>'id'
  );
  SELECT * INTO target_quote FROM booking_group_quotes WHERE id = target_quote_id;
  SELECT count(*)::int AS item_count,
         COALESCE(sum(rental_subtotal_minor), 0)::bigint AS rental_subtotal_minor,
         COALESCE(sum(platform_fee_minor), 0)::bigint AS platform_fee_minor,
         COALESCE(sum(total_minor), 0)::bigint AS total_minor,
         COALESCE(sum(owner_payout_minor), 0)::bigint AS owner_payout_minor,
         COALESCE(sum(security_deposit_minor), 0)::bigint AS security_deposit_minor
    INTO totals
    FROM booking_group_quote_positions WHERE group_quote_id = target_quote_id;
  IF totals.item_count <> target_quote.item_count
    OR totals.rental_subtotal_minor <> target_quote.rental_subtotal_minor
    OR totals.platform_fee_minor <> target_quote.platform_fee_minor
    OR totals.total_minor <> target_quote.total_minor
    OR totals.owner_payout_minor <> target_quote.owner_payout_minor
    OR totals.security_deposit_minor <> target_quote.security_deposit_minor
  THEN
    RAISE EXCEPTION 'booking_group_quote_balance_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sit_validate_booking_group_state_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_group booking_groups%ROWTYPE;
  target_quote booking_group_quotes%ROWTYPE;
  previous_event booking_group_state_events%ROWTYPE;
  target_position_count INTEGER;
BEGIN
  SELECT * INTO target_group FROM booking_groups WHERE id = NEW.booking_group_id FOR KEY SHARE;
  SELECT * INTO target_quote FROM booking_group_quotes WHERE id = NEW.group_quote_id FOR KEY SHARE;
  IF target_group.id IS NULL OR target_quote.id IS NULL THEN
    RAISE EXCEPTION 'booking_group_event_reference_not_found' USING ERRCODE = '23503';
  END IF;
  IF target_quote.booking_group_id <> NEW.booking_group_id
    OR target_quote.quote_hash <> NEW.group_quote_hash
    OR (NEW.actor_group_role = 'renter' AND NEW.actor_id <> target_group.renter_id)
    OR (NEW.actor_group_role = 'owner' AND NEW.actor_id <> target_group.owner_id)
  THEN
    RAISE EXCEPTION 'booking_group_event_binding_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.event_sequence = 1 THEN
    SELECT count(*)::int INTO target_position_count
      FROM booking_group_positions
      WHERE booking_group_id = NEW.booking_group_id;
    IF NEW.event_type <> 'booking_group.requested'
      OR NEW.actor_group_role <> 'renter'
      OR NEW.from_state IS NOT NULL
      OR NEW.to_state <> 'requested'
      OR target_quote.proposal_kind <> 'initial'
      OR target_quote.item_count <> target_position_count
    THEN
      RAISE EXCEPTION 'booking_group_initial_event_mismatch' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO previous_event
      FROM booking_group_state_events
      WHERE booking_group_id = NEW.booking_group_id
        AND event_sequence = NEW.event_sequence - 1
      FOR KEY SHARE;
    IF NOT FOUND OR NEW.from_state <> previous_event.to_state THEN
      RAISE EXCEPTION 'booking_group_event_sequence_mismatch' USING ERRCODE = '23514';
    END IF;
    IF NOT (
      (NEW.event_type = 'booking_group.owner_accepted_all'
        AND NEW.actor_group_role = 'owner' AND NEW.from_state = 'requested'
        AND NEW.to_state = 'owner_accepted' AND target_quote.proposal_kind = 'initial'
        AND NEW.group_quote_id = previous_event.group_quote_id
        AND NEW.group_quote_hash = previous_event.group_quote_hash)
      OR
      (NEW.event_type = 'booking_group.owner_declined_all'
        AND NEW.actor_group_role = 'owner' AND NEW.from_state = 'requested'
        AND NEW.to_state = 'declined' AND target_quote.proposal_kind = 'initial'
        AND NEW.group_quote_id = previous_event.group_quote_id
        AND NEW.group_quote_hash = previous_event.group_quote_hash)
      OR
      (NEW.event_type = 'booking_group.owner_counteroffered'
        AND NEW.actor_group_role = 'owner' AND NEW.from_state = 'requested'
        AND NEW.to_state = 'counteroffered'
        AND target_quote.proposal_kind = 'owner_counteroffer'
        AND target_quote.predecessor_quote_id = previous_event.group_quote_id)
      OR
      (NEW.event_type = 'booking_group.renter_accepted_counteroffer'
        AND NEW.actor_group_role = 'renter' AND NEW.from_state = 'counteroffered'
        AND NEW.to_state = 'counteroffer_accepted'
        AND target_quote.proposal_kind = 'owner_counteroffer'
        AND NEW.group_quote_id = previous_event.group_quote_id
        AND NEW.group_quote_hash = previous_event.group_quote_hash)
    ) THEN
      RAISE EXCEPTION 'booking_group_event_transition_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_group_quotes_context_guard
BEFORE INSERT ON booking_group_quotes
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_quote();

CREATE TRIGGER booking_group_quote_positions_context_guard
BEFORE INSERT ON booking_group_quote_positions
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_quote_position();

CREATE CONSTRAINT TRIGGER booking_group_quotes_balance_guard
AFTER INSERT ON booking_group_quotes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_quote_balance();

CREATE CONSTRAINT TRIGGER booking_group_quote_positions_balance_guard
AFTER INSERT ON booking_group_quote_positions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_quote_balance();

CREATE TRIGGER booking_group_state_events_context_guard
BEFORE INSERT ON booking_group_state_events
FOR EACH ROW EXECUTE FUNCTION sit_validate_booking_group_state_event();

CREATE TRIGGER booking_group_quotes_append_only
BEFORE UPDATE OR DELETE ON booking_group_quotes
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE TRIGGER booking_group_quote_positions_append_only
BEFORE UPDATE OR DELETE ON booking_group_quote_positions
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

CREATE TRIGGER booking_group_state_events_append_only
BEFORE UPDATE OR DELETE ON booking_group_state_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
