-- WP151: The original refund_platform_fee boolean mixed SIT's customer-facing
-- platform share with Stripe's Application Fee refund option. Preserve every
-- historical value as an explicitly untrusted legacy claim, but never infer a
-- provider outcome from it. New rows use one exact Separate Charges and
-- Transfers model: refund the platform charge and reverse owner transfers
-- through the separately persisted reversal plan.

LOCK TABLE refunds IN ACCESS EXCLUSIVE MODE;

ALTER TABLE refunds
  RENAME COLUMN refund_platform_fee TO legacy_refund_platform_fee_claim;

ALTER TABLE refunds
  ALTER COLUMN legacy_refund_platform_fee_claim DROP DEFAULT,
  ALTER COLUMN legacy_refund_platform_fee_claim DROP NOT NULL,
  ADD COLUMN provider_refund_model TEXT,
  ADD COLUMN local_settlement_status TEXT,
  ADD COLUMN local_settled_at TIMESTAMPTZ,
  ADD COLUMN local_settlement_error_code TEXT,
  ADD COLUMN provider_observation_status TEXT,
  ADD COLUMN provider_observation_reference TEXT,
  ADD COLUMN provider_observation_error_code TEXT,
  ADD COLUMN provider_observed_at TIMESTAMPTZ;

ALTER TABLE refunds
  ADD CONSTRAINT refunds_provider_refund_model_check CHECK ((
    (
      legacy_refund_platform_fee_claim IS NOT NULL
      AND provider_refund_model IS NULL
    )
    OR
    (
      legacy_refund_platform_fee_claim IS NULL
      AND provider_refund_model = 'separate_charge_manual_transfer_reversal_v1'
    )
  ) IS TRUE);

ALTER TABLE refunds
  ADD CONSTRAINT refunds_local_settlement_status_check CHECK ((
    (
      legacy_refund_platform_fee_claim IS NOT NULL
      AND local_settlement_status IS NULL
      AND local_settled_at IS NULL
      AND local_settlement_error_code IS NULL
      AND provider_observation_status IS NULL
      AND provider_observation_reference IS NULL
      AND provider_observation_error_code IS NULL
      AND provider_observed_at IS NULL
    )
    OR
    (
      legacy_refund_platform_fee_claim IS NULL
      AND provider_refund_model = 'separate_charge_manual_transfer_reversal_v1'
      AND (
        (
          provider_observation_status = 'none'
          AND provider_observation_reference IS NULL
          AND provider_observation_error_code IS NULL
          AND provider_observed_at IS NULL
        )
        OR
        (
          provider_observation_status = 'needs_review'
          AND provider_observation_error_code IS NOT NULL
          AND btrim(provider_observation_error_code) <> ''
          AND provider_observed_at IS NOT NULL
        )
      )
      AND (
        (
          status IN ('created', 'pending')
          AND local_settlement_status = 'pending'
          AND local_settled_at IS NULL
          AND local_settlement_error_code IS NULL
        )
        OR
        (
          status IN ('failed', 'cancelled')
          AND local_settlement_status = 'needs_review'
          AND local_settled_at IS NULL
          AND local_settlement_error_code IS NOT NULL
          AND btrim(local_settlement_error_code) <> ''
        )
        OR
        (
          status = 'succeeded'
          AND (
            (
              local_settlement_status = 'pending'
              AND local_settled_at IS NULL
              AND local_settlement_error_code IS NULL
            )
            OR
            (
              local_settlement_status = 'needs_review'
              AND local_settled_at IS NULL
              AND local_settlement_error_code IS NOT NULL
              AND btrim(local_settlement_error_code) <> ''
            )
            OR
            (
              local_settlement_status = 'completed'
              AND local_settled_at IS NOT NULL
              AND local_settlement_error_code IS NULL
            )
          )
        )
      )
    )
  ) IS TRUE);

COMMENT ON COLUMN refunds.legacy_refund_platform_fee_claim IS
  'Unverified pre-WP151 application claim; never provider outcome evidence.';
COMMENT ON COLUMN refunds.provider_refund_model IS
  'Trusted local request model. Separate charge refund; owner transfers reverse through refund_transfer_reversals.';
COMMENT ON COLUMN refunds.local_settlement_status IS
  'Separate durable local booking/payment/ledger settlement state; never provider outcome evidence.';
COMMENT ON COLUMN refunds.local_settled_at IS
  'Timestamp at which the provider-bound refund was atomically reflected in local payment and ledger truth.';
