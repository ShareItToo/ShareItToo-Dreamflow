import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp150CompletedPaymentCommandReplayIntegrity,
} from '../../tool/validate_wp150_completed_payment_command_replay_integrity.mjs';

const evidenceUrl = new URL(
  '../../docs/evidence/release-readiness/wp150-completed-payment-command-replay-integrity-20260914.json',
  import.meta.url,
);
const handoverUrl = new URL(
  '../../docs/operations/WP150_COMPLETED_PAYMENT_COMMAND_REPLAY_INTEGRITY_2026-09-14.md',
  import.meta.url,
);
const workflowUrl = new URL('../../backend/src/payment_workflow.js', import.meta.url);
const appUrl = new URL('../../backend/src/app.js', import.meta.url);
const migrationUrl = new URL(
  '../../backend/sql/migrations/076_payment_command_result_immutability.up.sql',
  import.meta.url,
);
const repositoryRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function fixture() {
  return JSON.parse(readFileSync(evidenceUrl, 'utf8'));
}

test('accepts the exact fail-closed WP150 replay-integrity closure', () => {
  const result = validateWp150CompletedPaymentCommandReplayIntegrity({ evidence: fixture() });
  assert.equal(result.status, 'technical-closure-external-gates-hold');
  assert.equal(result.focusedWp150Tests, 'passed-18-of-18');
  assert.equal(result.fullTechnicalRegression, 'passed');
  assert.equal(result.realMoneyAllowed, false);
});

for (const mutate of [
  (value) => { value.status = 'complete'; },
  (value) => { value.repository.baselineHead = '0'.repeat(40); },
  (value) => { value.invariant.commandBindingExact = false; },
  (value) => { value.invariant.ledgerEntriesBindingExact = false; },
  (value) => { value.invariant.commandTimeSettlementSnapshotExact = false; },
  (value) => { value.invariant.replayHasNoProviderMutation = false; },
  (value) => { value.invariant.replayHasNoFinancialDml = false; },
  (value) => { value.invariant.replayDoesNotWakeNotificationWorker = false; },
  (value) => { value.invariant.freshOrIncompleteExpiredAuthorizationStatus = 200; },
  (value) => { value.verification.refundOwnerBoundRaceReplayProved = false; },
  (value) => { value.verification.checkoutAdvisoryLockK0K1Proved = false; },
  (value) => { value.verification.freshResponseValidationProved = false; },
  (value) => { value.verification.privacyClassificationUnchanged = false; },
  (value) => { value.historicalHashSemantics.hashAuthenticatesPreMigrationProvenance = true; },
  (value) => { value.historicalHashSemantics.legacyCompletedCommandReplayTrusted = true; },
  (value) => { value.technicalDebt.paymentCommandActorForeignKeyHardDeleteCollision.status = 'closed'; },
  (value) => { value.gates.realMoneyAllowed = true; },
  (value) => { value.boundaries.providerRequestPerformed = true; },
]) {
  test('rejects replay, provenance, debt or external-boundary drift', () => {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp150CompletedPaymentCommandReplayIntegrity({ evidence: value }),
      /WP150/u,
    );
  });
}

test('rejects missing, stale or unexpected source inventory entries', () => {
  for (const mutate of [
    (value) => { delete value.sourceInventory['backend/src/payment_workflow.js']; },
    (value) => { value.sourceInventory['backend/src/payment_workflow.js'] = '0'.repeat(64); },
    (value) => { value.sourceInventory['unexpected.js'] = '1'.repeat(64); },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(
      () => validateWp150CompletedPaymentCommandReplayIntegrity({ evidence: value }),
      /WP150/u,
    );
  }
});

test('rejects weakened runtime replay ordering and durable binding', () => {
  const workflow = readFileSync(workflowUrl, 'utf8');
  const app = readFileSync(appUrl, 'utf8');
  const migration = readFileSync(migrationUrl, 'utf8');
  for (const [path, changedSource] of [
    [
      'backend/src/payment_workflow.js',
      workflow.replace(
        'command.completion_integrity_version === 1',
        'command.completion_integrity_version != null',
      ),
    ],
    [
      'backend/src/payment_workflow.js',
      workflow.replace(
        'command.response_payload.payment.refundedMinor === Number(refundedSnapshot)',
        'command.response_payload.payment.refundedMinor >= Number(refundedSnapshot)',
      ),
    ],
    [
      'backend/src/payment_workflow.js',
      workflow.replace(
        'ledgerEntries.length === 0',
        'ledgerEntries.length >= 0',
      ),
    ],
    [
      'backend/src/app.js',
      app.replace(
        'if (!result.replayed) kickNotificationWorker();',
        'kickNotificationWorker();',
      ),
    ],
    [
      'backend/sql/migrations/076_payment_command_result_immutability.up.sql',
      migration.replace(
        'payment_command_completed_result_immutable',
        'payment_command_completed_result_mutable',
      ),
    ],
  ]) {
    assert.throws(
      () => validateWp150CompletedPaymentCommandReplayIntegrity({
        evidence: fixture(),
        sourceTexts: { [path]: changedSource },
      }),
      /WP150/u,
    );
  }
});

test('rejects an incomplete handover or secret-shaped evidence', () => {
  const handover = readFileSync(handoverUrl, 'utf8');
  assert.throws(
    () => validateWp150CompletedPaymentCommandReplayIntegrity({
      evidence: fixture(),
      handover: handover.replace('keine authentische Provenienz', 'verified provenance'),
    }),
    /WP150/u,
  );
  const value = fixture();
  value.privateNote = 'owner@example.invalid';
  assert.throws(
    () => validateWp150CompletedPaymentCommandReplayIntegrity({ evidence: value }),
    /WP150/u,
  );
});
