import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const app = read('backend/src/app.js');
const workflow = read('backend/src/v52_actual_loss_workflow.js');
const privacyExport = read('backend/src/privacy_export.js');
const retention = read('backend/src/retention_inventory.js');
const repository = read('lib/services/backend_repository.dart');
const bookingDetail = read('lib/screens/booking_detail_screen.dart');
const withdrawal = read('lib/screens/platform_withdrawal_screen.dart');
const gate = read('scripts/technical_regression_check.sh');

test('actual-loss APIs separate participant evidence from step-up admin resolution', () => {
  assert.match(app, /\/v1\/bookings\/:id\/actual-loss\/statements[\s\S]*requireUnsuspendedScope\('booking'\)/u);
  assert.match(app, /\/v1\/admin\/bookings\/:id\/actual-loss\/resolve[\s\S]*requireStaffElevation/u);
  assert.match(workflow, /v52_actual_loss_evidence_not_owned/u);
  assert.match(workflow, /if \(actor\.role !== 'admin'\)/u);
});

test('client can rediscover and integrity-check both durable C1E receipts', () => {
  assert.match(repository, /getActualLossCase/u);
  assert.match(repository, /recordActualLossStatement/u);
  assert.match(repository, /downloadActualLossReceipt/u);
  assert.match(bookingDetail, /v52_actual_loss_receipt_integrity_failed/u);
  assert.match(bookingDetail, /Stornoabrechnung herunterladen/u);
  assert.match(withdrawal, /v51_withdrawal_receipt_integrity_failed/u);
  assert.match(withdrawal, /dart_crypto\.sha256\.convert\(downloaded\.bytes\)/u);
  assert.match(withdrawal, /initialBookingId/u);
  assert.match(bookingDetail, /_v52WithdrawalWindowOpen/u);
  assert.match(bookingDetail, /PlatformWithdrawalScreen\([\s\S]*initialBookingId/u);
});

test('actual-loss personal data is exported and retention-inventoried', () => {
  for (const dataset of [
    'v52_actual_loss_cases',
    'v52_actual_loss_statements',
    'v52_actual_loss_resolutions',
    'v52_cancellation_refund_resolution_events',
    'v52_actual_loss_receipts',
    'v52_actual_loss_receipt_events',
  ]) {
    assert.match(privacyExport, new RegExp(dataset, 'u'));
    assert.match(retention, new RegExp(`'transactions', '${dataset}'`, 'u'));
  }
  assert.match(retention, /'handoverEvidence', 'v52_actual_loss_statement_evidence'/u);
});

test('permanent regression gate runs the C1E contract', () => {
  assert.match(
    gate,
    /node --test test\/tool\/v52_actual_loss_wiring\.test\.mjs/u,
  );
});
