-- WP141: Bind every refund-side transfer reversal to one immutable payout,
-- amount and provider idempotency key. A refund can span multiple partial
-- payouts and a lost provider response must remain recoverable without
-- recalculating or duplicating a reversal.

ALTER TABLE refunds
  ADD CONSTRAINT refunds_refund_payment_binding_unique UNIQUE (id, payment_id);
ALTER TABLE payouts
  ADD CONSTRAINT payouts_refund_payment_binding_unique UNIQUE (id, payment_id);

CREATE TABLE refund_transfer_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  payout_id UUID NOT NULL,
  provider_transfer_id TEXT NOT NULL,
  provider_reversal_id TEXT UNIQUE,
  provider_idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'processing', 'retryable', 'uncertain',
      'succeeded', 'manual_review'
    )),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_expires_at TIMESTAMPTZ,
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
  UNIQUE (refund_id, payout_id),
  FOREIGN KEY (refund_id, payment_id)
    REFERENCES refunds(id, payment_id) ON DELETE RESTRICT,
  FOREIGN KEY (payout_id, payment_id)
    REFERENCES payouts(id, payment_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'succeeded'
      AND provider_reversal_id IS NOT NULL
      AND succeeded_at IS NOT NULL
      AND needs_review = false)
    OR
    (status <> 'succeeded'
      AND provider_reversal_id IS NULL
      AND succeeded_at IS NULL)
  )
);

CREATE INDEX refund_transfer_reversals_refund_idx
  ON refund_transfer_reversals(refund_id, status, created_at);
CREATE INDEX refund_transfer_reversals_due_idx
  ON refund_transfer_reversals(status, next_attempt_at, created_at);

DROP TRIGGER IF EXISTS refund_transfer_reversals_set_updated_at
  ON refund_transfer_reversals;
CREATE TRIGGER refund_transfer_reversals_set_updated_at
BEFORE UPDATE ON refund_transfer_reversals
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