COMMENT ON COLUMN refunds.local_settlement_error_code IS
  'Safe local-only review code after provider success or a terminal pre-provider outcome.';
COMMENT ON COLUMN refunds.provider_observation_status IS
  'Quarantines an ambiguous provider response without claiming failure or success.';
COMMENT ON COLUMN refunds.provider_observation_reference IS
  'Unverified provider object reference retained only for manual reconciliation.';
COMMENT ON COLUMN refunds.provider_observation_error_code IS
  'Safe ambiguity classification; never a provider outcome.';
COMMENT ON COLUMN refunds.provider_observed_at IS
  'Time an ambiguous provider response was durably quarantined.';

CREATE OR REPLACE FUNCTION sit_guard_refund_provider_truth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refund_provider_record_delete_forbidden'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.legacy_refund_platform_fee_claim IS NOT NULL
      OR NEW.provider_refund_model IS DISTINCT FROM
        'separate_charge_manual_transfer_reversal_v1'
    THEN
      RAISE EXCEPTION 'refund_provider_model_required'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.status NOT IN ('created', 'pending')
      OR NEW.provider_refund_id IS NOT NULL
      OR NEW.succeeded_at IS NOT NULL
      OR NEW.local_settlement_status IS DISTINCT FROM 'pending'
      OR NEW.local_settled_at IS NOT NULL
      OR NEW.local_settlement_error_code IS NOT NULL
      OR NEW.provider_observation_status IS DISTINCT FROM 'none'
      OR NEW.provider_observation_reference IS NOT NULL
      OR NEW.provider_observation_error_code IS NOT NULL
      OR NEW.provider_observed_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'refund_provider_outcome_initial_state_invalid'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.legacy_refund_platform_fee_claim IS DISTINCT FROM
      OLD.legacy_refund_platform_fee_claim
    OR NEW.provider_refund_model IS DISTINCT FROM OLD.provider_refund_model
  THEN
    RAISE EXCEPTION 'refund_provider_truth_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.local_settlement_status = 'completed' AND (
      NEW.local_settlement_status IS DISTINCT FROM OLD.local_settlement_status
      OR NEW.local_settled_at IS DISTINCT FROM OLD.local_settled_at
      OR NEW.local_settlement_error_code IS DISTINCT FROM
        OLD.local_settlement_error_code
    )
  THEN
    RAISE EXCEPTION 'refund_local_settlement_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.local_settled_at IS NOT NULL
    AND NEW.local_settled_at IS DISTINCT FROM OLD.local_settled_at
  THEN
    RAISE EXCEPTION 'refund_local_settlement_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.provider_observation_status = 'needs_review' AND (
      NEW.provider_observation_status IS DISTINCT FROM
        OLD.provider_observation_status
      OR NEW.provider_observation_reference IS DISTINCT FROM
        OLD.provider_observation_reference
      OR NEW.provider_observation_error_code IS DISTINCT FROM
        OLD.provider_observation_error_code
      OR NEW.provider_observed_at IS DISTINCT FROM OLD.provider_observed_at
    )
  THEN
    RAISE EXCEPTION 'refund_provider_observation_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF (OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM
        OLD.provider_refund_id)
    OR (OLD.succeeded_at IS NOT NULL AND NEW.succeeded_at IS DISTINCT FROM OLD.succeeded_at)
    OR (OLD.status = 'succeeded' AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id
      OR NEW.succeeded_at IS DISTINCT FROM OLD.succeeded_at
      OR NEW.failure_code IS DISTINCT FROM OLD.failure_code
      OR NEW.reverse_transfer IS DISTINCT FROM OLD.reverse_transfer
    ))
  THEN
    RAISE EXCEPTION 'refund_provider_outcome_immutable'
      USING ERRCODE = '55000';
  END IF;

  IF (
      NEW.status = 'succeeded'
      AND (
        NEW.provider_refund_id IS NULL
        OR btrim(NEW.provider_refund_id) = ''
        OR NEW.succeeded_at IS NULL
        OR NEW.failure_code IS NOT NULL
      )
    ) OR (
      NEW.status <> 'succeeded'
      AND (
        NEW.provider_refund_id IS NOT NULL
        OR NEW.succeeded_at IS NOT NULL
      )
    )
  THEN
    RAISE EXCEPTION 'refund_provider_outcome_incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.provider_charge_id IS DISTINCT FROM OLD.provider_charge_id
    OR NEW.owner_share_minor IS DISTINCT FROM OLD.owner_share_minor
    OR NEW.platform_share_minor IS DISTINCT FROM OLD.platform_share_minor
    OR NEW.livemode IS DISTINCT FROM OLD.livemode
  THEN
    RAISE EXCEPTION 'refund_preparation_immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER refunds_provider_truth_guard
