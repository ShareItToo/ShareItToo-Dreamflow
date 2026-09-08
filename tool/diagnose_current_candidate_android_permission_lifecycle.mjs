#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  restoreCurrentHeadAndroidExplore,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import { parseAndroidInstalledPackageSnapshot } from './install_current_head_android_candidate_update.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';
import { validatePrivateAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';

const applicationId = 'com.shareittoo.app';
const mutablePermissionFlags = Object.freeze([
  'review-required',
  'revoked-compat',
  'revoke-when-requested',
  'user-fixed',
  'user-set',
]);
const permissionGroups = Object.freeze([
  Object.freeze({
    id: 'camera',
    permissions: Object.freeze(['android.permission.CAMERA']),
  }),
  Object.freeze({
    id: 'location',
    permissions: Object.freeze([
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ]),
  }),
  Object.freeze({
    id: 'notifications',
    permissions: Object.freeze(['android.permission.POST_NOTIFICATIONS']),
  }),
]);
const runtimePermissions = Object.freeze(permissionGroups.flatMap((group) => group.permissions));
const appOps = Object.freeze({
  'android.permission.CAMERA': 'CAMERA',
  'android.permission.ACCESS_COARSE_LOCATION': 'COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION': 'FINE_LOCATION',
  'android.permission.POST_NOTIFICATIONS': 'POST_NOTIFICATION',
});
const exactDeclaredPermissions = Object.freeze([
  Object.freeze({ name: 'android.permission.CAMERA', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.READ_EXTERNAL_STORAGE', maxSdkVersion: 32 }),
  Object.freeze({ name: 'android.permission.WRITE_EXTERNAL_STORAGE', maxSdkVersion: 28 }),
  Object.freeze({ name: 'android.permission.ACCESS_COARSE_LOCATION', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.ACCESS_FINE_LOCATION', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.POST_NOTIFICATIONS', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.INTERNET', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.WAKE_LOCK', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.ACCESS_NETWORK_STATE', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.USE_BIOMETRIC', maxSdkVersion: null }),
  Object.freeze({ name: 'android.permission.USE_FINGERPRINT', maxSdkVersion: null }),
  Object.freeze({ name: 'com.google.android.c2dm.permission.RECEIVE', maxSdkVersion: null }),
  Object.freeze({ name: 'com.google.android.providers.gsf.permission.READ_GSERVICES', maxSdkVersion: null }),
  Object.freeze({
    name: 'com.shareittoo.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    maxSdkVersion: null,
  }),
]);

function fail(message) {
  throw new Error(message);
}

function exact(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

export function parseDeclaredAndroidPermissions(output) {
  const permissions = [];
  for (const line of String(output).split(/\r?\n/u)) {
    const match = /^uses-permission:\s+name='([^']+)'(?:\s+maxSdkVersion='(\d+)')?\s*$/u.exec(
      line.trim(),
    );
    if (match === null) continue;
    permissions.push({
      name: match[1],
      maxSdkVersion: match[2] === undefined ? null : Number(match[2]),
    });
  }
  return permissions;
}

export function assertExactDeclaredAndroidPermissions(permissions) {
  if (!exact(permissions, exactDeclaredPermissions)) {
    fail('The exact candidate Android permission manifest changed.');
  }
  return Object.freeze({
    declaredPermissionCount: permissions.length,
    activeRuntimePermissionCount: runtimePermissions.length,
    legacyStoragePermissionsInactiveAtApi37: true,
    broadMediaPermissionDeclared: false,
    microphonePermissionDeclared: false,
    contactsPermissionDeclared: false,
    smsPermissionDeclared: false,
    backgroundLocationPermissionDeclared: false,
    advertisingIdPermissionDeclared: false,
  });
}

function parseFlags(value) {
  return value.trim() === ''
    ? []
    : value.split('|').map((flag) => flag.trim()).filter(Boolean).toSorted();
}

export function parseAndroidRuntimePermissionSnapshot(output) {
  const snapshot = {};
  for (const permission of runtimePermissions) {
    const escaped = permission.replaceAll('.', '\\.');
    const match = new RegExp(
      `^\\s*${escaped}:\\s+granted=(true|false),\\s+flags=\\[([^\\]]*)\\]`,
      'mu',
    ).exec(String(output));
    if (match === null) fail(`Android did not expose ${permission} runtime state.`);
    snapshot[permission] = {
      granted: match[1] === 'true',
      flags: parseFlags(match[2]),
    };
  }
  return snapshot;
}

export function parseAndroidAppOpSnapshot(outputs) {
  const snapshot = {};
  for (const permission of runtimePermissions) {
    const output = String(outputs?.[permission] ?? '').trim();
    const defaultMatch = /Default mode:\s*(allow|ignore|deny|foreground|default)\b/iu.exec(output);
    const explicitMatch = new RegExp(
      `(?:Uid mode:\\s*)?${appOps[permission]}:\\s*(allow|ignore|deny|foreground|default)\\b`,
      'iu',
    ).exec(output);
    const match = explicitMatch ?? defaultMatch;
    if (match === null) fail(`Android did not expose ${permission} app-op state.`);
    snapshot[permission] = {
      mode: match[1].toLowerCase(),
      source: explicitMatch === null ? 'default' : 'explicit',
    };
  }
  return snapshot;
}

function combinePermissionState(permissionSnapshot, appOpSnapshot) {
  return Object.fromEntries(runtimePermissions.map((permission) => [permission, {
    ...permissionSnapshot[permission],
    // AppOps can expose a permission-derived UID mode and an equivalent
    // package/default line after a grant/revoke round trip. The durable truth
    // is the effective mode, not which equivalent internal line Android chose
    // to retain.
    appOpMode: appOpSnapshot[permission].mode,
  }]));
}

function normalizePermissionState(snapshot) {
  return Object.fromEntries(runtimePermissions.map((permission) => {
    const state = snapshot?.[permission];
    if (state === undefined) fail(`The ${permission} recovery state is missing.`);
    return [permission, {
      granted: state.granted,
      flags: [...state.flags].toSorted(),
      appOpMode: state.appOpMode ?? state.appOp?.mode,
    }];
  }));
}

function assertGroupGranted(snapshot, group, granted) {
  if (group.permissions.some((permission) => snapshot[permission]?.granted !== granted)) {
    fail(`${group.id} did not reach the required ${granted ? 'allowed' : 'denied'} state.`);
  }
}

export async function exercisePermissionGroups({ operations }) {
  const before = await operations.readState();
  const observations = {};
  let primaryFailure = null;
  try {
    for (const group of permissionGroups) {
      await operations.setGroupGranted(group, false);
      const denied = await operations.readState();
      assertGroupGranted(denied, group, false);
      await operations.restartAuthenticated();

      await operations.setGroupGranted(group, true);
      const allowed = await operations.readState();
      assertGroupGranted(allowed, group, true);
      await operations.restartAuthenticated();

      observations[group.id] = {
        denied: true,
        allowed: true,
        deniedRestartPassed: true,
        allowedRestartPassed: true,
      };
    }
    await operations.openReadOnlySettings();
  } catch (error) {
    primaryFailure = error;
  } finally {
    await operations.restoreState(before);
  }
  const after = await operations.readState();
  if (!exact(after, before)) {
    fail('The exact Android permission and app-op snapshot was not restored.');
  }
  await operations.restartAuthenticated();
  if (primaryFailure !== null) throw primaryFailure;
  return Object.freeze({ before, after, observations });
}

export function buildWp46PermissionEvidence({
  candidate,
  installedBefore,
  installedAfter,
  deviceSummary,
  manifestAudit,
  lifecycle,
  sourceDrift,
  capturedAt = new Date().toISOString(),
}) {
  if (candidate?.applicationId !== applicationId
      || candidate?.buildNumber !== '2026090610'
      || candidate?.commit !== '2fd793bac970866aa94a2940f28d6bbc3e04e377'
      || candidate?.releaseChannel !== 'internal'
      || candidate?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || candidate?.firebaseConfigured !== true
      || deviceSummary?.physical !== true
      || deviceSummary?.model !== 'Pixel 7 Pro'
      || deviceSummary?.containsRawDeviceIdentifier !== false
      || sourceDrift?.mobileSourceChanged !== false) {
    fail('WP46 candidate, device or source-drift evidence is invalid.');
  }
  if (manifestAudit?.declaredPermissionCount !== exactDeclaredPermissions.length
      || manifestAudit?.activeRuntimePermissionCount !== runtimePermissions.length
      || manifestAudit?.legacyStoragePermissionsInactiveAtApi37 !== true
      || manifestAudit?.broadMediaPermissionDeclared !== false
      || manifestAudit?.microphonePermissionDeclared !== false
      || manifestAudit?.contactsPermissionDeclared !== false
      || manifestAudit?.smsPermissionDeclared !== false
      || manifestAudit?.backgroundLocationPermissionDeclared !== false
      || manifestAudit?.advertisingIdPermissionDeclared !== false) {
    fail('WP46 manifest evidence is incomplete.');
  }
  if (!exact(installedBefore, installedAfter)
      || installedBefore?.versionName !== candidate.versionName
      || installedBefore?.buildNumber !== candidate.buildNumber
      || !exact(lifecycle?.before, lifecycle?.after)
      || permissionGroups.some((group) => (
        lifecycle?.observations?.[group.id]?.denied !== true
        || lifecycle?.observations?.[group.id]?.allowed !== true
        || lifecycle?.observations?.[group.id]?.deniedRestartPassed !== true
        || lifecycle?.observations?.[group.id]?.allowedRestartPassed !== true
      ))) {
    fail('WP46 lifecycle or restoration evidence is incomplete.');
  }
  const result = {
    schemaVersion: 1,
    kind: 'sit-wp46-current-candidate-android-permission-lifecycle',
    status: 'passed-exact-candidate-permission-lifecycle-and-restoration',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.android.apkSha256,
      signingCertificateSha256: candidate.android.signingCertificateSha256,
      mobileSourceChangedAfterCandidate: sourceDrift.mobileSourceChanged,
    },
    device: deviceSummary,
    manifest: manifestAudit,
    tests: {
      camera: { status: 'passed', result: 'deny-allow-restart-restored' },
      location: { status: 'passed', result: 'coarse-and-fine-deny-allow-restart-restored' },
      notifications: { status: 'passed', result: 'deny-allow-restart-restored' },
      appPermissionSettings: { status: 'passed', result: 'read-only-system-surface' },
      authenticatedSessionAfterEveryRestart: { status: 'passed' },
      packageDataIdentityPreserved: { status: 'passed' },
      exactPermissionAndAppOpSnapshotRestored: { status: 'passed' },
    },
    boundaries: {
      exactInstalledCandidate: true,
      permissionStateTemporarilyChanged: true,
      permissionStateRestored: true,
      appOpStateRestored: true,
      profileChanged: false,
      photoCapturedOrSelected: false,
      locationReadOrPersisted: false,
      notificationPreferenceChanged: false,
      pushRegistrationChanged: false,
      messageSent: false,
      accountMutationPerformed: false,
      appDataCleared: false,
      packageReinstalled: false,
      storeChanged: false,
      productionChanged: false,
      onePlusContacted: false,
      screenshotsCaptured: false,
      rawUiHierarchyRetained: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('WP46 evidence contains private or credential-shaped material.');
  }
  return result;
}

function center(node, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

function tapNamed(commandRunner, adbPath, device, hierarchy, label) {
  const nodes = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = nodes.filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const target = (clickable.length > 0 ? clickable : nodes)
    .map((node) => ({ node, point: center(node, label) }))
    .toSorted((left, right) => right.point.y - left.point.y)[0];
  if (target === undefined) fail(`The sanitized ${label} action is unavailable.`);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(target.point.x), String(target.point.y),
  ]);
}

