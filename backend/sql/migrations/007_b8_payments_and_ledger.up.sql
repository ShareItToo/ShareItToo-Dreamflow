-- B8: Stripe Connect, authoritative payment lifecycle and append-only ledger.
-- Additive by design. Production can keep PAYMENT_TRANSPORT=disabled until the
-- platform account, policy decisions and pilot allowlist are explicitly ready.

CREATE TABLE stripe_connect_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  provider_account_id TEXT NOT NULL UNIQUE,
  country CHAR(2) NOT NULL DEFAULT 'DE' CHECK (country ~ '^[A-Z]{2}$'),
  default_currency CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (default_currency ~ '^[A-Z]{3}$'),
  account_type TEXT NOT NULL DEFAULT 'hosted' CHECK (account_type IN ('hosted')),
  details_submitted BOOLEAN NOT NULL DEFAULT false,
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  transfers_capability TEXT NOT NULL DEFAULT 'inactive'
    CHECK (transfers_capability IN ('inactive', 'pending', 'active', 'restricted')),
  requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
  disabled_reason TEXT,
  livemode BOOLEAN NOT NULL DEFAULT false,
  provider_created_at TIMESTAMPTZ,
  last_provider_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stripe_connect_accounts_ready_idx
  ON stripe_connect_accounts(payouts_enabled, transfers_capability, updated_at DESC);

CREATE TABLE stripe_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  provider_customer_id TEXT NOT NULL UNIQUE,
  livemode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS provider_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS checkout_command_key TEXT,
  ADD COLUMN IF NOT EXISTS transfer_group TEXT,
  ADD COLUMN IF NOT EXISTS rental_subtotal_minor BIGINT,
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS owner_payout_minor BIGINT,
  ADD COLUMN IF NOT EXISTS security_deposit_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transferred_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS checkout_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_provider_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN NOT NULL DEFAULT false;

UPDATE payments AS payment
SET rental_subtotal_minor = booking.rental_subtotal_minor,
    platform_fee_minor = booking.quoted_total_minor - booking.owner_payout_minor,
    owner_payout_minor = booking.owner_payout_minor,
    security_deposit_minor = booking.security_deposit_minor,
    captured_minor = CASE WHEN payment.status IN ('captured', 'refunded', 'partially_refunded') THEN payment.amount_minor ELSE 0 END
FROM bookings AS booking
WHERE booking.id = payment.booking_id;

ALTER TABLE payments
  ALTER COLUMN rental_subtotal_minor SET NOT NULL,
  ALTER COLUMN platform_fee_minor SET NOT NULL,
  ALTER COLUMN owner_payout_minor SET NOT NULL;

ALTER TABLE payments
  ADD CONSTRAINT payments_version_check CHECK (payment_version = 1) NOT VALID,
  ADD CONSTRAINT payments_amount_breakdown_check CHECK (
    rental_subtotal_minor >= 0
    AND platform_fee_minor >= 0
    AND owner_payout_minor >= 0
    AND security_deposit_minor >= 0
    AND owner_payout_minor + platform_fee_minor = amount_minor
  ) NOT VALID,
  ADD CONSTRAINT payments_settlement_totals_check CHECK (
    captured_minor >= 0
    AND refunded_minor >= 0
    AND transferred_minor >= 0
    AND captured_minor <= amount_minor
    AND refunded_minor <= captured_minor
    AND transferred_minor <= owner_payout_minor
  ) NOT VALID;
ALTER TABLE payments VALIDATE CONSTRAINT payments_version_check;
ALTER TABLE payments VALIDATE CONSTRAINT payments_amount_breakdown_check;
ALTER TABLE payments VALIDATE CONSTRAINT payments_settlement_totals_check;
CREATE UNIQUE INDEX payments_checkout_session_idx
  ON payments(provider_checkout_session_id) WHERE provider_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX payments_provider_charge_idx
  ON payments(provider_charge_id) WHERE provider_charge_id IS NOT NULL;
CREATE INDEX payments_booking_version_created_idx
  ON payments(booking_id, payment_version, created_at DESC);

CREATE TABLE payment_commands (
  idempotency_key TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  command_type TEXT NOT NULL CHECK (command_type IN (
    'connect.onboard', 'payment.checkout', 'deposit.setup',
    'payment.refund', 'payment.release', 'deposit.charge'
  )),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX payment_commands_booking_created_idx ON payment_commands(booking_id, created_at DESC);

CREATE UNIQUE INDEX refunds_payment_in_progress_idx
  ON refunds(payment_id) WHERE status IN ('created', 'pending');

CREATE TABLE payment_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  provider_event_id TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled'
  )),
  failure_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_attempts_payment_created_idx ON payment_attempts(payment_id, created_at DESC);

CREATE TABLE deposit_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  renter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  provider_setup_intent_id TEXT UNIQUE,
  provider_checkout_session_id TEXT UNIQUE,
  provider_customer_id TEXT,
  provider_payment_method_id TEXT,
  setup_command_key TEXT,
  setup_checkout_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'requires_action', 'active', 'revoked', 'failed', 'expired')),
  maximum_amount_minor BIGINT NOT NULL CHECK (maximum_amount_minor >= 0),
  charged_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (charged_amount_minor >= 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  livemode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (charged_amount_minor <= maximum_amount_minor)
);
CREATE INDEX deposit_mandates_status_expiry_idx ON deposit_mandates(status, expires_at);

CREATE TABLE deposit_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id UUID NOT NULL REFERENCES deposit_mandates(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE RESTRICT,
  provider_payment_intent_id TEXT UNIQUE,
  provider_charge_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'requires_action', 'succeeded', 'failed', 'refunded')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 2000),
  failure_code TEXT,
  livemode BOOLEAN NOT NULL DEFAULT false,
  succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deposit_charges_booking_created_idx ON deposit_charges(booking_id, created_at DESC);
