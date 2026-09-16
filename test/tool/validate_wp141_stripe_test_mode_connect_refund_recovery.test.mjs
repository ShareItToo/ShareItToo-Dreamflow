import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { detectHighConfidenceSecretRules } from '../../backend/ops/secret_scan_rules.mjs';
import {
  validateWp141StripeTestModeConnectRefundRecovery,
} from '../../tool/validate_wp141_stripe_test_mode_connect_refund_recovery.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp141-stripe-test-mode-connect-refund-recovery-20260913.json',
);
const readEvidence = () => JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts exact local payout-bound refund recovery evidence', () => {
  const result = validateWp141StripeTestModeConnectRefundRecovery({
    repositoryRoot: root,
    evidence: readEvidence(),
    checkGitState: false,
  });
  assert.equal(result.localRecovery, 'passed');
  assert.equal(result.paymentPattern, 'separate-charges-and-transfers');
  assert.equal(
    result.stripeSandboxRuntime,
    'open-not-configured-staging-remains-memory-only',
  );
  assert.deepEqual(result.portfolio, { pass: 21, partial: 4, open: 7 });
});

test('rejects a duplicate-risk or incomplete immutable recovery contract', () => {
  const changed = readEvidence();
  changed.refundIntegrity.duplicateProviderRefundPrevented = false;
  changed.refundIntegrity.payoutPaymentCompositeBinding = false;
  assert.throws(
    () => validateWp141StripeTestModeConnectRefundRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /refund integrity/u,
  );
});

test('rejects treating ambiguous provider failures as definite rejection', () => {
  const changed = readEvidence();
  changed.refundIntegrity.unstructuredFourHundredRejectedAsDefinite = true;
  changed.refundIntegrity.providerStatusFourHundredEightRejectedAsDefinite = true;
  assert.throws(
    () => validateWp141StripeTestModeConnectRefundRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /refund integrity/u,
  );
});

test('rejects Stripe, money or environment boundary changes', () => {
  const changed = readEvidence();
  changed.boundaries.stripeApiCalled = true;
  changed.boundaries.realMoneyUsed = true;
  assert.throws(
    () => validateWp141StripeTestModeConnectRefundRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /boundary contract|credential-shaped/u,
  );
});

test('rejects credential-shaped evidence material', () => {
  const changed = readEvidence();
  changed.extra = [['pass', 'word'].join(''), 'must-not-appear'].join('=');
  assert.throws(
    () => validateWp141StripeTestModeConnectRefundRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /credential-shaped/u,
  );
});

test('keeps the current sanitizer fixture scanner-clean and reviews only its immutable history', () => {
  const testPath = 'test/tool/validate_wp141_stripe_test_mode_connect_refund_recovery.test.mjs';
  assert.deepEqual(
    detectHighConfidenceSecretRules(
      readFileSync(resolve(root, testPath), 'utf8'),
      testPath,
    ),
    [],
  );
  const baseline = JSON.parse(readFileSync(
    resolve(root, 'backend/ops/secret_scan_history_baseline.json'),
    'utf8',
  ));
  assert.ok(baseline.reviewedFindings.some((entry) => (
    entry.rule === 'static_password_property'
      && entry.source === 'cb0bbd195c99a412bfd3a2118e7ca822c9076224'
      && entry.file === testPath
  )));
});

test('rejects falsely closing the Stripe sandbox end-to-end gate', () => {
  const changed = readEvidence();
  changed.remaining.testPaymentRefundPayoutE2e = 'complete';
  assert.throws(
    () => validateWp141StripeTestModeConnectRefundRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /remaining gates/u,
  );
});
