import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertExactDeclaredAndroidPermissions,
  buildWp46FailedAfterRestorationJournal,
  buildRecoveredWp46PermissionJournal,
  classifyWp46FailClosedDiagnosticError,
  buildWp46PermissionEvidence,
  exercisePermissionGroups,
  parseAndroidDisplaySize,
  parseAndroidAppOpSnapshot,
  parseAndroidRuntimePermissionSnapshot,
  parseDeclaredAndroidPermissions,
  parseWp46Arguments,
  normalizeWp46LifecycleCheckpoint,
  preflightAuthenticatedPermissionLifecycle,
  profileMenuScrollArguments,
  readWp46PermissionJournal,
  settleAndroidPackageManagerPermissionChanges,
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

test('derives a bounded, display-relative profile-menu scroll without identity data', () => {
  const display = parseAndroidDisplaySize('Physical size: 1440x3120\nOverride size: 1080x2340\n');
  assert.deepEqual(display, { width: 1080, height: 2340 });
  assert.deepEqual(profileMenuScrollArguments(display), [
    'shell', 'input', 'swipe', '540', '1684', '540', '631', '350',
  ]);
  assert.throws(
    () => parseAndroidDisplaySize('Physical size: 100x200'),
    /usable display size/u,
  );
  assert.equal(JSON.stringify(profileMenuScrollArguments(display)).includes('/Users/'), false);
});

