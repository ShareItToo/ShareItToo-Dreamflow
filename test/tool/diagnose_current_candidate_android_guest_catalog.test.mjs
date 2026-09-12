import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diagnoseCurrentCandidateAndroidGuestCatalog,
} from '../../tool/diagnose_current_candidate_android_guest_catalog.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090106',
  commit: 'c678c6911569139eabdbcd45a57112f2ef8567fb',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  apkSha256: 'a'.repeat(64),
});

const device = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});

function operations({ outcomes = ['empty', 'error', 'empty'], guestFailure = null, wifi = true } = {}) {
  const calls = [];
  let wifiEnabled = wifi;
  return {
    calls,
    value: {
      assertSafeReady: async () => calls.push('safe'),
      assertGuestSession: async () => {
        calls.push('guest');
        if (guestFailure !== null) throw new Error(guestFailure);
      },
      readWifiEnabled: async () => wifiEnabled,
      setWifiEnabled: async (enabled) => {
        calls.push(`wifi:${enabled}`);
        wifiEnabled = enabled;
      },
      waitForWifiState: async (expected) => {
        calls.push(`wifi-state:${expected}`);
        return wifiEnabled === expected;
      },
      waitForStagingReachability: async () => {
        calls.push('staging-reachable');
        return true;
      },
      readCatalogOutcome: async () => {
        calls.push('catalog');
        return outcomes.shift() ?? 'loading';
      },
    },
  };
}

test('guest catalog diagnostic proves online, explicit offline and validated recovery', async () => {
  const harness = operations();
  const result = await diagnoseCurrentCandidateAndroidGuestCatalog({
    candidate,
    deviceSummary: device,
    operations: harness.value,
    catalog: { count: 0, titles: [] },
    capturedAt: '2026-09-02T00:00:00.000Z',
  });

  assert.equal(result.status, 'passed-bounded-guest-network-truth-diagnostic');
  assert.equal(result.tests.guestCatalogOnline.result, 'server-confirmed-empty-state');
  assert.equal(result.boundaries.wifiRestored, true);
  assert.deepEqual(harness.calls, [
    'safe',
    'guest',
    'catalog',
    'wifi:false',
    'wifi-state:false',
    'catalog',
    'wifi:true',
    'wifi-state:true',
    'staging-reachable',
    'catalog',
  ]);
});

test('offline assertion failure still restores Wi-Fi before failing closed', async () => {
  const harness = operations({ outcomes: ['empty', 'loading', 'empty'] });
  await assert.rejects(
    diagnoseCurrentCandidateAndroidGuestCatalog({
      candidate,
      deviceSummary: device,
      operations: harness.value,
      catalog: { count: 0, titles: [] },
    }),
    /explicit offline error/u,
  );
  assert.deepEqual(harness.calls.slice(-4), [
    'wifi:true',
    'wifi-state:true',
    'staging-reachable',
    'catalog',
  ]);
});

test('an authenticated device is refused without changing Wi-Fi', async () => {
  const harness = operations({ guestFailure: 'authenticated session present' });
  await assert.rejects(
    diagnoseCurrentCandidateAndroidGuestCatalog({
      candidate,
      deviceSummary: device,
      operations: harness.value,
      catalog: { count: 0, titles: [] },
    }),
    /authenticated session present/u,
  );
  assert.deepEqual(harness.calls, ['safe', 'guest']);
});

test('a device that starts with Wi-Fi disabled is never mutated', async () => {
  const harness = operations({ wifi: false });
  await assert.rejects(
    diagnoseCurrentCandidateAndroidGuestCatalog({
      candidate,
      deviceSummary: device,
      operations: harness.value,
      catalog: { count: 0, titles: [] },
    }),
    /must already be enabled/u,
  );
  assert.deepEqual(harness.calls, ['safe', 'guest']);
});

test('non-empty Staging catalog requires actual catalog content', async () => {
  const harness = operations({ outcomes: ['empty'] });
  await assert.rejects(
    diagnoseCurrentCandidateAndroidGuestCatalog({
      candidate,
      deviceSummary: device,
      operations: harness.value,
      catalog: { count: 1, titles: ['Synthetic listing'] },
    }),
    /live Staging catalog truth/u,
  );
  assert.deepEqual(harness.calls, ['safe', 'guest', 'catalog']);
});
