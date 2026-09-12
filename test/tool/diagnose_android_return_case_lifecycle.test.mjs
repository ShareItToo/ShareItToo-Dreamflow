import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runWp32ReturnCaseLifecycle,
  topRightClickableActionPoint,
} from '../../tool/diagnose_android_return_case_lifecycle.mjs';

function candidate() {
  return {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: '2026090608',
    commit: 'a'.repeat(40),
    releaseChannel: 'Internal Staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    apkSha256: 'b'.repeat(64),
  };
}

function successOperations(order) {
  return {
    prepareDeviceFile: async () => order.push('prepare-device-file'),
    completeFixture: async () => {
      order.push('complete-fixture');
      return { status: 'passed-bounded-synthetic-role-booking-lifecycle' };
    },
    verifyEntryPoint: async (role) => {
      order.push(`entry-${role}`);
      return { status: 'return-case-entry-point-passed' };
    },
    openCase: async () => {
      order.push('open-case');
      return { status: 'pixel-return-case-server-accepted' };
    },
    inspectServer: async () => {
      order.push('inspect-server');
      return { status: 'synthetic-return-case-role-truth-passed' };
    },
    verifyPostState: async (role) => {
      order.push(`post-${role}`);
      return { status: 'return-case-post-state-passed' };
    },
    removeDeviceFile: async () => order.push('remove-device-file'),
    restoreOwner: async () => {
      order.push('restore-owner');
      return true;
    },
  };
}

test('selects the rightmost enabled app-bar action without relying on a label', () => {
  const hierarchy = [
    '<hierarchy>',
    '<node class="android.widget.Button" clickable="true" enabled="true" bounds="[20,80][120,180]"/>',
    '<node class="android.widget.Button" clickable="true" enabled="true" bounds="[940,80][1060,180]"/>',
    '<node class="android.widget.Button" clickable="true" enabled="false" bounds="[970,40][1080,160]"/>',
    '</hierarchy>',
  ].join('');
  assert.deepEqual(topRightClickableActionPoint(hierarchy), { x: 1000, y: 130 });
});

test('runs the exact two-role Pixel return-case sequence and always cleans local state', async () => {
  const order = [];
  const result = await runWp32ReturnCaseLifecycle({
    candidate: candidate(),
    deviceSummary: { platform: 'android', physical: true },
    sourceDrift: { status: 'passed-no-post-candidate-mobile-source-drift' },
    operations: successOperations(order),
    capturedAt: '2026-09-06T12:00:00.000Z',
  });

  assert.equal(result.status, 'passed-pixel-v52-return-case-lifecycle');
  assert.deepEqual(order, [
    'prepare-device-file',
    'complete-fixture',
    'entry-owner',
    'entry-renter',
    'open-case',
    'inspect-server',
    'post-renter',
    'post-owner',
    'remove-device-file',
    'restore-owner',
  ]);
  assert.equal(result.tests.needsReview, 'passed-owner-and-renter');
  assert.equal(result.boundaries.paymentEndpointCalled, false);
  assert.equal(result.boundaries.stripeLivemode, false);
  assert.equal(result.boundaries.monetaryEffectMinor, 0);
  assert.equal(result.boundaries.auditCaseRetainedInStaging, true);
});

test('restores the owner and removes the device file after a primary failure', async () => {
  const order = [];
  const operations = successOperations(order);
  operations.completeFixture = async () => {
    order.push('complete-fixture');
    throw new Error('bounded lifecycle failure');
  };
  await assert.rejects(
    runWp32ReturnCaseLifecycle({
      candidate: candidate(),
      deviceSummary: { platform: 'android', physical: true },
      sourceDrift: { status: 'passed-no-post-candidate-mobile-source-drift' },
      operations,
    }),
    /bounded lifecycle failure/,
  );
  assert.deepEqual(order, [
    'prepare-device-file',
    'complete-fixture',
    'remove-device-file',
    'restore-owner',
  ]);
});

test('fails closed when the return-case operation inventory is incomplete', async () => {
  await assert.rejects(
    runWp32ReturnCaseLifecycle({
      candidate: candidate(),
      deviceSummary: {},
      sourceDrift: {},
      operations: {},
    }),
    /operations are incomplete/,
  );
});
