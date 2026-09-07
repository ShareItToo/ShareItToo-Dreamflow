import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertExactDeclaredAndroidPermissions,
  buildWp46PermissionEvidence,
  exercisePermissionGroups,
  parseAndroidAppOpSnapshot,
  parseAndroidRuntimePermissionSnapshot,
  parseDeclaredAndroidPermissions,
  parseWp46Arguments,
} from '../../tool/diagnose_current_candidate_android_permission_lifecycle.mjs';

const names = [
  'android.permission.CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
];

function state(granted = {}) {
  return Object.fromEntries(names.map((name) => [name, {
    granted: granted[name] ?? false,
    flags: name.endsWith('POST_NOTIFICATIONS') ? ['USER_SET'] : [],
    appOpMode: granted[name] === true || name.endsWith('POST_NOTIFICATIONS') ? 'allow' : 'ignore',
  }]));
}

const manifestOutput = [
  "package: com.shareittoo.app",
  "uses-permission: name='android.permission.CAMERA'",
  "uses-permission: name='android.permission.READ_EXTERNAL_STORAGE' maxSdkVersion='32'",
  "uses-permission: name='android.permission.WRITE_EXTERNAL_STORAGE' maxSdkVersion='28'",
  "uses-permission: name='android.permission.ACCESS_COARSE_LOCATION'",
  "uses-permission: name='android.permission.ACCESS_FINE_LOCATION'",
  "uses-permission: name='android.permission.POST_NOTIFICATIONS'",
  "uses-permission: name='android.permission.INTERNET'",
  "uses-permission: name='android.permission.WAKE_LOCK'",
  "uses-permission: name='android.permission.ACCESS_NETWORK_STATE'",
  "uses-permission: name='android.permission.USE_BIOMETRIC'",
  "uses-permission: name='android.permission.USE_FINGERPRINT'",
  "uses-permission: name='com.google.android.c2dm.permission.RECEIVE'",
  "uses-permission: name='com.google.android.providers.gsf.permission.READ_GSERVICES'",
  "uses-permission: name='com.shareittoo.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'",
].join('\n');

test('parses and accepts only the exact candidate permission manifest', () => {
  const parsed = parseDeclaredAndroidPermissions(manifestOutput);
  const audit = assertExactDeclaredAndroidPermissions(parsed);
  assert.equal(audit.declaredPermissionCount, 14);
  assert.equal(audit.activeRuntimePermissionCount, 4);
  assert.equal(audit.legacyStoragePermissionsInactiveAtApi37, true);
  assert.equal(audit.broadMediaPermissionDeclared, false);
  assert.throws(
    () => assertExactDeclaredAndroidPermissions(parsed.slice(0, -1)),
    /permission manifest changed/u,
  );
});

test('parses runtime permission flags and default versus explicit app-op state', () => {
  const runtime = parseAndroidRuntimePermissionSnapshot(`
    android.permission.POST_NOTIFICATIONS: granted=true, flags=[ USER_SET|USER_SENSITIVE_WHEN_GRANTED]
    android.permission.ACCESS_FINE_LOCATION: granted=false, flags=[ USER_SENSITIVE_WHEN_DENIED]
    android.permission.ACCESS_COARSE_LOCATION: granted=false, flags=[]
    android.permission.CAMERA: granted=false, flags=[ USER_FIXED|USER_SET]
  `);
  assert.deepEqual(runtime['android.permission.CAMERA'], {
    granted: false,
    flags: ['USER_FIXED', 'USER_SET'],
  });
  const appOp = parseAndroidAppOpSnapshot({
    'android.permission.CAMERA': 'Uid mode: CAMERA: ignore',
    'android.permission.ACCESS_COARSE_LOCATION': 'COARSE_LOCATION: foreground',
    'android.permission.ACCESS_FINE_LOCATION': 'Uid mode: FINE_LOCATION: allow',
    'android.permission.POST_NOTIFICATIONS': 'No operations. Default mode: allow',
  });
  assert.deepEqual(appOp['android.permission.POST_NOTIFICATIONS'], {
    mode: 'allow',
    source: 'default',
  });
  assert.equal(appOp['android.permission.CAMERA'].source, 'explicit');
});

function fakeOperations({ failOn = null } = {}) {
  const original = state({ 'android.permission.POST_NOTIFICATIONS': true });
  let current = structuredClone(original);
  const calls = [];
  return {
    original,
    calls,
    operations: {
      readState: async () => structuredClone(current),
      setGroupGranted: async (group, granted) => {
        calls.push(`set:${group.id}:${granted}`);
        for (const permission of group.permissions) {
          current[permission].granted = granted;
          current[permission].appOpMode = granted ? 'allow' : 'ignore';
        }
      },
      restartAuthenticated: async () => {
        calls.push('restart');
        if (failOn !== null && calls.includes(failOn)) throw new Error('synthetic failure');
      },
      openReadOnlySettings: async () => calls.push('settings'),
      restoreState: async (snapshot) => {
        calls.push('restore');
        current = structuredClone(snapshot);
      },
    },
  };
}

