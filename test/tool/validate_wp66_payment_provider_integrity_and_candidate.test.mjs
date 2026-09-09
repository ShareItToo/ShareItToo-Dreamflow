import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateWp66PaymentProviderIntegrityAndCandidate,
} from '../../tool/validate_wp66_payment_provider_integrity_and_candidate.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const evidenceFixture = JSON.parse(readFileSync(resolve(root,
  'docs/evidence/release-readiness/wp66-payment-provider-integrity-and-candidate-20260909.json'), 'utf8'));
const candidateFixture = JSON.parse(readFileSync(resolve(root,
  'store/google-play/current-rollover-candidate.json'), 'utf8'));
const supersededFixture = JSON.parse(readFileSync(resolve(root,
  'store/google-play/rollover-candidate-2026090903.json'), 'utf8'));

function fixtures() {
  return {
    evidence: structuredClone(evidenceFixture),
    candidate: structuredClone(candidateFixture),
    superseded: structuredClone(supersededFixture),
  };
}

test('accepts the exact local WP66 provider-integrity candidate closure', () => {
  const result = validateWp66PaymentProviderIntegrityAndCandidate(fixtures());
  assert.equal(result.versionCode, '2026090904');
  assert.equal(result.localComplete, true);
  assert.equal(result.githubPending, true);
});

test('rejects candidate identity or artifact drift', () => {
  const input = fixtures();
  input.candidate.artifact.aabSha256 = '0'.repeat(64);
  assert.throws(
    () => validateWp66PaymentProviderIntegrityAndCandidate(input),
    /artifact\.aabSha256 has drifted/u,
  );
});

test('rejects a second-payment or loose-event-binding claim', () => {
  const secondPayment = fixtures();
  secondPayment.evidence.providerIntegrity.secondPaymentPermittedDuringUncertainReconciliation = true;
  assert.throws(
    () => validateWp66PaymentProviderIntegrityAndCandidate(secondPayment),
    /secondPaymentPermittedDuringUncertainReconciliation has drifted/u,
  );
  const looseBinding = fixtures();
  looseBinding.evidence.providerIntegrity.providerEventRequiresExactPaymentBookingCustomerObjectAndModeBinding = false;
  assert.throws(
    () => validateWp66PaymentProviderIntegrityAndCandidate(looseBinding),
    /providerEventRequiresExactPaymentBookingCustomerObjectAndModeBinding has drifted/u,
  );
});

test('keeps the discarded 2026090903 candidate permanently non-uploadable', () => {
  const input = fixtures();
  input.superseded.supersession.uploadAllowed = true;
  assert.throws(
    () => validateWp66PaymentProviderIntegrityAndCandidate(input),
    /superseded\.supersession\.uploadAllowed has drifted/u,
  );
});

test('rejects private identity or path material in evidence', () => {
  const input = fixtures();
  input.evidence.ownerPath = '/Users/example/private';
  assert.throws(
    () => validateWp66PaymentProviderIntegrityAndCandidate(input),
    /private path, identity or credential marker/u,
  );
});