async function waitForLabels(commandRunner, adbPath, device, labels, label) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (labels.every((value) => currentHeadAndroidNamedNodes(hierarchy, value).length > 0)) {
      return hierarchy;
    }
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

function packageSnapshot(commandRunner, adbPath, device) {
  const userId = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'am', 'get-current-user',
  ]);
  return parseAndroidInstalledPackageSnapshot(
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'dumpsys', 'package', applicationId,
    ]),
    userId,
  );
}

function readPhysicalPermissionState(commandRunner, adbPath, device) {
  const permissionSnapshot = parseAndroidRuntimePermissionSnapshot(
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'dumpsys', 'package', applicationId,
    ]),
  );
  const outputs = Object.fromEntries(runtimePermissions.map((permission) => [
    permission,
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'cmd', 'appops', 'get', applicationId, appOps[permission],
    ]),
  ]));
  return combinePermissionState(permissionSnapshot, parseAndroidAppOpSnapshot(outputs));
}

function setPhysicalGroupGranted(commandRunner, adbPath, device, group, granted) {
  const permissions = granted ? group.permissions : [...group.permissions].reverse();
  for (const permission of permissions) {
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'pm', granted ? 'grant' : 'revoke', '--user', '0', applicationId, permission,
    ]);
  }
}

function mutableFlags(state) {
  const map = new Map([
    ['REVIEW_REQUIRED', 'review-required'],
    ['REVOKED_COMPAT', 'revoked-compat'],
    ['REVOKE_WHEN_REQUESTED', 'revoke-when-requested'],
    ['USER_FIXED', 'user-fixed'],
    ['USER_SET', 'user-set'],
  ]);
  return state.flags.map((flag) => map.get(flag)).filter(Boolean).toSorted();
}

