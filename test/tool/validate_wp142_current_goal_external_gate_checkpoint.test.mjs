import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateWp142CurrentGoalExternalGateCheckpoint,
} from '../../tool/validate_wp142_current_goal_external_gate_checkpoint.mjs';

const evidence = JSON.parse(readFileSync(new URL(
  '../../docs/evidence/release-readiness/wp142-current-goal-external-gate-checkpoint-20260913.json',
  import.meta.url,
), 'utf8'));
const clone = () => structuredClone(evidence);
const validate = (value) => validateWp142CurrentGoalExternalGateCheckpoint({
  evidence: value,
  checkGitState: false,
});

test('WP142 accepts the exact current Pixel, Staging and 21/4/7 checkpoint', () => {
  assert.deepEqual(validate(clone()), {
    status: 'passed-current-candidate-and-staging-readiness-external-owner-gates-only',
    pass: 21,
    partial: 4,
    open: 7,
    versionCode: '2026091312',
    backendCommit: 'df39a14b7a19afe467842461a28f1e77fec8445e',
  });
});

test('WP142 rejects an unproved gate promotion', () => {
  const value = clone();
  value.requirements.find((entry) => entry.id === 'stripe-sandbox-payment-refund-simulated-payout').state = 'PASS';
  assert.throws(() => validate(value), /requirement stripe-sandbox/u);
});

test('WP142 rejects provider, Pixel, Staging or private-vault overstatement', () => {
  for (const mutate of [
    (value) => { value.stripePreflight.authenticatedProviderIdentityVerified = true; },
    (value) => { value.freshPixelReadback.installedApkHashMatched = false; },
    (value) => { value.freshStagingReadback.paymentTransport = 'stripe'; },
    (value) => { value.privateQaVault.unsafeEntryCountAfterCorrection = 1; },
    (value) => { value.boundaries.providerTrafficPerformed = true; },
  ]) {
    const value = clone();
    mutate(value);
    assert.throws(() => validate(value), /WP142/u);
  }
});