BEFORE INSERT OR UPDATE OR DELETE ON refunds
FOR EACH ROW EXECUTE FUNCTION sit_guard_refund_provider_truth();

CREATE FUNCTION sit_refund_payment_binding_valid(target_refund_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(bool_and(
    refund.currency = payment.currency
    AND refund.livemode = payment.livemode
    AND refund.provider_charge_id IS NOT NULL
    AND btrim(refund.provider_charge_id) <> ''
    AND refund.provider_charge_id = payment.provider_charge_id
    AND refund.amount_minor <= payment.captured_minor
  ), false)
  FROM refunds AS refund
  JOIN payments AS payment ON payment.id = refund.payment_id
  WHERE refund.id = target_refund_id;
$$;

CREATE FUNCTION sit_refund_local_settlement_ledger_valid(target_refund_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(bool_and(
    ledger.transaction_count = 1
    AND ledger.payment_id = refund.payment_id
    AND ledger.booking_id = payment.booking_id
    AND ledger.refund_id = refund.id
    AND ledger.payout_id IS NULL
    AND ledger.transaction_type = 'payment_refunded'
    AND ledger.currency = refund.currency
    AND ledger.provider_reference = refund.provider_refund_id
    AND ledger.entry_count =
      1 + (refund.owner_share_minor > 0)::int
        + (refund.platform_share_minor > 0)::int
    AND ledger.total_debit_minor = refund.amount_minor
    AND ledger.total_credit_minor = refund.amount_minor
    AND ledger.owner_debit_minor = refund.owner_share_minor
    AND ledger.platform_debit_minor = refund.platform_share_minor
    AND ledger.stripe_credit_minor = refund.amount_minor
    AND ledger.unexpected_entry_count = 0
  ), false)
  FROM refunds AS refund
  JOIN payments AS payment ON payment.id = refund.payment_id
  JOIN bookings AS booking ON booking.id = payment.booking_id
  LEFT JOIN LATERAL (
    SELECT count(*) OVER ()::int AS transaction_count,
           transaction.payment_id, transaction.booking_id,
           transaction.refund_id, transaction.payout_id,
           transaction.transaction_type, transaction.currency,
           transaction.provider_reference,
           entries.entry_count, entries.total_debit_minor,
           entries.total_credit_minor, entries.owner_debit_minor,
           entries.platform_debit_minor, entries.stripe_credit_minor,
           entries.unexpected_entry_count
    FROM ledger_transactions AS transaction
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS entry_count,
             COALESCE(sum(entry.debit_minor), 0)::bigint AS total_debit_minor,
             COALESCE(sum(entry.credit_minor), 0)::bigint AS total_credit_minor,
             COALESCE(sum(entry.debit_minor) FILTER (
               WHERE entry.account_code = 'owner_payable'
                 AND entry.account_owner_id = booking.owner_id
                 AND entry.credit_minor = 0
             ), 0)::bigint AS owner_debit_minor,
             COALESCE(sum(entry.debit_minor) FILTER (
               WHERE entry.account_code = 'platform_revenue'
                 AND entry.account_owner_id IS NULL
                 AND entry.credit_minor = 0
             ), 0)::bigint AS platform_debit_minor,
             COALESCE(sum(entry.credit_minor) FILTER (
               WHERE entry.account_code = 'stripe_clearing'
                 AND entry.account_owner_id IS NULL
                 AND entry.debit_minor = 0
             ), 0)::bigint AS stripe_credit_minor,
             count(*) FILTER (
               WHERE NOT (
                 (entry.account_code = 'owner_payable'
                   AND entry.account_owner_id = booking.owner_id
                   AND entry.debit_minor > 0 AND entry.credit_minor = 0)
                 OR
                 (entry.account_code = 'platform_revenue'
                   AND entry.account_owner_id IS NULL
                   AND entry.debit_minor > 0 AND entry.credit_minor = 0)
                 OR
                 (entry.account_code = 'stripe_clearing'
                   AND entry.account_owner_id IS NULL
                   AND entry.debit_minor = 0 AND entry.credit_minor > 0)
               )
             )::int AS unexpected_entry_count
      FROM ledger_entries AS entry
      WHERE entry.transaction_id = transaction.id
    ) AS entries ON true
    WHERE transaction.refund_id = refund.id
      AND transaction.transaction_type = 'payment_refunded'
  ) AS ledger ON true
  WHERE refund.id = target_refund_id;
$$;

-- One payment-level source of truth for every runtime, owner/staff readback,
-- deletion gate and reconciler. Provider success and local settlement remain
-- deliberately separate: only locally completed canonical rows may contribute
-- to the cached payment refund totals.
CREATE VIEW sit_payment_refund_truth AS
WITH refund_rollup AS (
  SELECT
    payment.id AS payment_id,
    count(refund.id) FILTER (
      WHERE refund.legacy_refund_platform_fee_claim IS NOT NULL
         OR refund.provider_refund_model IS DISTINCT FROM
           'separate_charge_manual_transfer_reversal_v1'
    )::int AS untrusted_refund_count,
    count(refund.id) FILTER (
      WHERE refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND (
          sit_refund_payment_binding_valid(refund.id)
          AND (
          (refund.status IN ('created', 'pending')
            AND refund.provider_refund_id IS NULL
            AND refund.succeeded_at IS NULL
            AND refund.local_settlement_status = 'pending'
            AND refund.local_settled_at IS NULL
            AND refund.local_settlement_error_code IS NULL)
          OR
          (refund.status IN ('failed', 'cancelled')
            AND refund.provider_refund_id IS NULL
            AND refund.succeeded_at IS NULL
            AND refund.local_settlement_status = 'needs_review'
            AND refund.local_settled_at IS NULL
            AND refund.local_settlement_error_code IS NOT NULL
            AND btrim(refund.local_settlement_error_code) <> '')
          OR
          (refund.status = 'succeeded'
            AND refund.provider_refund_id IS NOT NULL
            AND btrim(refund.provider_refund_id) <> ''
            AND refund.succeeded_at IS NOT NULL
            AND refund.failure_code IS NULL
            AND (
              (refund.local_settlement_status = 'pending'
                AND refund.local_settled_at IS NULL
                AND refund.local_settlement_error_code IS NULL)
              OR
              (refund.local_settlement_status = 'needs_review'
                AND refund.local_settled_at IS NULL
                AND refund.local_settlement_error_code IS NOT NULL
                AND btrim(refund.local_settlement_error_code) <> '')
              OR
              (refund.local_settlement_status = 'completed'
                AND refund.local_settled_at IS NOT NULL
                AND refund.local_settlement_error_code IS NULL
                AND sit_refund_local_settlement_ledger_valid(refund.id))
            ))
          )
        ) IS DISTINCT FROM TRUE
    )::int AS invalid_refund_count,
    count(refund.id) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status IN ('created', 'pending')
        AND refund.local_settlement_status = 'pending'
        AND sit_refund_payment_binding_valid(refund.id)
    )::int AS active_refund_count,
    count(refund.id) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status IN ('failed', 'cancelled')
        AND sit_refund_payment_binding_valid(refund.id)
    )::int AS terminal_refund_count,
    count(refund.id) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.provider_observation_status = 'needs_review'
    )::int AS provider_observation_review_count,
    count(refund.id) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status = 'succeeded'
        AND refund.provider_refund_id IS NOT NULL
        AND btrim(refund.provider_refund_id) <> ''
        AND refund.succeeded_at IS NOT NULL
        AND refund.failure_code IS NULL
        AND refund.local_settlement_status = 'pending'
        AND sit_refund_payment_binding_valid(refund.id)
    )::int AS provider_bound_local_pending_count,
    count(refund.id) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status = 'succeeded'
        AND refund.provider_refund_id IS NOT NULL
        AND btrim(refund.provider_refund_id) <> ''
        AND refund.succeeded_at IS NOT NULL
        AND refund.failure_code IS NULL
        AND refund.local_settlement_status = 'needs_review'
        AND sit_refund_payment_binding_valid(refund.id)
    )::int AS provider_bound_local_review_count,
    count(refund.id) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status = 'succeeded'
        AND refund.provider_refund_id IS NOT NULL
        AND btrim(refund.provider_refund_id) <> ''
        AND refund.succeeded_at IS NOT NULL
        AND refund.failure_code IS NULL
        AND refund.local_settlement_status = 'completed'
        AND refund.local_settled_at IS NOT NULL
        AND refund.local_settlement_error_code IS NULL
        AND sit_refund_payment_binding_valid(refund.id)
        AND sit_refund_local_settlement_ledger_valid(refund.id)
    )::int AS settled_refund_count,
    COALESCE(sum(refund.amount_minor) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status = 'succeeded'
        AND refund.provider_refund_id IS NOT NULL
        AND btrim(refund.provider_refund_id) <> ''
        AND refund.succeeded_at IS NOT NULL
        AND refund.failure_code IS NULL
        AND refund.local_settlement_status = 'completed'
        AND refund.local_settled_at IS NOT NULL
        AND refund.local_settlement_error_code IS NULL
        AND sit_refund_payment_binding_valid(refund.id)
        AND sit_refund_local_settlement_ledger_valid(refund.id)
    ), 0)::bigint AS settled_refund_minor,
    COALESCE(sum(refund.owner_share_minor) FILTER (
      WHERE refund.provider_refund_model =
          'separate_charge_manual_transfer_reversal_v1'
        AND refund.legacy_refund_platform_fee_claim IS NULL
        AND refund.status = 'succeeded'
        AND refund.provider_refund_id IS NOT NULL
        AND btrim(refund.provider_refund_id) <> ''
        AND refund.succeeded_at IS NOT NULL
        AND refund.failure_code IS NULL
        AND refund.local_settlement_status = 'completed'
        AND refund.local_settled_at IS NOT NULL
        AND refund.local_settlement_error_code IS NULL
        AND sit_refund_payment_binding_valid(refund.id)
        AND sit_refund_local_settlement_ledger_valid(refund.id)
    ), 0)::bigint AS settled_owner_refund_minor
  FROM payments AS payment
  LEFT JOIN refunds AS refund ON refund.payment_id = payment.id
  GROUP BY payment.id
)
SELECT
  payment.id AS payment_id,
  rollup.untrusted_refund_count,
  rollup.invalid_refund_count,
  rollup.active_refund_count,
  rollup.terminal_refund_count,
  rollup.provider_observation_review_count,
  rollup.provider_bound_local_pending_count,
  rollup.provider_bound_local_review_count,
  rollup.settled_refund_count,
  rollup.settled_refund_minor,
  rollup.settled_owner_refund_minor,
  (rollup.settled_refund_minor <= payment.captured_minor)
    AS settled_refund_within_capture,
  (payment.refunded_minor IS NOT DISTINCT FROM rollup.settled_refund_minor)
    AS refund_cache_matches_settlement,
  (
    (rollup.settled_refund_minor = 0
      AND payment.status NOT IN ('refunded', 'partially_refunded'))
    OR
    (rollup.settled_refund_minor > 0
      AND rollup.settled_refund_minor < payment.captured_minor
      AND payment.status = 'partially_refunded')
    OR
    (rollup.settled_refund_minor = payment.captured_minor
      AND payment.captured_minor > 0
      AND payment.status = 'refunded')
  ) AS refund_status_matches_settlement,
  CASE
    WHEN rollup.untrusted_refund_count > 0
      OR rollup.invalid_refund_count > 0
      OR rollup.terminal_refund_count > 0
      OR rollup.provider_observation_review_count > 0
      OR rollup.provider_bound_local_review_count > 0
      OR rollup.active_refund_count > 1
      OR rollup.provider_bound_local_pending_count > 1
      OR rollup.settled_refund_minor > payment.captured_minor
      OR payment.refunded_minor IS DISTINCT FROM rollup.settled_refund_minor
      OR (rollup.settled_refund_minor = 0
        AND payment.status IN ('refunded', 'partially_refunded'))
      OR (rollup.settled_refund_minor > 0
        AND rollup.settled_refund_minor < payment.captured_minor
        AND payment.status <> 'partially_refunded')
      OR (rollup.settled_refund_minor = payment.captured_minor
        AND payment.captured_minor > 0
        AND payment.status <> 'refunded')
      THEN 'needsReview'
    WHEN rollup.active_refund_count > 0
      OR rollup.provider_bound_local_pending_count > 0
      THEN 'pending'
    WHEN rollup.settled_refund_count > 0 THEN 'providerBound'
    ELSE 'none'
  END AS refund_truth_status
FROM payments AS payment
JOIN refund_rollup AS rollup ON rollup.payment_id = payment.id;