function restorePhysicalPermissionState(commandRunner, adbPath, device, snapshot) {
  const normalized = normalizePermissionState(snapshot);
  for (const permission of runtimePermissions) {
    const state = normalized[permission];
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'pm', state.granted ? 'grant' : 'revoke', '--user', '0', applicationId, permission,
    ]);
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'pm', 'clear-permission-flags', '--user', '0', applicationId, permission,
      ...mutablePermissionFlags,
    ]);
    const wantedFlags = mutableFlags(state);
    if (wantedFlags.length > 0) {
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'pm', 'set-permission-flags', '--user', '0', applicationId, permission,
        ...wantedFlags,
      ]);
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'cmd', 'appops', 'set', applicationId, appOps[permission],
      state.appOpMode,
    ]);
  }
}

async function restartAuthenticated(commandRunner, adbPath, device) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner, adbPath, device, wait,
  });
  tapNamed(commandRunner, adbPath, device, main, 'Mein SIT');
  await waitForLabels(
    commandRunner,
    adbPath,
    device,
    ['Meine Anzeigen', 'Mietanfragen', 'Abmelden'],
    'authenticated profile',
  );
  restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
}

async function openReadOnlyPermissionSettings(commandRunner, adbPath, device) {
  const result = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'am', 'start', '-W',
    '-a', 'android.settings.APPLICATION_DETAILS_SETTINGS',
    '-d', `package:${applicationId}`,
  ]);
  if (!/^Status:\s*ok\s*$/mu.test(result)) {
    fail('Android app settings did not open deterministically.');
  }
  await waitForLabels(
    commandRunner,
    adbPath,
    device,
    ['ShareItToo', 'Berechtigungen'],
    'read-only app permission settings',
  );
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
}

