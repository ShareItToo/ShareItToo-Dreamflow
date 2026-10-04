import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const up = read('../sql/migrations/076_payment_command_result_immutability.up.sql');
const down = read('../sql/migrations/076_payment_command_result_immutability.down.sql');

test('migration aborts malformed historical completion claims before backfill', () => {
  const historicalGuardAt = up.indexOf('payment_command_historical_completion_malformed');
  const columnAt = up.indexOf('ADD COLUMN response_payload_sha256');
  const backfillAt = up.indexOf('UPDATE payment_commands');

  assert.match(up, /LOCK TABLE payment_commands IN ACCESS EXCLUSIVE MODE/u);
  assert.match(
    up,
    /\(completed_at IS NULL\) <> \(response_payload IS NULL\)/u,
  );
  assert.match(
    up,
    /completed_at IS NOT NULL[\s\S]*jsonb_typeof\(response_payload\) IS DISTINCT FROM 'object'/u,
  );
  assert.ok(historicalGuardAt >= 0);
  assert.ok(historicalGuardAt < columnAt);
  assert.ok(columnAt < backfillAt);

  const backfill = up.match(/UPDATE payment_commands[\s\S]*?;/u)?.[0] ?? '';
  assert.match(
    backfill,
    /SET response_payload_sha256 = encode\([\s\S]*digest\(response_payload::text, 'sha256'\)[\s\S]*'hex'/u,
  );
  assert.match(backfill, /WHERE completed_at IS NOT NULL/u);
  assert.match(backfill, /jsonb_typeof\(response_payload\) = 'object'/u);
  assert.doesNotMatch(backfill, /SET\s+(?:completed_at|response_payload)\s*=/u);
  assert.doesNotMatch(backfill, /completion_integrity_version\s*=/u);
});

test('completion state constrains null parity, response objects, and exact hashes', () => {
  assert.match(up, /ADD CONSTRAINT payment_commands_result_null_parity CHECK/u);
  assert.match(
    up,
    /completed_at IS NULL[\s\S]*response_payload IS NULL[\s\S]*response_payload_sha256 IS NULL[\s\S]*completed_at IS NOT NULL[\s\S]*response_payload IS NOT NULL[\s\S]*response_payload_sha256 IS NOT NULL/u,
  );
  assert.match(
    up,
    /ADD CONSTRAINT payment_commands_result_object CHECK \([\s\S]*jsonb_typeof\(response_payload\) = 'object'/u,
  );
  assert.match(
    up,
    /ADD CONSTRAINT payment_commands_result_hash CHECK \([\s\S]*response_payload_sha256 = encode\([\s\S]*digest\(response_payload::text, 'sha256'\)/u,
  );
  assert.match(up, /ADD COLUMN completion_integrity_version SMALLINT/u);
  assert.match(up, /ADD COLUMN settlement_refunded_minor BIGINT/u);
  assert.match(up, /ADD COLUMN settlement_transferred_minor BIGINT/u);
  assert.match(
    up,
    /payment_commands_completion_integrity_version CHECK \([\s\S]*completion_integrity_version IS NULL OR completion_integrity_version = 1/u,
  );
  assert.match(
    up,
    /payment_commands_settlement_snapshot CHECK \([\s\S]*command_type IN \('payment\.refund', 'payment\.release'\)[\s\S]*settlement_refunded_minor IS NOT NULL[\s\S]*settlement_refunded_minor >= 0[\s\S]*settlement_transferred_minor IS NOT NULL[\s\S]*settlement_transferred_minor >= 0/u,
  );
});

test('trigger permits one guarded completion and freezes every replay binding', () => {
  assert.match(
    up,
    /BEFORE INSERT OR UPDATE OR DELETE ON payment_commands/u,
  );
  assert.match(
    up,
    /TG_OP = 'INSERT'[\s\S]*payment_command_direct_completion_forbidden/u,
  );
  assert.match(
    up,
    /TG_OP = 'DELETE'[\s\S]*OLD\.completed_at IS NOT NULL[\s\S]*payment_command_completed_deletion_forbidden/u,
  );

  for (const field of [
    'idempotency_key',
    'command_type',
    'actor_id',
    'booking_id',
    'request_hash',
    'created_at',
  ]) {
    assert.match(up, new RegExp(`NEW\\.${field}`, 'u'));
    assert.match(up, new RegExp(`OLD\\.${field}`, 'u'));
  }
  assert.match(up, /payment_command_identity_immutable/u);

  assert.match(up, /NEW\.payment_id IS DISTINCT FROM OLD\.payment_id/u);
  assert.match(
    up,
    /OLD\.payment_id IS NOT NULL[\s\S]*NEW\.payment_id IS NULL[\s\S]*OLD\.completed_at IS NOT NULL[\s\S]*NEW\.completed_at IS NOT NULL[\s\S]*payment_command_payment_binding_immutable/u,
  );
  assert.match(
    up,
    /OLD\.completed_at IS NOT NULL[\s\S]*NEW\.response_payload[\s\S]*NEW\.completed_at[\s\S]*NEW\.response_payload_sha256[\s\S]*NEW\.completion_integrity_version[\s\S]*NEW\.settlement_refunded_minor[\s\S]*NEW\.settlement_transferred_minor[\s\S]*payment_command_completed_result_immutable/u,
  );
  assert.match(up, /payment_command_completion_integrity_version_invalid/u);
  assert.match(up, /payment_command_settlement_snapshot_invalid/u);
  assert.match(up, /payment_command_settlement_snapshot_unexpected/u);
  assert.match(
    up,
    /expected_response_payload_sha256 := encode\([\s\S]*digest\(NEW\.response_payload::text, 'sha256'\)[\s\S]*NEW\.response_payload_sha256 := expected_response_payload_sha256/u,
  );
  assert.match(up, /payment_command_completion_hash_invalid/u);
});

test('down migration removes only the added guards and hash column', () => {
  for (const name of [
    'payment_commands_result_immutability_guard',
    'sit_guard_payment_command_result_immutability',
    'payment_commands_result_hash',
    'payment_commands_completion_integrity_version',
    'payment_commands_settlement_snapshot',
    'payment_commands_result_object',
    'payment_commands_result_null_parity',
    'settlement_transferred_minor',
    'settlement_refunded_minor',
    'completion_integrity_version',
    'response_payload_sha256',
  ]) {
    assert.match(down, new RegExp(name, 'u'));
  }

  assert.doesNotMatch(down, /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+payment_commands)\b/iu);
});
