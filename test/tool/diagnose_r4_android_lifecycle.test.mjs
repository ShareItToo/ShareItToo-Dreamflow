import assert from 'node:assert/strict';
import test from 'node:test';

import { buildR4AndroidLifecycleEvidence } from '../../tool/diagnose_r4_android_lifecycle.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  commit: '19fc3221bc3879788db9c48b70a89a33656116b6',
  buildNumber: '2026082404',
});
const deviceSummary = Object.freeze({
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  androidVersion: '17',
  containsRawDeviceIdentifier: false,
});
const before = Object.freeze({
  versionName: '1.0.0',
  buildNumber: '2026082404',
  firstInstallTime: '2026-08-17 08:45:28',
  ceDataInode: '267655',
});
const observed = Object.freeze({
  exactInstalledCandidate: true,
  coldStart: true,
  warmStart: true,
  processKill: true,
  backgroundForeground: true,
  repeatedNavigation: true,
  navigationDestinationCount: 5,
  orientationChange: true,
  orientationRestored: true,
  cameraPermissionDeniedObserved: true,
  invalidDeepLinkHandled: true,
  validDeepLinkHandled: true,
  fatalOrAnrEntries: 0,
});

function validate(changed = {}) {
  return buildR4AndroidLifecycleEvidence({
    candidate,
    deviceSummary,
    before,
    after: before,
    observed,
    capturedAt: '2026-08-24T14:00:00.000Z',
    ...changed,
  });
}

test('builds identifier-free evidence for the complete bounded device lifecycle', () => {
  const value = validate();
  assert.equal(value.status, 'passed-bounded-device-lifecycle-diagnostic');
  assert.equal(value.tests.repeatedNavigation, 'passed-5-destinations');
  assert.equal(value.tests.fatalOrAnrEntries, 0);
  assert.equal(value.boundaries.orientationLeftChanged, false);
  assert.equal(value.boundaries.permissionChanged, false);
  assert.equal(JSON.stringify(value).includes('/Users/'), false);
});

test('rejects app-data replacement and incomplete restoration', () => {
  assert.throws(
    () => validate({ after: { ...before, ceDataInode: '1' } }),
    /data-preservation/u,
  );
  assert.throws(
    () => validate({ observed: { ...observed, orientationRestored: false } }),
    /incomplete or unsafe/u,
  );
});

test('rejects a crash, missing navigation or noncanonical candidate', () => {
  assert.throws(
    () => validate({ observed: { ...observed, fatalOrAnrEntries: 1 } }),
    /incomplete or unsafe/u,
  );
  assert.throws(
    () => validate({ observed: { ...observed, navigationDestinationCount: 4 } }),
    /incomplete or unsafe/u,
  );
  assert.throws(
    () => validate({ candidate: { ...candidate, buildNumber: '2026082405' } }),
    /candidate/u,
  );
});