function atomicJournal(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

export function readWp46PermissionJournal(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if ((stat.mode & 0o077) !== 0 || !stat.isFile()) fail('WP46 journal is not owner-only.');
    return JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function parseWp46Arguments(values) {
  const result = {
    candidateDirectory: null,
    adbPath: 'adb',
    aapt2Path: 'aapt2',
    journalPath: resolve(
      homedir(),
      'Library',
      'Application Support',
      'ShareItToo',
      'qa-private',
      'wp46-permission-lifecycle.json',
    ),
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--candidate-dir') result.candidateDirectory = values[++index] ?? fail('--candidate-dir requires a path.');
    else if (value === '--adb') result.adbPath = values[++index] ?? fail('--adb requires a path.');
    else if (value === '--aapt2') result.aapt2Path = values[++index] ?? fail('--aapt2 requires a path.');
    else if (value === '--journal') result.journalPath = values[++index] ?? fail('--journal requires a path.');
    else fail(`Unknown argument: ${value}`);
  }
  if (result.candidateDirectory === null) fail('--candidate-dir is required.');
  return result;
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseWp46Arguments(process.argv.slice(2));
  const archive = await validatePrivateAndroidReleaseArchive({
    root,
    candidateDirectory: args.candidateDirectory,
  });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(
    collectCurrentCandidateDriftPaths({ root, candidateCommit: candidate.commit }),
  );
  const declared = parseDeclaredAndroidPermissions(String(execFileSync(
    args.aapt2Path,
    ['dump', 'permissions', archive.apkPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )));
  const manifestAudit = assertExactDeclaredAndroidPermissions(declared);
  const devices = parseAdbDevices(defaultCurrentHeadAndroidCommandRunner(
    args.adbPath,
    ['devices', '-l'],
  ));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(
    defaultCurrentHeadAndroidCommandRunner,
    args.adbPath,
    device,
  );
  verifyCurrentHeadAndroidInstalledCandidate(
    defaultCurrentHeadAndroidCommandRunner,
    args.adbPath,
    device,
    candidate,
  );
  const installedBefore = packageSnapshot(
    defaultCurrentHeadAndroidCommandRunner,
    args.adbPath,
    device,
  );

  const previous = readWp46PermissionJournal(args.journalPath);
  if (previous?.status === 'in-progress') {
    restorePhysicalPermissionState(
      defaultCurrentHeadAndroidCommandRunner,
      args.adbPath,
      device,
      previous.originalPermissionState,
    );
    if (!exact(
      readPhysicalPermissionState(defaultCurrentHeadAndroidCommandRunner, args.adbPath, device),
      normalizePermissionState(previous.originalPermissionState),
    )) fail('The previous WP46 permission snapshot could not be recovered.');
  }
  const originalPermissionState = readPhysicalPermissionState(
    defaultCurrentHeadAndroidCommandRunner,
    args.adbPath,
    device,
  );
  atomicJournal(args.journalPath, {
    schemaVersion: 1,
    status: 'in-progress',
    candidate: {
      applicationId: candidate.applicationId,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
    },
    originalPermissionState,
    containsCredentials: false,
    containsAccountIdentity: false,
    containsRawDeviceIdentifier: false,
  });

  const lifecycle = await exercisePermissionGroups({
    operations: {
      readState: async () => readPhysicalPermissionState(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
      ),
      setGroupGranted: async (group, granted) => setPhysicalGroupGranted(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
        group,
        granted,
      ),
      restartAuthenticated: async () => restartAuthenticated(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
      ),
      openReadOnlySettings: async () => openReadOnlyPermissionSettings(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
      ),
      restoreState: async (state) => restorePhysicalPermissionState(
        defaultCurrentHeadAndroidCommandRunner,
        args.adbPath,
        device,
        state,
      ),
    },
  });
  const installedAfter = packageSnapshot(
    defaultCurrentHeadAndroidCommandRunner,
    args.adbPath,
    device,
  );
  const evidence = buildWp46PermissionEvidence({
    candidate,
    installedBefore,
    installedAfter,
    deviceSummary,
    manifestAudit,
    lifecycle,
    sourceDrift,
  });
  atomicJournal(args.journalPath, {
    schemaVersion: 1,
    status: 'completed-restored',
    candidate: {
      applicationId: candidate.applicationId,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
    },
    originalPermissionState,
    restoredPermissionState: lifecycle.after,
    recoveryRequired: false,
    containsCredentials: false,
    containsAccountIdentity: false,
    containsRawDeviceIdentifier: false,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP46 permission lifecycle failed.'}\n`);
    process.exitCode = 1;
  }
}