test('requires an authenticated profile before a new permission lifecycle starts', async () => {
  let calls = 0;
  const result = await preflightAuthenticatedPermissionLifecycle({
    assertAuthenticated: async () => {
      calls += 1;
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { authenticatedProfile: true });
  await assert.rejects(
    () => preflightAuthenticatedPermissionLifecycle({
      assertAuthenticated: async () => {
        throw new Error('guest profile');
      },
    }),
    /guest profile/u,
  );
  await assert.rejects(
    () => preflightAuthenticatedPermissionLifecycle({}),
    /preflight is unavailable/u,
  );
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
      checkpoint: async (checkpoint) => calls.push(`checkpoint:${checkpoint.group}:${checkpoint.phase}`),
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
      settlePermissionManager: async () => calls.push('settle-permission-manager'),
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
  const restoreIndex = fake.calls.lastIndexOf('restore');
  assert.ok(restoreIndex > 0);
  assert.equal(fake.calls[restoreIndex - 1], 'checkpoint:lifecycle:before-restore');
  assert.equal(fake.calls[restoreIndex + 1], 'checkpoint:lifecycle:after-restore');
  assert.equal(
    fake.calls[restoreIndex + 2],
    'checkpoint:lifecycle:before-permission-manager-settle',
  );
  assert.equal(fake.calls[restoreIndex + 3], 'settle-permission-manager');
  assert.equal(
    fake.calls[restoreIndex + 4],
    'checkpoint:lifecycle:after-permission-manager-settle',
  );
  assert.equal(fake.calls.includes('checkpoint:camera:before-denied-restart'), true);
  assert.equal(fake.calls.includes('checkpoint:lifecycle:before-final-restart'), true);
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

test('binds evidence to a structurally valid signed candidate instead of a retired build', () => {
  const input = validEvidenceInput();
  input.candidate.buildNumber = '2026090905';
  input.candidate.commit = 'e1c182ea496f013989863155c13bfda649255a7e';
  input.installedBefore.buildNumber = input.candidate.buildNumber;
  input.installedAfter.buildNumber = input.candidate.buildNumber;
  const result = buildWp46PermissionEvidence(input);
  assert.equal(result.candidate.buildNumber, '2026090905');
  assert.equal(result.candidate.commit, 'e1c182ea496f013989863155c13bfda649255a7e');
});

test('requires explicit private archive and parses bounded tool paths', () => {
  assert.deepEqual(
    parseWp46Arguments([
      '--candidate-dir', '/private/candidate',
      '--candidate-source-root', '/private/candidate-source',
      '--adb', '/safe/adb',
      '--aapt2', '/safe/aapt2',
      '--journal', '/private/journal',
    ]),
    {
      candidateDirectory: '/private/candidate',
      candidateSourceRoot: '/private/candidate-source',
      adbPath: '/safe/adb',
      aapt2Path: '/safe/aapt2',
      journalPath: '/private/journal',
    },
  );
  assert.throws(() => parseWp46Arguments([]), /candidate-dir is required/u);
  assert.throws(() => parseWp46Arguments(['--other']), /Unknown argument/u);
});

test('reads the WP46 journal through one owner-only non-symlinked file handle', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sit-wp46-journal-'));
  const journal = join(directory, 'journal.json');
  const linked = join(directory, 'linked.json');
  try {
    writeFileSync(journal, JSON.stringify({ status: 'in-progress' }), { mode: 0o600 });
    assert.deepEqual(readWp46PermissionJournal(journal), { status: 'in-progress' });
    symlinkSync(journal, linked);
    assert.throws(() => readWp46PermissionJournal(linked));
    chmodSync(journal, 0o644);
    assert.throws(() => readWp46PermissionJournal(journal), /owner-only/u);
    writeFileSync(journal, 'x'.repeat(16 * 1024 + 1), { mode: 0o600 });
    chmodSync(journal, 0o600);
    assert.throws(() => readWp46PermissionJournal(journal), /owner-only/u);
    assert.equal(readWp46PermissionJournal(join(directory, 'missing.json')), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('marks a successfully restored interrupted run as recovered before a new preflight', () => {
  const originalPermissionState = state({ 'android.permission.POST_NOTIFICATIONS': true });
  const recovered = buildRecoveredWp46PermissionJournal({
    status: 'in-progress',
    candidate: {
      applicationId: 'com.shareittoo.app',
      buildNumber: '2026090905',
      commit: 'e1c182ea496f013989863155c13bfda649255a7e',
    },
    originalPermissionState,
    containsCredentials: false,
    containsAccountIdentity: false,
    containsRawDeviceIdentifier: false,
  });
  assert.equal(recovered.status, 'recovered-before-new-run');
  assert.equal(recovered.recoveryRequired, false);
  assert.equal(recovered.recoveredFromInterruptedRun, true);
  assert.deepEqual(recovered.restoredPermissionState, originalPermissionState);
  assert.equal(JSON.stringify(recovered).includes('/Users/'), false);
  assert.throws(
    () => buildRecoveredWp46PermissionJournal({ status: 'in-progress' }),
    /recovery journal is incomplete/u,
  );
});

test('records a restored but unproven lifecycle failure without claiming success', () => {
  const originalPermissionState = state({ 'android.permission.POST_NOTIFICATIONS': true });
  const result = buildWp46FailedAfterRestorationJournal({
    candidate: {
      applicationId: 'com.shareittoo.app',
      buildNumber: '2026090905',
      commit: 'e1c182ea496f013989863155c13bfda649255a7e',
    },
    originalPermissionState,
  });
  assert.equal(result.status, 'restored-after-failed-run');
  assert.equal(result.lifecycleResult, 'unproven');
  assert.equal(result.failureClass, 'other-fail-closed-diagnostic-error');
  assert.equal(result.foregroundOwner, 'unobserved');
  assert.equal(result.lastLifecycleCheckpoint, null);
  assert.equal(result.recoveryRequired, false);
  assert.deepEqual(result.restoredPermissionState, originalPermissionState);
  assert.equal(JSON.stringify(result).includes('/Users/'), false);
  assert.throws(
    () => buildWp46FailedAfterRestorationJournal({}),
    /restoration record is incomplete/u,
  );
  assert.throws(
    () => buildWp46FailedAfterRestorationJournal({
      candidate: {}, originalPermissionState, foregroundOwner: 'raw-package-name',
    }),
    /foreground owner is not safe/u,
  );
  assert.throws(
    () => buildWp46FailedAfterRestorationJournal({
      candidate: {}, originalPermissionState, failureClass: 'untrusted raw error',
    }),
    /restoration class is not safe/u,
  );
});

test('accepts only fixed non-private lifecycle checkpoints', () => {
  assert.deepEqual(
    normalizeWp46LifecycleCheckpoint({ group: 'camera', phase: 'before-denied-restart' }),
    { group: 'camera', phase: 'before-denied-restart' },
  );
  assert.equal(normalizeWp46LifecycleCheckpoint(null), null);
  assert.throws(
    () => normalizeWp46LifecycleCheckpoint({ group: 'camera', phase: 'private-ui-text' }),
    /checkpoint is not safe/u,
  );
});

test('waits for both Android PackageManager handlers before a restored restart', () => {
  const calls = [];
  settleAndroidPackageManagerPermissionChanges((_file, args) => {
    calls.push(args.slice(2).join(' '));
    return args.slice(2).join(' ') ===
            'shell timeout 10 am wait-for-broadcast-barrier'
        ? 'Waiting for queues\nTest barrier passed'
        : 'Success';
  }, 'adb', { serial: 'PRIVATE-SERIAL' });
  assert.deepEqual(calls, [
    'shell cmd package wait-for-handler --timeout 10000',
    'shell cmd package wait-for-background-handler --timeout 10000',
    'shell timeout 10 am wait-for-broadcast-barrier',
  ]);
  assert.throws(
    () => settleAndroidPackageManagerPermissionChanges(() => 'Timed out', 'adb', {
      serial: 'PRIVATE-SERIAL',
    }),
    /did not confirm permission-change settlement/u,
  );
});

test('records only a fixed navigation failure class, never a raw Android error', () => {
  assert.equal(
    classifyWp46FailClosedDiagnosticError(
      new Error('The current-head ShareItToo main navigation did not appear (bottom-navigation-absent).'),
    ),
    'navigation-bottom-navigation-absent',
  );
  assert.equal(
    classifyWp46FailClosedDiagnosticError(new Error('private content should not leave the device')),
    'other-fail-closed-diagnostic-error',
  );
});

test('reads the bounded journal bytes from the validated descriptor, never by path', () => {
  const source = readFileSync(
    new URL('../../tool/diagnose_current_candidate_android_permission_lifecycle.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /readSync\(descriptor, bytes/u);
  assert.doesNotMatch(source, /readFileSync\(descriptor/u);
});

test('preflights authenticated state before recording a new mutable permission snapshot', () => {
  const source = readFileSync(
    new URL('../../tool/diagnose_current_candidate_android_permission_lifecycle.mjs', import.meta.url),
    'utf8',
  );
  const preflight = source.lastIndexOf('await preflightAuthenticatedPermissionLifecycle({');
  const snapshot = source.indexOf('const originalPermissionState = readPhysicalPermissionState');
  const journal = source.indexOf('atomicJournal(args.journalPath, {');
  assert.ok(preflight >= 0 && snapshot >= 0 && journal >= 0);
  assert.ok(preflight < snapshot);
  assert.ok(snapshot < journal);
  assert.match(source, /async function restartAuthenticated[\s\S]*?finally \{\s*restoreCurrentHeadAndroidExplore/u);
});
