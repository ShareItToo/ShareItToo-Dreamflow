-- A post-WP151 refund has no value for the old ambiguous Boolean. Recreating
-- one would fabricate financial history, so rollback is allowed only when all
-- rows predate this migration and their exact legacy values remain available.

LOCK TABLE refunds IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM refunds
    WHERE legacy_refund_platform_fee_claim IS NULL
       OR provider_refund_model IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Refund provider truth rollback blocked: post-migration refunds exist';
  END IF;
END;
$$;

DROP VIEW IF EXISTS sit_payment_refund_truth;
DROP FUNCTION IF EXISTS sit_refund_local_settlement_ledger_valid(UUID);
DROP FUNCTION IF EXISTS sit_refund_payment_binding_valid(UUID);
DROP TRIGGER IF EXISTS refunds_provider_truth_guard ON refunds;
DROP FUNCTION IF EXISTS sit_guard_refund_provider_truth();

ALTER TABLE refunds
  DROP CONSTRAINT refunds_provider_refund_model_check,
  DROP CONSTRAINT refunds_local_settlement_status_check,
  DROP COLUMN provider_refund_model,
  DROP COLUMN local_settlement_status,
  DROP COLUMN local_settled_at,
  DROP COLUMN local_settlement_error_code,
  DROP COLUMN provider_observation_status,
  DROP COLUMN provider_observation_reference,
  DROP COLUMN provider_observation_error_code,
  DROP COLUMN provider_observed_at;

ALTER TABLE refunds
  RENAME COLUMN legacy_refund_platform_fee_claim TO refund_platform_fee;

ALTER TABLE refunds
  ALTER COLUMN refund_platform_fee SET DEFAULT true,
  ALTER COLUMN refund_platform_fee SET NOT NULL;
