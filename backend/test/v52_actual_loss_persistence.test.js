import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../sql/migrations/024_v52_actual_loss_resolution.up.sql', import.meta.url),
  'utf8',
);
const workflow = readFileSync(
  new URL('../src/v52_actual_loss_workflow.js', import.meta.url),
  'utf8',
);
const bookingWorkflow = readFileSync(
  new URL('../src/booking_workflow.js', import.meta.url),
  'utf8',
);

test('V5.2 actual-loss evidence and resolution are append-only and quote-bound', () => {
  for (const table of [
    'v52_actual_loss_cases',
    'v52_actual_loss_statements',
    'v52_actual_loss_statement_evidence',
    'v52_actual_loss_resolutions',
    'v52_cancellation_refund_resolution_events',
    'v52_actual_loss_receipts',
    'v52_actual_loss_receipt_events',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'u'));
    assert.match(migration, new RegExp(`'${table}'`, 'u'));
  }
  assert.match(migration, /quote_hash TEXT NOT NULL CHECK \(quote_hash ~/u);
  assert.match(migration, /contract_version TEXT NOT NULL CHECK \(contract_version LIKE 'V5\.2-%'\)/u);
  assert.match(migration, /cancellation_refund_snapshot_id/u);
  assert.match(migration, /BEFORE UPDATE OR DELETE/u);
});

test('participants submit owned evidence while only an admin resolves server-side', () => {
  assert.match(workflow, /actorRole = actor\.id === row\.owner_id/u);
  assert.match(workflow, /owner_id = \$1 AND visibility = 'private'/u);
  assert.match(workflow, /purpose IN \('handover_evidence', 'return_evidence', 'report_evidence'\)/u);
  assert.match(workflow, /if \(actor\.role !== 'admin'\)/u);
  assert.match(workflow, /v52ActualLossAmounts\(/u);
  assert.match(workflow, /liveMoneyExecuted: false/u);
  assert.doesNotMatch(workflow, /refundPayment|releasePayout|createPaymentCheckout/u);
});

test('no-show is owner-asserted after start and 14-day renter withdrawal wins', () => {
  assert.match(bookingWorkflow, /v52_withdrawal_precedes_cancellation/u);
  assert.match(bookingWorkflow, /renter_no_show_owner_required/u);
  assert.match(bookingWorkflow, /renter_no_show_before_start/u);
  assert.match(bookingWorkflow, /cause: cancellationType === 'renter_no_show'/u);
  assert.match(bookingWorkflow, /openV52ActualLossCase/u);
});

test('resolution produces separate debtor events and a hashed durable receipt', () => {
  assert.match(workflow, /row\.rent_refund_obligation_id, 'rent_refund', 'owner'/u);
  assert.match(workflow, /row\.sit_fee_refund_obligation_id, 'sit_fee_refund', 'sit'/u);
  assert.match(workflow, /v52_cancellation_refund_resolution_events/u);
  assert.match(workflow, /v52_actual_loss_receipts/u);
  assert.match(workflow, /X-SIT-Artifact-SHA256|artifactSha256/u);
  assert.match(workflow, /v52_actual_loss_receipt_integrity_failed/u);
});
