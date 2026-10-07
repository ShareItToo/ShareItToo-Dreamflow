-- V5.1 withdrawal/termination evidence and separate refund obligations.
-- This migration does not enable live money. It records the binding legal
-- instruction and the two distinct debtor obligations so a licensed PSP can
-- execute them only after its own production gate is approved.

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_workflow_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_workflow_status_check CHECK (
    workflow_status IN (
      'draft', 'requested', 'accepted', 'payment_pending', 'confirmed',
      'active', 'withdrawalReturnRequired', 'returned', 'completed',
      'declined', 'cancelled', 'refunded', 'disputed'
    )
  );

ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_from_status_check;
ALTER TABLE booking_events DROP CONSTRAINT IF EXISTS booking_events_to_status_check;
ALTER TABLE booking_events
  ADD CONSTRAINT booking_events_from_status_check CHECK (
    from_status IS NULL OR from_status IN (
      'pending', 'accepted', 'declined', 'cancelled', 'running', 'completed',
      'draft', 'requested', 'payment_pending', 'confirmed', 'active',
      'withdrawalReturnRequired', 'returned', 'refunded', 'disputed'
    )
  ),
  ADD CONSTRAINT booking_events_to_status_check CHECK (
    to_status IS NULL OR to_status IN (
      'pending', 'accepted', 'declined', 'cancelled', 'running', 'completed',
      'draft', 'requested', 'payment_pending', 'confirmed', 'active',
      'withdrawalReturnRequired', 'returned', 'refunded', 'disputed'
    )
  );

