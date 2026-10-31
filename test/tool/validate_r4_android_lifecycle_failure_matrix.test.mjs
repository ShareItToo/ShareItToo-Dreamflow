import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR4AndroidLifecycleFailureMatrix,
} from '../../tool/validate_r4_android_lifecycle_failure_matrix.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r4-android-lifecycle-failure-matrix-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR4AndroidLifecycleFailureMatrix({
    repositoryRoot: root,
    evidence: changed,
  });
}

test('accepts all 28 bounded R4 lifecycle and failure cases', () => {
  assert.deepEqual(validate(), {
    status: 'verified-r4-regression-and-codeql-passed',
    cases: 28,
    physicalDevice: 'Pixel 7 Pro',
    fatalOrAnrEntries: 0,
    nextPackage: 'R5_REPEATED_DEVICE_STABILITY',
  });
});

test('rejects a missing, duplicated or failed matrix case', () => {
  const missing = structuredClone(evidence);
  missing.matrix.pop();
  assert.throws(() => validate(missing), /matrix is incomplete/u);

  const duplicate = structuredClone(evidence);
  duplicate.matrix[1].id = duplicate.matrix[0].id;
  assert.throws(() => validate(duplicate), /matrix is incomplete/u);

  const failed = structuredClone(evidence);
  failed.matrix[12].result = 'failed-backend-unavailable';
  assert.throws(() => validate(failed), /matrix is incomplete/u);
});

test('rejects physical overclaims for permission and offline scenarios', () => {
  const permission = structuredClone(evidence);
  permission.matrix.find((entry) => (
    entry.id === 'permission_permanently_denied'
  )).method = 'physical-device-bounded';
  assert.throws(() => validate(permission), /permission\/offline classification/u);

  const offline = structuredClone(evidence);
  offline.limitations.offlineNetworkPhysicallyMutated = true;
  assert.throws(() => validate(offline), /limitations/u);
});

test('rejects incomplete setting restoration and device identifiers', () => {
  const orientation = structuredClone(evidence);
  orientation.systemSettings.orientationRestoredExactly = false;
  assert.throws(() => validate(orientation), /system-setting restoration/u);

  const identifier = structuredClone(evidence);
  identifier.physicalDeviceObservation.containsRawDeviceIdentifier = true;
  assert.throws(() => validate(identifier), /physical-device observation/u);
});

test('rejects recovery of gates, raw bytes or automatic publication', () => {
  const ready = structuredClone(evidence);
  ready.localRecovery.readyFingerprintStored = true;
  assert.throws(() => validate(ready), /local recovery control/u);

  const bytes = structuredClone(evidence);
  bytes.localRecovery.rawImageBytesStored = true;
  assert.throws(() => validate(bytes), /local recovery control/u);

  const automatic = structuredClone(evidence);
  automatic.publicationRecovery.automaticPublicationAllowed = true;
  assert.throws(() => validate(automatic), /publication recovery control/u);
});

test('rejects premature CI claims, live changes and secret-shaped evidence', () => {
  const ci = structuredClone(evidence);
  ci.status = 'verified-r4-full-regression-passed-ci-pending';
  ci.verification.githubRegression = 'pending';
  ci.verification.githubCodeql = 'pending';
  assert.throws(() => validate(ci), /must not claim GitHub/u);

  const live = structuredClone(evidence);
  live.boundaries.productionChanged = true;
  assert.throws(() => validate(live), /live or privacy boundary/u);

  const secret = structuredClone(evidence);
  secret.note = 'owner@example.test';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});
