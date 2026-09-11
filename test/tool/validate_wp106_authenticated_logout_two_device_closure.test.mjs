import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

import { validateWp106AuthenticatedLogoutTwoDeviceClosure } from '../../tool/validate_wp106_authenticated_logout_two_device_closure.mjs';

const evidence = JSON.parse(readFileSync(resolve('docs/evidence/release-readiness/wp106-authenticated-logout-two-device-closure-20260911.json'), 'utf8'));
const candidate = JSON.parse(readFileSync(resolve('store/google-play/current-rollover-candidate.json'), 'utf8'));

test('WP106 accepts the Pixel closure while keeping the OnePlus blocker explicit', () => {
  assert.deepEqual(validateWp106AuthenticatedLogoutTwoDeviceClosure(evidence, candidate), {
    status: 'passed-wp106-pixel-closure-and-explicit-oneplus-blocker-evidence',
    artifactSourceHead: '67c4e2ebe4ceead7529c4f02ca1209d71c66fe25',
    versionCode: '2026091101',
    containsPrivateState: false
  });
});

test('WP106 rejects an unproved OnePlus journey', () => {
  const changed = structuredClone(evidence);
  changed.onePlus.journeyPerformed = true;
  assert.throws(() => validateWp106AuthenticatedLogoutTwoDeviceClosure(changed, candidate), /OnePlus journey truth is not exact/u);
});

test('WP106 rejects weakening the payment boundary', () => {
  const changed = structuredClone(evidence);
  changed.boundaries.paymentEndpointCalled = true;
  assert.throws(() => validateWp106AuthenticatedLogoutTwoDeviceClosure(changed, candidate), /boundary paymentEndpointCalled is not exact/u);
});

test('WP106 rejects candidate-pointer hash drift', () => {
  const changed = structuredClone(candidate);
  changed.artifact.apkSha256 = '0'.repeat(64);
  assert.throws(() => validateWp106AuthenticatedLogoutTwoDeviceClosure(evidence, changed), /candidate pointer APK hash is not exact/u);
});

test('WP106 rejects relabelling degraded Staging readiness as healthy', () => {
  const changed = structuredClone(evidence);
  changed.stagingReadbackAfterJourney.readinessClaimedHealthy = true;
  assert.throws(() => validateWp106AuthenticatedLogoutTwoDeviceClosure(changed, candidate), /Staging readiness truth is not exact/u);
});
