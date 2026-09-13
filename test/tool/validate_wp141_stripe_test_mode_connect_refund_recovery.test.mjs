import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

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

test('rejects Stripe, money, environment or credential boundary changes', () => {
  const changed = readEvidence();
  changed.boundaries.stripeApiCalled = true;
  changed.boundaries.realMoneyUsed = true;
  changed.extra = { password: 'must-not-appear' };
  assert.throws(
    () => validateWp141StripeTestModeConnectRefundRecovery({
      repositoryRoot: root,
      evidence: changed,
      checkGitState: false,
    }),
    /boundary contract|credential-shaped/u,
  );
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
