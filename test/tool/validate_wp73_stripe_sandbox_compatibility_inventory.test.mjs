import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp73StripeSandboxCompatibilityInventory,
} from '../../tool/validate_wp73_stripe_sandbox_compatibility_inventory.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp73-stripe-sandbox-compatibility-inventory-20260909.json',
), 'utf8'));
const validatorSource = readFileSync(resolve(
  root,
  'tool/validate_wp73_stripe_sandbox_compatibility_inventory.mjs',
), 'utf8');

function validate(changed = evidence) {
  return validateWp73StripeSandboxCompatibilityInventory({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts the exact read-only WP73 compatibility inventory', () => {
  assert.deepEqual(validate(), {
    status: 'complete-local-github',
    overallVerdict:
      'compatible-after-required-dispute-recovery-correction-and-read-only-provider-verification',
    blockingFinding: 'stripe-dispute-paid-transfer-recovery',
    ownerGate: 'WP73_STRIPE_READONLY_REAUTH_REQUIRED',
    nextLocalPackage: 'WP74',
    providerChanged: false,
  });
});

test('keeps the repository validator independent of installed backend dependencies', () => {
  assert.doesNotMatch(validatorSource, /backend\/node_modules/u);
  assert.match(validatorSource, /backend\/package\.json/u);
});

test('rejects provider-state or credential overclaims', () => {
  const accountRead = structuredClone(evidence);
  accountRead.providerObservation.actualStripeAccountReadPerformed = true;
  assert.throws(() => validate(accountRead), /provider observation/u);

  const credential = structuredClone(evidence);
  credential.boundaries.credentialCreatedReadExtractedOrCommitted = true;
  assert.throws(() => validate(credential), /boundary/u);
});

test('rejects weakened dispute-recovery blocker', () => {
  const allowed = structuredClone(evidence);
  allowed.blockingFinding.providerTrafficAllowedBeforeCorrection = true;
  assert.throws(() => validate(allowed), /blocking finding/u);

  const invented = structuredClone(evidence);
  invented.blockingFinding.alreadyPaidTransferAutomaticallyRecoveredOnDispute = true;
  assert.throws(() => validate(invented), /blocking finding/u);
});

test('rejects Accounts v2 or owner-gate drift', () => {
  const account = structuredClone(evidence);
  account.compatibility.accountsV2.lossesCollector = 'stripe';
  assert.throws(() => validate(account), /Accounts v2 verdict/u);

  const gate = structuredClone(evidence);
  gate.ownerGate.doesNotAuthorizeProviderTraffic = false;
  assert.throws(() => validate(gate), /owner gate/u);
});

test('rejects source drift and private or secret-shaped values', () => {
  const source = structuredClone(evidence);
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source hash drift/u);

  const secret = structuredClone(evidence);
  secret.note = 'whsec_should_never_be_here';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});

test('rejects incomplete verification closure', () => {
  const changed = structuredClone(evidence);
  changed.verification.githubRegressionRun = null;
  assert.throws(() => validate(changed), /complete verification/u);
});
