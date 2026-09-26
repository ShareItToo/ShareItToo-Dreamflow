import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../sql/migrations/023_v52_contract_binding.up.sql', import.meta.url),
  'utf8',
);

test('V5.2 migration keeps V5.1 history and adds all nine snapshot bindings', () => {
  for (const key of [
    'platform_terms',
    'private_rental_terms',
    'cancellation_refund',
    'handover_return_damage',
    'payment_payout',
    'community_safety',
    'reporting_moderation_review',
    'privacy',
    'imprint_withdrawal_shorttexts',
  ]) {
    assert.match(migration, new RegExp(`'${key}'`, 'u'));
  }
  for (const column of [
    'cancellation_refund_snapshot_id',
    'handover_return_damage_snapshot_id',
    'payment_payout_snapshot_id',
    'community_safety_snapshot_id',
    'reporting_moderation_review_snapshot_id',
    'privacy_snapshot_id',
    'imprint_withdrawal_shorttexts_snapshot_id',
  ]) {
    assert.match(migration, new RegExp(`${column} UUID`, 'u'));
  }
  assert.match(migration, /contract_version NOT LIKE 'V5\.2-%'/u);
  assert.match(migration, /sit_acceptance_wording IS NOT NULL/u);
  assert.match(migration, /sit_acceptance_sha256 IS NOT NULL/u);
  assert.doesNotMatch(migration, /UPDATE platform_contracts/u);
  assert.doesNotMatch(migration, /DELETE FROM platform_contracts/u);
});

test('V5.2 declaration evidence stores per-declaration binding metadata', () => {
  for (const column of [
    'user_id',
    'booking_id',
    'document_version',
    'locale',
    'client_build',
    'quote_id',
    'quote_hash',
    'document_references',
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'u'));
  }
  assert.match(
    migration,
    /platform_contract_declarations_contract_id_fkey[\s\S]*DEFERRABLE INITIALLY DEFERRED/u,
  );
  assert.match(migration, /jsonb_array_length\(document_references\) > 0/u);
  assert.match(
    migration,
    /num_nonnulls\([\s\S]*user_id, booking_id, document_version[\s\S]*\) = 0/u,
  );
});

test('explicit SIT acceptance is wording- and hash-bound', () => {
  assert.match(migration, /sit_acceptance_wording TEXT/u);
  assert.match(migration, /sit_acceptance_sha256 TEXT/u);
  assert.match(migration, /sit_acceptance_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/u);
});
