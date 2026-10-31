-- A stored row may name an externally executed Stripe reversal. Never erase
-- that durable recovery truth during rollback.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM refund_transfer_reversals) THEN
    RAISE EXCEPTION
      'Refund transfer reversal rollback blocked: durable provider recovery data exists';
  END IF;
END;
$$;

DROP TABLE refund_transfer_reversals;

ALTER TABLE payouts
  DROP CONSTRAINT payouts_refund_payment_binding_unique;
ALTER TABLE refunds
  DROP CONSTRAINT refunds_refund_payment_binding_unique;
