DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM stripe_connect_accounts
    WHERE account_api_version = 'v2'
  ) THEN
    RAISE EXCEPTION
      'Stripe Accounts v2 rollback blocked: v2 connected accounts exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS stripe_connect_accounts_v2_ready_idx;

ALTER TABLE stripe_connect_accounts
  DROP COLUMN IF EXISTS future_requirements,
  DROP COLUMN IF EXISTS recipient_transfers_status,
  DROP COLUMN IF EXISTS losses_collector,
  DROP COLUMN IF EXISTS fees_collector,
  DROP COLUMN IF EXISTS dashboard_type,
  DROP COLUMN IF EXISTS account_api_version;