CREATE TABLE IF NOT EXISTS v51_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK (scope IN ('account_contract', 'booking_contract')),
  platform_contract_id UUID REFERENCES platform_contracts(id) ON DELETE RESTRICT,
  booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  withdrawal_document_snapshot_id UUID NOT NULL
    REFERENCES legal_document_snapshots(id) ON DELETE RESTRICT,
  actor_name TEXT NOT NULL CHECK (char_length(actor_name) BETWEEN 1 AND 240),
  electronic_channel TEXT NOT NULL CHECK (
    electronic_channel IN ('in_app_download', 'email')
  ),
  effect_phase TEXT NOT NULL CHECK (
    effect_phase IN ('account_only', 'before_handover', 'after_handover')
  ),
  effect_status TEXT NOT NULL CHECK (
    effect_status IN (
      'received', 'booking_cancelled', 'return_required', 'return_completed',
      'manual_review_required'
    )
  ),
  eligibility_status TEXT NOT NULL CHECK (
    eligibility_status IN (
      'account_contract_received', 'automatic_14_day', 'manual_review_required'
    )
  ),
  right_expires_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'account_contract'
      AND platform_contract_id IS NULL
      AND booking_id IS NULL
      AND effect_phase = 'account_only'
      AND eligibility_status = 'account_contract_received'
      AND right_expires_at IS NULL)
    OR
    (scope = 'booking_contract'
      AND platform_contract_id IS NOT NULL
      AND booking_id IS NOT NULL
      AND effect_phase IN ('before_handover', 'after_handover')
      AND eligibility_status IN ('automatic_14_day', 'manual_review_required')
      AND right_expires_at IS NOT NULL)
  ),
  CHECK (submitted_at <= created_at + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS v51_withdrawals_user_time_idx
  ON v51_withdrawals(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS v51_withdrawals_booking_time_idx
  ON v51_withdrawals(booking_id, submitted_at DESC)
  WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS v51_withdrawals_one_booking_contract_idx
  ON v51_withdrawals(booking_id)
  WHERE scope = 'booking_contract';

CREATE TABLE IF NOT EXISTS v51_refund_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES v51_withdrawals(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  refund_type TEXT NOT NULL CHECK (refund_type IN ('rent_refund', 'sit_fee_refund')),
  debtor_role TEXT NOT NULL CHECK (debtor_role IN ('owner', 'sit')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL CHECK (status IN ('required', 'calculation_pending')),
  amount_due_minor BIGINT CHECK (amount_due_minor IS NULL OR amount_due_minor >= 0),
  maximum_minor BIGINT NOT NULL CHECK (maximum_minor >= 0),
  calculation_basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (withdrawal_id, refund_type),
  CHECK (
    (status = 'required' AND amount_due_minor IS NOT NULL)
    OR (status = 'calculation_pending' AND amount_due_minor IS NULL)
  ),
  CHECK (amount_due_minor IS NULL OR amount_due_minor <= maximum_minor),
  CHECK (
    (refund_type = 'rent_refund' AND debtor_role = 'owner')
    OR (refund_type = 'sit_fee_refund' AND debtor_role = 'sit')
  )
);

CREATE INDEX IF NOT EXISTS v51_refund_obligations_booking_idx
  ON v51_refund_obligations(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS v51_refund_obligation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL
    REFERENCES v51_refund_obligations(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type = 'calculation_completed'),
  amount_due_minor BIGINT NOT NULL CHECK (amount_due_minor >= 0),
  calculation_basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  UNIQUE (obligation_id, event_type)
);

CREATE INDEX IF NOT EXISTS v51_refund_obligation_events_time_idx
  ON v51_refund_obligation_events(obligation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS v51_cancellation_refund_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  refund_type TEXT NOT NULL CHECK (
    refund_type IN ('rent_refund', 'sit_fee_refund')
  ),
  debtor_role TEXT NOT NULL CHECK (debtor_role IN ('owner', 'sit')),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL CHECK (
    status IN ('required', 'pending_actual_loss_assessment')
  ),
  amount_due_minor BIGINT CHECK (amount_due_minor IS NULL OR amount_due_minor >= 0),
  maximum_minor BIGINT NOT NULL CHECK (maximum_minor >= 0),
  calculation_basis JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, refund_type, idempotency_key),
  CHECK (
    (status = 'required' AND amount_due_minor IS NOT NULL)
    OR
    (status = 'pending_actual_loss_assessment' AND amount_due_minor IS NULL)
  ),
  CHECK (amount_due_minor IS NULL OR amount_due_minor <= maximum_minor),
  CHECK (
    (refund_type = 'rent_refund' AND debtor_role = 'owner')
    OR (refund_type = 'sit_fee_refund' AND debtor_role = 'sit')
  )
);

CREATE INDEX IF NOT EXISTS v51_cancellation_refunds_booking_idx
  ON v51_cancellation_refund_obligations(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS v51_withdrawal_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL UNIQUE
    REFERENCES v51_withdrawals(id) ON DELETE RESTRICT,
  artifact_format TEXT NOT NULL CHECK (artifact_format = 'html'),
  content_html TEXT NOT NULL CHECK (char_length(content_html) > 0),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  generated_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (generated_at <= created_at + INTERVAL '5 minutes')
);

CREATE TABLE IF NOT EXISTS v51_withdrawal_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES v51_withdrawals(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('generated', 'delivery_attempted', 'delivered', 'failed')
  ),
  artifact_sha256 TEXT NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  delivery_channel TEXT NOT NULL CHECK (
    delivery_channel IN ('in_app_download', 'email')
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS v51_withdrawal_receipt_events_time_idx
  ON v51_withdrawal_receipt_events(withdrawal_id, occurred_at DESC);

DROP TRIGGER IF EXISTS v51_withdrawals_append_only ON v51_withdrawals;
CREATE TRIGGER v51_withdrawals_append_only
BEFORE UPDATE OR DELETE ON v51_withdrawals
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS v51_refund_obligations_append_only ON v51_refund_obligations;
CREATE TRIGGER v51_refund_obligations_append_only
BEFORE UPDATE OR DELETE ON v51_refund_obligations
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS v51_refund_obligation_events_append_only
  ON v51_refund_obligation_events;
CREATE TRIGGER v51_refund_obligation_events_append_only
BEFORE UPDATE OR DELETE ON v51_refund_obligation_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS v51_cancellation_refund_obligations_append_only
  ON v51_cancellation_refund_obligations;
CREATE TRIGGER v51_cancellation_refund_obligations_append_only
BEFORE UPDATE OR DELETE ON v51_cancellation_refund_obligations
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS v51_withdrawal_receipts_append_only ON v51_withdrawal_receipts;
CREATE TRIGGER v51_withdrawal_receipts_append_only
BEFORE UPDATE OR DELETE ON v51_withdrawal_receipts
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();

DROP TRIGGER IF EXISTS v51_withdrawal_receipt_events_append_only
  ON v51_withdrawal_receipt_events;
CREATE TRIGGER v51_withdrawal_receipt_events_append_only
BEFORE UPDATE OR DELETE ON v51_withdrawal_receipt_events
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
