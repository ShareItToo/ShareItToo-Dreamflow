-- Launch product truth: ShareItToo offers neither a security deposit nor a
-- protection/insurance product. Legacy columns remain only for schema
-- compatibility and are constrained to their neutral values.

UPDATE listings
SET security_deposit_minor = NULL,
    protection_model = 'none',
    payload = jsonb_set(
      jsonb_set(payload, '{deposit}', 'null'::jsonb, true),
      '{protectionModel}',
      '"none"'::jsonb,
      true
    );

UPDATE bookings
SET security_deposit_minor = 0;

UPDATE payments
SET security_deposit_minor = 0;

UPDATE deposit_mandates
SET status = 'revoked'
WHERE status IN ('created', 'requires_action', 'active');

UPDATE deposit_charges
SET status = 'failed',
    failure_code = COALESCE(failure_code, 'launch_deposit_disabled')
WHERE status IN ('created', 'requires_action');

-- A legacy client does not send the catalog projection columns. Its insert
-- must still inherit the neutral launch product instead of the former
-- protection default.
ALTER TABLE listings
  ALTER COLUMN protection_model SET DEFAULT 'none';

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_launch_no_deposit_check,
  DROP CONSTRAINT IF EXISTS listings_launch_no_protection_check,
  ADD CONSTRAINT listings_launch_no_deposit_check
    CHECK (
      security_deposit_minor IS NULL
      AND ((payload->'deposit') IS NULL OR payload->'deposit' = 'null'::jsonb)
    ) NOT VALID,
  ADD CONSTRAINT listings_launch_no_protection_check
    CHECK (
      protection_model = 'none'
      AND COALESCE(payload->>'protectionModel', 'none') = 'none'
    ) NOT VALID;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_launch_no_deposit_check,
  ADD CONSTRAINT bookings_launch_no_deposit_check
    CHECK (security_deposit_minor = 0) NOT VALID;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_launch_no_deposit_check,
  ADD CONSTRAINT payments_launch_no_deposit_check
    CHECK (security_deposit_minor = 0) NOT VALID;

ALTER TABLE deposit_mandates
  DROP CONSTRAINT IF EXISTS deposit_mandates_launch_disabled_check,
  ADD CONSTRAINT deposit_mandates_launch_disabled_check
    CHECK (status IN ('revoked', 'failed', 'expired')) NOT VALID;

ALTER TABLE deposit_charges
  DROP CONSTRAINT IF EXISTS deposit_charges_launch_disabled_check,
  ADD CONSTRAINT deposit_charges_launch_disabled_check
    CHECK (status NOT IN ('created', 'requires_action')) NOT VALID;

ALTER TABLE listings VALIDATE CONSTRAINT listings_launch_no_deposit_check;
ALTER TABLE listings VALIDATE CONSTRAINT listings_launch_no_protection_check;
ALTER TABLE bookings VALIDATE CONSTRAINT bookings_launch_no_deposit_check;
ALTER TABLE payments VALIDATE CONSTRAINT payments_launch_no_deposit_check;
ALTER TABLE deposit_mandates VALIDATE CONSTRAINT deposit_mandates_launch_disabled_check;
ALTER TABLE deposit_charges VALIDATE CONSTRAINT deposit_charges_launch_disabled_check;

-- Preserve historical rows for audit/refund evidence, but reject every new
-- entry into the retired deposit flow even when a future code path bypasses
-- the public API layer.
CREATE OR REPLACE FUNCTION sit_reject_retired_deposit_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ShareItToo deposit flow is retired for launch'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS deposit_mandates_launch_insert_block ON deposit_mandates;
CREATE TRIGGER deposit_mandates_launch_insert_block
BEFORE INSERT ON deposit_mandates
FOR EACH ROW EXECUTE FUNCTION sit_reject_retired_deposit_write();

DROP TRIGGER IF EXISTS deposit_mandates_launch_update_block ON deposit_mandates;
CREATE TRIGGER deposit_mandates_launch_update_block
BEFORE UPDATE ON deposit_mandates
FOR EACH ROW EXECUTE FUNCTION sit_reject_retired_deposit_write();

DROP TRIGGER IF EXISTS deposit_charges_launch_insert_block ON deposit_charges;
CREATE TRIGGER deposit_charges_launch_insert_block
BEFORE INSERT ON deposit_charges
FOR EACH ROW EXECUTE FUNCTION sit_reject_retired_deposit_write();

DROP TRIGGER IF EXISTS deposit_charges_launch_update_block ON deposit_charges;
CREATE TRIGGER deposit_charges_launch_update_block
BEFORE UPDATE ON deposit_charges
FOR EACH ROW EXECUTE FUNCTION sit_reject_retired_deposit_write();

DROP TRIGGER IF EXISTS payment_commands_launch_deposit_insert_block ON payment_commands;
CREATE TRIGGER payment_commands_launch_deposit_insert_block
BEFORE INSERT OR UPDATE OF command_type ON payment_commands
FOR EACH ROW
WHEN (NEW.command_type IN ('deposit.setup', 'deposit.charge'))
EXECUTE FUNCTION sit_reject_retired_deposit_write();

DROP TRIGGER IF EXISTS ledger_transactions_launch_deposit_insert_block ON ledger_transactions;
CREATE TRIGGER ledger_transactions_launch_deposit_insert_block
BEFORE INSERT OR UPDATE OF transaction_type ON ledger_transactions
FOR EACH ROW
WHEN (NEW.transaction_type = 'deposit_charged')
EXECUTE FUNCTION sit_reject_retired_deposit_write();

DROP TRIGGER IF EXISTS ledger_entries_launch_deposit_insert_block ON ledger_entries;
CREATE TRIGGER ledger_entries_launch_deposit_insert_block
BEFORE INSERT OR UPDATE OF account_code ON ledger_entries
FOR EACH ROW
WHEN (NEW.account_code = 'deposit_hold')
EXECUTE FUNCTION sit_reject_retired_deposit_write();
