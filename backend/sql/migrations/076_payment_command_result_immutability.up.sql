-- WP150: A completed payment command is durable replay evidence. Preserve the
-- original command identity and bind its stored response to a deterministic
-- digest before runtime authorization policy can change independently.

LOCK TABLE payment_commands IN ACCESS EXCLUSIVE MODE;

-- Do not infer or repair historical completion claims. A response and its
-- completion timestamp must already form one valid pair before hashes are
-- introduced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM payment_commands
    WHERE (completed_at IS NULL) <> (response_payload IS NULL)
       OR (
         completed_at IS NOT NULL
         AND jsonb_typeof(response_payload) IS DISTINCT FROM 'object'
       )
  ) THEN
    RAISE EXCEPTION 'payment_command_historical_completion_malformed'
      USING ERRCODE = '23514',
            DETAIL = 'Migration does not infer or repair payment command completion claims.';
  END IF;
END;
$$;

ALTER TABLE payment_commands
  ADD COLUMN response_payload_sha256 CHAR(64),
  ADD COLUMN completion_integrity_version SMALLINT,
  ADD COLUMN settlement_refunded_minor BIGINT,
  ADD COLUMN settlement_transferred_minor BIGINT;

UPDATE payment_commands
SET response_payload_sha256 = encode(
  digest(response_payload::text, 'sha256'),
  'hex'
)
WHERE completed_at IS NOT NULL
  AND response_payload IS NOT NULL
  AND jsonb_typeof(response_payload) = 'object';

