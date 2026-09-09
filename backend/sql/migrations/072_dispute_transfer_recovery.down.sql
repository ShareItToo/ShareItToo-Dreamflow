DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM dispute_transfer_recoveries) THEN
    RAISE EXCEPTION
      'Dispute transfer recovery rollback blocked: durable recovery history exists';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS dispute_transfer_recoveries_set_updated_at
  ON dispute_transfer_recoveries;
DROP TABLE dispute_transfer_recoveries;

DROP INDEX disputes_payment_provider_idx;

ALTER TABLE disputes
  DROP COLUMN transfer_recovery_issue_code,
  DROP COLUMN transfer_recovery_needs_review,
  DROP COLUMN transfer_recovery_state,
  DROP COLUMN provider_funds_reinstated_event_id,
  DROP COLUMN provider_funds_reinstated_at,
  DROP COLUMN provider_funds_withdrawn_event_id,
  DROP COLUMN provider_funds_withdrawn_at,
  DROP COLUMN provider_disputed_amount_minor,
  DROP COLUMN payment_id;

ALTER TABLE ledger_transactions
  DROP CONSTRAINT ledger_transactions_transaction_type_check;
ALTER TABLE ledger_transactions
  ADD CONSTRAINT ledger_transactions_transaction_type_check CHECK (
    transaction_type IN (
      'payment_captured', 'payment_refunded', 'owner_transfer',
      'owner_transfer_reversed', 'deposit_charged', 'chargeback',
      'chargeback_reversed'
    )
  );
