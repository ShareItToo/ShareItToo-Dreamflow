import assert from 'node:assert/strict';
import test from 'node:test';

import { diagnoseAndroidFreshInstall } from '../../tool/diagnose_android_fresh_install.mjs';

const candidate = {
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026081505',
  commit: '3908f5a3c300c1125c120c832f3050eea7a0a762',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  paymentMode: 'memory',
  stripeLivemode: false,
};

function authenticatedEvidence() {
  return {
    installed: {
      delivery: 'google-play-split',
      installerPackageName: 'com.android.vending',
    },
    tests: {
      authenticatedProfileAccess: { status: 'passed' },
      coldStartSessionRestore: { status: 'passed' },
    },
  };
}

test('proves cleared Play app data and restores the synthetic session', async () => {
  const commands = [];
  let restoreCalls = 0;
  const evidence = await diagnoseAndroidFreshInstall({
    commandRunner: (_file, args) => {
      commands.push(args);
      return 'Success\n';
    },
    adbPath: 'adb',
    device: { serial: 'private-device' },
    deviceSummary: { platform: 'android-real', model: 'Pixel 7 Pro' },
    candidate,
    archive: {},
    account: { role: 'owner', email: 'private', password: 'private' },
    restoreSession: async () => {
      restoreCalls += 1;
      return true;
    },
    ensureGuest: async () => true,
    authenticate: async () => authenticatedEvidence(),
    wait: async () => {},
    capturedAt: '2026-08-15T08:00:00.000Z',
  });
  assert.equal(restoreCalls, 2);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].slice(-4), ['shell', 'pm', 'clear', 'com.shareittoo.app']);
  assert.equal(evidence.status, 'passed-play-install-fresh-app-data-and-session-restore');
  assert.equal(evidence.checks.syntheticReviewLoginRestored, true);
  assert.equal(evidence.boundaries.containsSecrets, false);
});

test('fails closed when Android does not confirm the app-data reset', async () => {
  await assert.rejects(
    diagnoseAndroidFreshInstall({
      commandRunner: () => 'Failed\n',
      adbPath: 'adb',
      device: { serial: 'private-device' },
      deviceSummary: { platform: 'android-real' },
      candidate,
      archive: {},
      account: {},
      restoreSession: async () => true,
      ensureGuest: async () => true,
      authenticate: async () => authenticatedEvidence(),
      wait: async () => {},
    }),
    /did not confirm/,
  );
});

test('attempts restoration after a post-reset guest diagnostic failure', async () => {
  let restoreCalls = 0;
  await assert.rejects(
    diagnoseAndroidFreshInstall({
      commandRunner: () => 'Success\n',
      adbPath: 'adb',
      device: { serial: 'private-device' },
      deviceSummary: { platform: 'android-real' },
      candidate,
      archive: {},
      account: {},
      restoreSession: async () => {
        restoreCalls += 1;
        return true;
      },
      ensureGuest: async () => { throw new Error('guest diagnostic failure'); },
      authenticate: async () => authenticatedEvidence(),
      wait: async () => {},
    }),
    /guest diagnostic failure/,
  );
  assert.equal(restoreCalls, 2);
});