CREATE UNIQUE INDEX deposit_charges_mandate_in_progress_idx
  ON deposit_charges(mandate_id) WHERE status IN ('created', 'requires_action');

CREATE TABLE payment_provider_events (
  provider_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  object_id TEXT,
  account_id TEXT,
  payload_sha256 CHAR(64) NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  livemode BOOLEAN NOT NULL DEFAULT false,
  provider_created_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
  last_error_code TEXT,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_provider_events_status_received_idx
  ON payment_provider_events(status, received_at);

CREATE TABLE ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  refund_id UUID REFERENCES refunds(id) ON DELETE RESTRICT,
  payout_id UUID REFERENCES payouts(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'payment_captured', 'payment_refunded', 'owner_transfer',
    'owner_transfer_reversed', 'deposit_charged', 'chargeback',
    'chargeback_reversed'
  )),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_transactions_booking_created_idx ON ledger_transactions(booking_id, created_at DESC);

CREATE TABLE ledger_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
  account_code TEXT NOT NULL CHECK (account_code IN (
    'stripe_clearing', 'owner_payable', 'platform_revenue',
    'deposit_hold', 'refund_expense', 'chargeback_expense'
  )),
  account_owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  debit_minor BIGINT NOT NULL DEFAULT 0 CHECK (debit_minor >= 0),
  credit_minor BIGINT NOT NULL DEFAULT 0 CHECK (credit_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((debit_minor > 0 AND credit_minor = 0) OR (credit_minor > 0 AND debit_minor = 0))
);
CREATE INDEX ledger_entries_transaction_idx ON ledger_entries(transaction_id, id);
CREATE INDEX ledger_entries_account_idx ON ledger_entries(account_code, account_owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION sit_validate_balanced_ledger_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction UUID;
  total_debit NUMERIC;
  total_credit NUMERIC;
BEGIN
  target_transaction := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT COALESCE(sum(debit_minor), 0), COALESCE(sum(credit_minor), 0)
    INTO total_debit, total_credit
  FROM ledger_entries
  WHERE transaction_id = target_transaction;
  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'unbalanced ledger transaction %: debit %, credit %',
      target_transaction, total_debit, total_credit USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION sit_validate_balanced_ledger_transaction();

ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS provider_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_connected_account_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payouts
  ADD CONSTRAINT payouts_reversed_total_check
  CHECK (reversed_minor >= 0 AND reversed_minor <= amount_minor) NOT VALID;
ALTER TABLE payouts VALIDATE CONSTRAINT payouts_reversed_total_check;
CREATE UNIQUE INDEX payouts_provider_transfer_idx
  ON payouts(provider_transfer_id) WHERE provider_transfer_id IS NOT NULL;
CREATE UNIQUE INDEX payouts_payment_in_progress_idx
  ON payouts(payment_id) WHERE payment_id IS NOT NULL AND status IN ('scheduled', 'pending');

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS provider_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS owner_share_minor BIGINT,
  ADD COLUMN IF NOT EXISTS platform_share_minor BIGINT,
  ADD COLUMN IF NOT EXISTS reverse_transfer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_platform_fee BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS succeeded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN NOT NULL DEFAULT false;

UPDATE refunds AS refund
SET owner_share_minor = LEAST(refund.amount_minor, payment.owner_payout_minor),
    platform_share_minor = refund.amount_minor - LEAST(refund.amount_minor, payment.owner_payout_minor)
FROM payments AS payment
WHERE payment.id = refund.payment_id
  AND (refund.owner_share_minor IS NULL OR refund.platform_share_minor IS NULL);

ALTER TABLE refunds
  ALTER COLUMN owner_share_minor SET NOT NULL,
  ALTER COLUMN platform_share_minor SET NOT NULL,
  ADD CONSTRAINT refunds_amount_breakdown_check CHECK (
    owner_share_minor >= 0
    AND platform_share_minor >= 0
    AND owner_share_minor + platform_share_minor = amount_minor
  ) NOT VALID;
ALTER TABLE refunds VALIDATE CONSTRAINT refunds_amount_breakdown_check;

ALTER TABLE disputes
  ADD COLUMN IF NOT EXISTS provider_dispute_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_evidence_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX disputes_provider_dispute_idx
  ON disputes(provider_dispute_id) WHERE provider_dispute_id IS NOT NULL;

DROP TRIGGER IF EXISTS stripe_connect_accounts_set_updated_at ON stripe_connect_accounts;
CREATE TRIGGER stripe_connect_accounts_set_updated_at BEFORE UPDATE ON stripe_connect_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS stripe_customers_set_updated_at ON stripe_customers;
CREATE TRIGGER stripe_customers_set_updated_at BEFORE UPDATE ON stripe_customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS deposit_mandates_set_updated_at ON deposit_mandates;
CREATE TRIGGER deposit_mandates_set_updated_at BEFORE UPDATE ON deposit_mandates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS deposit_charges_set_updated_at ON deposit_charges;
CREATE TRIGGER deposit_charges_set_updated_at BEFORE UPDATE ON deposit_charges
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS payment_provider_events_set_updated_at ON payment_provider_events;
CREATE TRIGGER payment_provider_events_set_updated_at BEFORE UPDATE ON payment_provider_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS payment_attempts_append_only ON payment_attempts;
CREATE TRIGGER payment_attempts_append_only BEFORE UPDATE OR DELETE ON payment_attempts
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
DROP TRIGGER IF EXISTS ledger_transactions_append_only ON ledger_transactions;
CREATE TRIGGER ledger_transactions_append_only BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
DROP TRIGGER IF EXISTS ledger_entries_append_only ON ledger_entries;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION sit_reject_append_only_mutation();