test('exercises deny and allow with authenticated restarts, then restores exactly', async () => {
  const fake = fakeOperations();
  const result = await exercisePermissionGroups(fake);
  assert.deepEqual(result.before, fake.original);
  assert.deepEqual(result.after, fake.original);
  assert.equal(result.observations.camera.allowed, true);
  assert.equal(result.observations.location.deniedRestartPassed, true);
  assert.equal(result.observations.notifications.allowedRestartPassed, true);
  assert.equal(fake.calls.filter((value) => value === 'restart').length, 7);
  assert.equal(fake.calls.at(-2), 'restore');
});

test('restores exact state even when an intermediate authenticated restart fails', async () => {
  const fake = fakeOperations({ failOn: 'set:location:false' });
  let restarts = 0;
  fake.operations.restartAuthenticated = async () => {
    restarts += 1;
    if (restarts === 3) throw new Error('synthetic failure');
  };
  await assert.rejects(() => exercisePermissionGroups(fake), /synthetic failure/u);
  assert.equal(fake.calls.includes('restore'), true);
  assert.deepEqual(await fake.operations.readState(), fake.original);
});

function validEvidenceInput() {
  const original = state({ 'android.permission.POST_NOTIFICATIONS': true });
  const installed = {
    versionName: '1.0.0',
    buildNumber: '2026090610',
    firstInstallTime: '2026-08-17 08:45:28',
    ceDataInode: '267655',
  };
  return {
    candidate: {
      applicationId: 'com.shareittoo.app',
      versionName: '1.0.0',
      buildNumber: '2026090610',
      commit: '2fd793bac970866aa94a2940f28d6bbc3e04e377',
      releaseChannel: 'internal',
      apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
      firebaseConfigured: true,
      android: {
        apkSha256: 'a'.repeat(64),
        signingCertificateSha256: 'b'.repeat(64),
      },
    },
    installedBefore: installed,
    installedAfter: installed,
    deviceSummary: {
      platform: 'android',
      physical: true,
      manufacturer: 'Google',
      model: 'Pixel 7 Pro',
      osVersion: '17',
      apiLevel: 37,
      securityPatch: '2026-07-05',
      containsRawDeviceIdentifier: false,
    },
    manifestAudit: assertExactDeclaredAndroidPermissions(
      parseDeclaredAndroidPermissions(manifestOutput),
    ),
    lifecycle: {
      before: original,
      after: original,
      observations: Object.fromEntries(['camera', 'location', 'notifications'].map((id) => [id, {
        denied: true,
        allowed: true,
        deniedRestartPassed: true,
        allowedRestartPassed: true,
      }])),
    },
    sourceDrift: { mobileSourceChanged: false },
    capturedAt: '2026-09-07T12:30:00.000Z',
  };
}

test('builds sanitized exact-candidate WP46 evidence and rejects restoration drift', () => {
  const result = buildWp46PermissionEvidence(validEvidenceInput());
  assert.equal(result.status, 'passed-exact-candidate-permission-lifecycle-and-restoration');
  assert.equal(result.tests.packageDataIdentityPreserved.status, 'passed');
  assert.equal(result.boundaries.permissionStateRestored, true);
  assert.equal(JSON.stringify(result).includes('/Users/'), false);

  const changed = validEvidenceInput();
  changed.lifecycle.after = structuredClone(changed.lifecycle.before);
  changed.lifecycle.after['android.permission.CAMERA'].granted = true;
  assert.throws(() => buildWp46PermissionEvidence(changed), /restoration evidence/u);
});

test('requires explicit private archive and parses bounded tool paths', () => {
  assert.deepEqual(
    parseWp46Arguments([
      '--candidate-dir', '/private/candidate',
      '--adb', '/safe/adb',
      '--aapt2', '/safe/aapt2',
      '--journal', '/private/journal',
    ]),
    {
      candidateDirectory: '/private/candidate',
      adbPath: '/safe/adb',
      aapt2Path: '/safe/aapt2',
      journalPath: '/private/journal',
    },
  );
  assert.throws(() => parseWp46Arguments([]), /candidate-dir is required/u);
  assert.throws(() => parseWp46Arguments(['--other']), /Unknown argument/u);
});
