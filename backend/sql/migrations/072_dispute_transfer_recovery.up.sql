-- WP74: Recover an already-paid owner transfer after provider chargeback funds
-- are withdrawn. Remote reversal attempts live in a durable, lease-based
-- outbox so a timeout or process death can never become local success truth.

ALTER TABLE disputes
  ADD COLUMN payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  ADD COLUMN provider_disputed_amount_minor BIGINT
    CHECK (provider_disputed_amount_minor IS NULL OR provider_disputed_amount_minor > 0),
  ADD COLUMN provider_funds_withdrawn_at TIMESTAMPTZ,
  ADD COLUMN provider_funds_withdrawn_event_id TEXT
    REFERENCES payment_provider_events(provider_event_id) ON DELETE RESTRICT,
  ADD COLUMN provider_funds_reinstated_at TIMESTAMPTZ,
  ADD COLUMN provider_funds_reinstated_event_id TEXT
    REFERENCES payment_provider_events(provider_event_id) ON DELETE RESTRICT,
  ADD COLUMN transfer_recovery_state TEXT NOT NULL DEFAULT 'not_required'
    CHECK (transfer_recovery_state IN (
      'not_required', 'pending', 'in_progress', 'needs_review',
      'recovered', 'cancelled'
    )),
  ADD COLUMN transfer_recovery_needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN transfer_recovery_issue_code TEXT;

CREATE INDEX disputes_payment_provider_idx
  ON disputes(payment_id, provider_dispute_id);

CREATE TABLE dispute_transfer_recoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  payout_id UUID NOT NULL REFERENCES payouts(id) ON DELETE RESTRICT,
  trigger_provider_event_id TEXT NOT NULL
    REFERENCES payment_provider_events(provider_event_id) ON DELETE RESTRICT,
  provider_transfer_id TEXT NOT NULL,
  provider_reversal_id TEXT,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'processing', 'retryable', 'uncertain',
      'succeeded', 'manual_review', 'cancelled'
    )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  recovered_minor BIGINT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
  cancel_requested BOOLEAN NOT NULL DEFAULT false,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  last_error_category TEXT CHECK (
    last_error_category IS NULL OR last_error_category IN (
      'insufficient_balance', 'uncertain_provider_outcome',
      'definite_provider_rejection', 'integrity_conflict'
    )
  ),
  last_error_code TEXT,
  livemode BOOLEAN NOT NULL DEFAULT false,
  succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dispute_id, payout_id),
  CHECK (recovered_minor >= 0 AND recovered_minor <= amount_minor),
  CHECK (
    (status = 'succeeded'
      AND provider_reversal_id IS NOT NULL
      AND recovered_minor = amount_minor
      AND succeeded_at IS NOT NULL)
    OR
    (status <> 'succeeded'
      AND provider_reversal_id IS NULL
      AND recovered_minor = 0
      AND succeeded_at IS NULL)
  )
);

CREATE UNIQUE INDEX dispute_transfer_recoveries_provider_reversal_idx
  ON dispute_transfer_recoveries(provider_reversal_id)
  WHERE provider_reversal_id IS NOT NULL;
CREATE INDEX dispute_transfer_recoveries_due_idx
  ON dispute_transfer_recoveries(status, next_attempt_at, created_at);
CREATE INDEX dispute_transfer_recoveries_dispute_idx
  ON dispute_transfer_recoveries(dispute_id, status, created_at);

DROP TRIGGER IF EXISTS dispute_transfer_recoveries_set_updated_at
  ON dispute_transfer_recoveries;
CREATE TRIGGER dispute_transfer_recoveries_set_updated_at
BEFORE UPDATE ON dispute_transfer_recoveries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ledger_transactions
  DROP CONSTRAINT ledger_transactions_transaction_type_check;
ALTER TABLE ledger_transactions
  ADD CONSTRAINT ledger_transactions_transaction_type_check CHECK (
    transaction_type IN (
      'payment_captured', 'payment_refunded', 'owner_transfer',
      'owner_transfer_reversed', 'deposit_charged', 'chargeback',
      'chargeback_reversed', 'chargeback_owner_transfer_recovered',
      'chargeback_owner_recovery_reinstated'
    )
  );
