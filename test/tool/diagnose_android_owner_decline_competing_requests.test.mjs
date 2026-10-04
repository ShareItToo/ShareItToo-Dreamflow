import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runAndroidOwnerDeclineCompetingRequests,
} from '../../tool/diagnose_android_owner_decline_competing_requests.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026091311',
  commit: '7b0479c8ee679c3e428f5aad9999d582c1c8455f',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  apkSha256: 'a'.repeat(64),
});

const device = Object.freeze({
  physical: true,
  model: 'Pixel 7 Pro',
  manufacturer: 'Google',
  apiLevel: 37,
});

function successfulOperations(calls) {
  return {
    prepare: async () => {
      calls.push('prepare');
      return { status: 'isolated-product-journey-fixture-active' };
    },
    createRequests: async () => {
      calls.push('createRequests');
      return { private: true };
    },
    declineThroughUi: async () => {
      calls.push('declineThroughUi');
      return { status: 'pixel-owner-declined-one-competing-request' };
    },
    verifyOutcome: async () => {
      calls.push('verifyOutcome');
      return { status: 'competing-decline-server-truth-passed' };
    },
    cleanup: async () => {
      calls.push('cleanup');
      return { status: 'competing-decline-fixture-retired' };
    },
    restoreOwner: async () => {
      calls.push('restoreOwner');
      return true;
    },
  };
}

test('closes the exact Pixel decline journey and publishes only sanitized evidence', async () => {
  const calls = [];
  const result = await runAndroidOwnerDeclineCompetingRequests({
    candidate,
    deviceSummary: device,
    operations: successfulOperations(calls),
    capturedAt: '2026-09-13T10:00:00.000Z',
  });

  assert.equal(result.status, 'passed-pixel-owner-decline-competing-requests');
  assert.deepEqual(calls, [
    'prepare',
    'createRequests',
    'declineThroughUi',
    'verifyOutcome',
    'cleanup',
    'restoreOwner',
  ]);
  assert.equal(result.tests.untouchedCompetingRequest, 'passed-still-requested');
  assert.equal(result.tests.protectedOwnerSessionRestored, true);
  assert.equal(result.boundaries.paymentEndpointCalled, false);
  assert.equal(result.boundaries.contractCreated, false);
  assert.equal(result.boundaries.reservationCreated, false);
  assert.equal(result.boundaries.containsAccountIdentity, false);
  assert.doesNotMatch(JSON.stringify(result), /(?:@|password|accessToken|bookingIds)/u);
});

test('always retires the fixture and restores the owner after a journey failure', async () => {
  const calls = [];
  const operations = successfulOperations(calls);
  operations.verifyOutcome = async () => {
    calls.push('verifyOutcome');
    throw new Error('server truth incomplete');
  };

  await assert.rejects(
    () => runAndroidOwnerDeclineCompetingRequests({
      candidate,
      deviceSummary: device,
      operations,
    }),
    /verify-outcome failed safely: server truth incomplete/u,
  );
  assert.deepEqual(calls.slice(-2), ['cleanup', 'restoreOwner']);
});

test('rejects incomplete operation contracts before any external action', async () => {
  await assert.rejects(
    () => runAndroidOwnerDeclineCompetingRequests({
      candidate,
      deviceSummary: device,
      operations: { prepare: async () => ({}) },
    }),
    /operations are incomplete/u,
  );
});
