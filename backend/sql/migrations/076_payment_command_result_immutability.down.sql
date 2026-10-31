DROP TRIGGER IF EXISTS payment_commands_result_immutability_guard
  ON payment_commands;

DROP FUNCTION IF EXISTS sit_guard_payment_command_result_immutability();

ALTER TABLE payment_commands
  DROP CONSTRAINT IF EXISTS payment_commands_settlement_snapshot,
  DROP CONSTRAINT IF EXISTS payment_commands_completion_integrity_version,
  DROP CONSTRAINT IF EXISTS payment_commands_result_hash,
  DROP CONSTRAINT IF EXISTS payment_commands_result_object,
  DROP CONSTRAINT IF EXISTS payment_commands_result_null_parity,
  DROP COLUMN IF EXISTS settlement_transferred_minor,
  DROP COLUMN IF EXISTS settlement_refunded_minor,
  DROP COLUMN IF EXISTS completion_integrity_version,
  DROP COLUMN IF EXISTS response_payload_sha256;
