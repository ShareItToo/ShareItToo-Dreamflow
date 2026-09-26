import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../sql/migrations/015_v51_contract_persistence.up.sql', import.meta.url),
  'utf8',
);
const receiptMigration = readFileSync(
  new URL('../sql/migrations/017_v51_contract_receipts.up.sql', import.meta.url),
  'utf8',
);
const withdrawalMigration = readFileSync(
  new URL('../sql/migrations/018_v51_withdrawal_and_refund_obligations.up.sql', import.meta.url),
  'utf8',
);
const privacyExport = readFileSync(
  new URL('../src/privacy_export.js', import.meta.url),
  'utf8',
);
const retentionInventory = readFileSync(
  new URL('../src/retention_inventory.js', import.meta.url),
  'utf8',
);

test('V5.1 contract evidence is separated into immutable snapshots, acceptances and receipts', () => {
  for (const table of [
    'legal_document_snapshots',
    'platform_contracts',
    'platform_contract_declarations',
    'platform_contract_receipt_events',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'u'));
    assert.match(
      migration,
      new RegExp(`CREATE TRIGGER ${table}_append_only[\\s\\S]*?ON ${table}`, 'u'),
    );
  }
  assert.doesNotMatch(
    migration,
    /CREATE OR REPLACE FUNCTION sit_reject_append_only_mutation/u,
  );
});

test('legal snapshots and every accepted wording are hash-bound', () => {
  assert.match(migration, /content_sha256 TEXT NOT NULL CHECK \(content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migration, /wording_sha256 TEXT NOT NULL CHECK \(wording_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migration, /artifact_sha256 TEXT NOT NULL CHECK \(artifact_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migration, /UNIQUE \(document_key, document_version, locale, content_sha256\)/u);
});

test('a platform contract is bound to one user, booking, quote and both document snapshots', () => {
  assert.match(migration, /user_id TEXT NOT NULL REFERENCES users\(id\) ON DELETE RESTRICT/u);
  assert.match(
    migration,
    /booking_id TEXT NOT NULL UNIQUE[\s\S]*REFERENCES bookings\(id\) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED/u,
  );
  assert.match(migration, /quote_id TEXT NOT NULL/u);
  assert.match(migration, /quote_hash TEXT NOT NULL CHECK \(quote_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/u);
  assert.match(migration, /platform_terms_snapshot_id UUID NOT NULL/u);
  assert.match(migration, /private_rental_terms_snapshot_id UUID NOT NULL/u);
  assert.match(migration, /client_build TEXT NOT NULL/u);
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/u);
});

test('exactly the two V5.1 checkout declarations are accepted', () => {
  assert.match(migration, /'private_terms_and_platform_terms'/u);
  assert.match(migration, /'early_performance_and_withdrawal'/u);
  assert.match(migration, /UNIQUE \(contract_id, declaration_type\)/u);
  assert.doesNotMatch(migration, /'binding_booking_request'/u);
  assert.doesNotMatch(migration, /'withdrawal_knowledge'/u);
});

test('receipt evidence is token-free, hash-bound and idempotent', () => {
  assert.match(migration, /recipient_hash TEXT CHECK/u);
  assert.match(migration, /recipient_hash ~ '\^\[0-9a-f\]\{64\}\$'/u);
  assert.doesNotMatch(migration, /recipient_email/u);
  assert.match(migration, /delivery_channel IN \('email', 'in_app', 'download'\)/u);
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/u);
});

test('the durable receipt artifact is immutable, hash-bound and contract-bound', () => {
  assert.match(receiptMigration, /CREATE TABLE IF NOT EXISTS platform_contract_receipts/u);
  assert.match(receiptMigration, /contract_id UUID NOT NULL UNIQUE/u);
  assert.match(receiptMigration, /content_html TEXT NOT NULL/u);
  assert.match(receiptMigration, /artifact_sha256 TEXT NOT NULL/u);
  assert.match(receiptMigration, /idempotency_key TEXT NOT NULL UNIQUE/u);
  assert.match(
    receiptMigration,
    /CREATE TRIGGER platform_contract_receipts_append_only[\s\S]*ON platform_contract_receipts/u,
  );
});

test('contract evidence is visible in the user export and retention inventory', () => {
  assert.match(privacyExport, /WHERE contract\.user_id = \$1 ORDER BY contract\.accepted_at/u);
  assert.match(privacyExport, /platformContractDeclarations/u);
  assert.match(privacyExport, /platformContractReceiptEvents/u);
  for (const dataset of [
    'legal_document_snapshots',
    'platform_contracts',
    'platform_contract_declarations',
    'platform_contract_receipts',
    'platform_contract_receipt_events',
  ]) {
    assert.match(retentionInventory, new RegExp(`'transactions', '${dataset}'`, 'u'));
  }
});

test('V5.1 withdrawals store immutable receipt and separate debtor obligations', () => {
  for (const table of [
    'v51_withdrawals',
    'v51_refund_obligations',
    'v51_refund_obligation_events',
    'v51_cancellation_refund_obligations',
    'v51_withdrawal_receipts',
    'v51_withdrawal_receipt_events',
  ]) {
    assert.match(withdrawalMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'u'));
    assert.match(
      withdrawalMigration,
      new RegExp(`CREATE TRIGGER ${table}_append_only[\\s\\S]*?ON ${table}`, 'u'),
    );
  }
  assert.match(withdrawalMigration, /refund_type IN \('rent_refund', 'sit_fee_refund'\)/u);
  assert.match(withdrawalMigration, /refund_type = 'rent_refund' AND debtor_role = 'owner'/u);
  assert.match(withdrawalMigration, /refund_type = 'sit_fee_refund' AND debtor_role = 'sit'/u);
  assert.match(withdrawalMigration, /'withdrawalReturnRequired'/u);
  assert.match(withdrawalMigration, /'automatic_14_day'/u);
  assert.match(withdrawalMigration, /'manual_review_required'/u);
  assert.match(withdrawalMigration, /v51_withdrawals_one_booking_contract_idx/u);
});

test('withdrawal evidence is user-exported and retention-inventoried', () => {
  for (const name of [
    'withdrawals',
    'withdrawalRefundObligations',
    'withdrawalRefundObligationEvents',
    'cancellationRefundObligations',
    'withdrawalReceipts',
    'withdrawalReceiptEvents',
  ]) {
    assert.match(privacyExport, new RegExp(name, 'u'));
  }
  for (const dataset of [
    'v51_withdrawals',
    'v51_refund_obligations',
    'v51_refund_obligation_events',
    'v51_cancellation_refund_obligations',
    'v51_withdrawal_receipts',
    'v51_withdrawal_receipt_events',
  ]) {
    assert.match(retentionInventory, new RegExp(`'transactions', '${dataset}'`, 'u'));
  }
});