ALTER TABLE payment_commands
  ADD CONSTRAINT payment_commands_result_null_parity CHECK (
    (
      completed_at IS NULL
      AND response_payload IS NULL
      AND response_payload_sha256 IS NULL
    )
    OR
    (
      completed_at IS NOT NULL
      AND response_payload IS NOT NULL
      AND response_payload_sha256 IS NOT NULL
    )
  ),
  ADD CONSTRAINT payment_commands_result_object CHECK (
    response_payload IS NULL
    OR jsonb_typeof(response_payload) = 'object'
  ),
  ADD CONSTRAINT payment_commands_result_hash CHECK (
    response_payload_sha256 IS NULL
    OR response_payload_sha256 = encode(
      digest(response_payload::text, 'sha256'),
      'hex'
    )
  ),
  ADD CONSTRAINT payment_commands_completion_integrity_version CHECK (
    completion_integrity_version IS NULL OR completion_integrity_version = 1
  ),
  ADD CONSTRAINT payment_commands_settlement_snapshot CHECK (
    (
      completion_integrity_version IS NULL
      AND settlement_refunded_minor IS NULL
      AND settlement_transferred_minor IS NULL
    )
    OR
    (
      completion_integrity_version = 1
      AND completed_at IS NOT NULL
      AND (
        (
          command_type IN ('payment.refund', 'payment.release')
          AND settlement_refunded_minor IS NOT NULL
          AND settlement_refunded_minor >= 0
          AND settlement_transferred_minor IS NOT NULL
          AND settlement_transferred_minor >= 0
        )
        OR
        (
          command_type NOT IN ('payment.refund', 'payment.release')
          AND settlement_refunded_minor IS NULL
          AND settlement_transferred_minor IS NULL
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION sit_guard_payment_command_result_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  expected_response_payload_sha256 TEXT;
BEGIN
  -- Existing completed rows were validated and backfilled above. New rows must
  -- always begin incomplete so completion can happen only through this guard.
  IF TG_OP = 'INSERT' THEN
    IF NEW.completed_at IS NOT NULL
      OR NEW.response_payload IS NOT NULL
      OR NEW.response_payload_sha256 IS NOT NULL
      OR NEW.completion_integrity_version IS NOT NULL
      OR NEW.settlement_refunded_minor IS NOT NULL
      OR NEW.settlement_transferred_minor IS NOT NULL
    THEN
      RAISE EXCEPTION 'payment_command_direct_completion_forbidden'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'payment_command_completed_deletion_forbidden'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
    NEW.idempotency_key,
    NEW.command_type,
    NEW.actor_id,
    NEW.booking_id,
    NEW.request_hash,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.idempotency_key,
    OLD.command_type,
    OLD.actor_id,
    OLD.booking_id,
    OLD.request_hash,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'payment_command_identity_immutable'
      USING ERRCODE = '55000';
  END IF;

  -- A command created before its payment exists may acquire exactly one
  -- concrete payment id, but only while both old and new rows are incomplete.
  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
    IF OLD.payment_id IS NOT NULL
      OR NEW.payment_id IS NULL
      OR OLD.completed_at IS NOT NULL
      OR OLD.response_payload IS NOT NULL
      OR OLD.response_payload_sha256 IS NOT NULL
      OR OLD.completion_integrity_version IS NOT NULL
      OR OLD.settlement_refunded_minor IS NOT NULL
      OR OLD.settlement_transferred_minor IS NOT NULL
      OR NEW.completed_at IS NOT NULL
      OR NEW.response_payload IS NOT NULL
      OR NEW.response_payload_sha256 IS NOT NULL
      OR NEW.completion_integrity_version IS NOT NULL
      OR NEW.settlement_refunded_minor IS NOT NULL
      OR NEW.settlement_transferred_minor IS NOT NULL
    THEN
      RAISE EXCEPTION 'payment_command_payment_binding_immutable'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD.completed_at IS NOT NULL THEN
    IF ROW(
      NEW.response_payload,
      NEW.completed_at,
      NEW.response_payload_sha256,
      NEW.completion_integrity_version,
      NEW.settlement_refunded_minor,
      NEW.settlement_transferred_minor
    ) IS DISTINCT FROM ROW(
      OLD.response_payload,
      OLD.completed_at,
      OLD.response_payload_sha256,
      OLD.completion_integrity_version,
      OLD.settlement_refunded_minor,
      OLD.settlement_transferred_minor
    ) THEN
      RAISE EXCEPTION 'payment_command_completed_result_immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.completed_at IS NULL THEN
    IF NEW.response_payload IS NOT NULL
      OR NEW.response_payload_sha256 IS NOT NULL
      OR NEW.completion_integrity_version IS NOT NULL
      OR NEW.settlement_refunded_minor IS NOT NULL
      OR NEW.settlement_transferred_minor IS NOT NULL
    THEN
      RAISE EXCEPTION 'payment_command_incomplete_result_forbidden'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.response_payload IS NULL
    OR jsonb_typeof(NEW.response_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'payment_command_completion_response_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.completion_integrity_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'payment_command_completion_integrity_version_invalid'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.command_type IN ('payment.refund', 'payment.release') THEN
    IF NEW.settlement_refunded_minor IS NULL
      OR NEW.settlement_refunded_minor < 0
      OR NEW.settlement_transferred_minor IS NULL
      OR NEW.settlement_transferred_minor < 0
    THEN
      RAISE EXCEPTION 'payment_command_settlement_snapshot_invalid'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.settlement_refunded_minor IS NOT NULL
    OR NEW.settlement_transferred_minor IS NOT NULL
  THEN
    RAISE EXCEPTION 'payment_command_settlement_snapshot_unexpected'
      USING ERRCODE = '23514';
  END IF;

  expected_response_payload_sha256 := encode(
    digest(NEW.response_payload::text, 'sha256'),
    'hex'
  );
  IF NEW.response_payload_sha256 IS NULL THEN
    NEW.response_payload_sha256 := expected_response_payload_sha256;
  ELSIF NEW.response_payload_sha256 IS DISTINCT FROM expected_response_payload_sha256 THEN
    RAISE EXCEPTION 'payment_command_completion_hash_invalid'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_commands_result_immutability_guard
BEFORE INSERT OR UPDATE OR DELETE ON payment_commands
FOR EACH ROW EXECUTE FUNCTION sit_guard_payment_command_result_immutability();
