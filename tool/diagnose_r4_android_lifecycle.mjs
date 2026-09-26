#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  verifyCurrentHeadAndroidInstalledCandidate,
} from './diagnose_current_head_android_main_navigation.mjs';
import { parseAndroidInstalledPackageSnapshot } from './install_current_head_android_candidate_update.mjs';
import { validateAndroidLocalQaCandidate } from './validate_android_local_qa_candidate.mjs';

const applicationId = 'com.shareittoo.app';
const implementationCommit = '19fc3221bc3879788db9c48b70a89a33656116b6';
const buildNumber = '2026082404';
const navigationLabels = Object.freeze([
  'Entdecken',
  'Mietkorb',
  'Buchungen',
  'Nachrichten',
  'Mein SIT',
]);

function fail(message) {
  throw new Error(message);
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function adb(commandRunner, adbPath, device, args, options) {
  return currentHeadAndroidAdb(commandRunner, adbPath, device, args, options);
}

function processId(commandRunner, adbPath, device) {
  try {
    const value = adb(commandRunner, adbPath, device, [
      'shell', 'pidof', applicationId,
    ]);
    if (!/^\d+(?:\s+\d+)*$/u.test(value)) fail('Android returned an invalid app-process state.');
    return value;
  } catch {
    const state = adb(commandRunner, adbPath, device, ['get-state']);
    if (state !== 'device') fail('The Android device disconnected during R4.');
    return null;
  }
}

function foreground(commandRunner, adbPath, device) {
  return /(?:mResumedActivity|topResumedActivity).*com\.shareittoo\.app\//u.test(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'activity', 'activities']),
  );
}

function launch(commandRunner, adbPath, device) {
  const value = adb(commandRunner, adbPath, device, [
    'shell', 'am', 'start', '-W', '-n', `${applicationId}/.MainActivity`,
  ]);
  if (!/^Status:\s*ok\s*$/mu.test(value)
      || !/^Activity:\s*com\.shareittoo\.app\//mu.test(value)) {
    fail('The R4 ShareItToo activity start was not deterministic.');
  }
}

function packageSnapshot(commandRunner, adbPath, device) {
  const userId = adb(commandRunner, adbPath, device, [
    'shell', 'am', 'get-current-user',
  ]);
  return parseAndroidInstalledPackageSnapshot(
    adb(commandRunner, adbPath, device, [
      'shell', 'dumpsys', 'package', applicationId,
    ]),
    userId,
  );
}

function setting(commandRunner, adbPath, device, name) {
  const value = adb(commandRunner, adbPath, device, [
    'shell', 'settings', 'get', 'system', name,
  ]);
  if (!/^\d+$/u.test(value)) fail('The Android orientation setting could not be read safely.');
  return value;
}

function setSetting(commandRunner, adbPath, device, name, value) {
  adb(commandRunner, adbPath, device, [
    'shell', 'settings', 'put', 'system', name, String(value),
  ]);
}

function cameraPermission(commandRunner, adbPath, device) {
  const dump = adb(commandRunner, adbPath, device, [
    'shell', 'dumpsys', 'package', applicationId,
  ]);
  const match = /^\s*android\.permission\.CAMERA:\s+granted=(true|false),\s+flags=\[([^\]]*)\]/mu
    .exec(dump);
  if (match === null) fail('The Android camera permission state is unavailable.');
  return Object.freeze({
    granted: match[1] === 'true',
    userSet: /\bUSER_SET\b/u.test(match[2]),
    userFixed: /\bUSER_FIXED\b/u.test(match[2]),
  });
}

function nodeCenter(node) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail('A sanitized navigation node has invalid bounds.');
  const values = bounds.slice(1).map(Number);
  return Object.freeze({
    x: Math.floor((values[0] + values[2]) / 2),
    y: Math.floor((values[1] + values[3]) / 2),
  });
}

async function mainNavigation(commandRunner, adbPath, device) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (hierarchy.includes('content-desc="Benachrichtigung:')) {
      adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
      continue;
    }
    if (navigationLabels.every((label) => (
      currentHeadAndroidNamedNodes(hierarchy, label).length >= 1
    ))) return hierarchy;
    if (attempt === 3 || attempt === 7) {
      adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
    }
  }
  fail('The R4 main navigation did not appear.');
}

async function exerciseNavigation(commandRunner, adbPath, device) {
  for (const label of navigationLabels) {
    const hierarchy = await mainNavigation(commandRunner, adbPath, device);
    const candidates = currentHeadAndroidNamedNodes(hierarchy, label);
    const target = candidates.map(nodeCenter).sort((left, right) => right.y - left.y)[0];
    adb(commandRunner, adbPath, device, [
      'shell', 'input', 'tap', String(target.x), String(target.y),
    ]);
    await wait(600);
    if (!foreground(commandRunner, adbPath, device)
        || processId(commandRunner, adbPath, device) === null) {
      fail('ShareItToo lost foreground or process state during repeated navigation.');
    }
    const afterTap = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(afterTap, 'Bitte zuerst anmelden').length >= 1) {
      adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
    }
    launch(commandRunner, adbPath, device);
  }
}

function startLink(commandRunner, adbPath, device, uri) {
  const value = adb(commandRunner, adbPath, device, [
    'shell', 'am', 'start', '-W',
    '-a', 'android.intent.action.VIEW',
    '-c', 'android.intent.category.BROWSABLE',
    '-p', applicationId,
    '-d', uri,
  ]);
  if (!/^Status:\s*ok\s*$/mu.test(value) || !value.includes(applicationId)) {
    fail('The bounded R4 app-link intent did not return to ShareItToo.');
  }
}

function fatalEntries(commandRunner, adbPath, device, pid) {
  if (pid === null) return 0;
  const value = adb(commandRunner, adbPath, device, [
    'logcat', '-d', '--pid', pid.split(/\s+/u)[0], '-v', 'brief', '*:E',
  ]);
  return value.split(/\r?\n/u).filter((line) => (
    /FATAL EXCEPTION|Fatal signal|ANR in com\.shareittoo\.app/u.test(line)
  )).length;
}

export function buildR4AndroidLifecycleEvidence({
  candidate,
  deviceSummary,
  before,
  after,
  observed,
  capturedAt = new Date().toISOString(),
}) {
  if (candidate?.commit !== implementationCommit
      || candidate?.buildNumber !== buildNumber
      || candidate?.applicationId !== applicationId
      || deviceSummary?.physical !== true
      || deviceSummary?.model !== 'Pixel 7 Pro'
      || deviceSummary?.containsRawDeviceIdentifier !== false
      || before?.versionName !== '1.0.0'
      || before?.buildNumber !== buildNumber
      || after?.firstInstallTime !== before.firstInstallTime
      || after?.ceDataInode !== before.ceDataInode
      || after?.versionName !== before.versionName
      || after?.buildNumber !== before.buildNumber) {
    fail('R4 candidate, device or data-preservation evidence is invalid.');
  }
  const required = [
    'exactInstalledCandidate',
    'coldStart',
    'warmStart',
    'processKill',
    'backgroundForeground',
    'repeatedNavigation',
    'orientationChange',
    'orientationRestored',
    'cameraPermissionDeniedObserved',
    'invalidDeepLinkHandled',
    'validDeepLinkHandled',
  ];
  if (required.some((key) => observed?.[key] !== true)
      || observed.navigationDestinationCount !== navigationLabels.length
      || observed.fatalOrAnrEntries !== 0) {
    fail('R4 lifecycle observation is incomplete or unsafe.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-r4-android-lifecycle-device-diagnostic',
    status: 'passed-bounded-device-lifecycle-diagnostic',
    capturedAt,
    source: Object.freeze({
      branch: 'codex/master-workflow-20260808',
      implementationCommit,
      applicationId,
      versionName: '1.0.0',
      buildNumber,
    }),
    device: Object.freeze({ ...deviceSummary }),
    tests: Object.freeze({
      exactInstalledCandidate: 'passed-version-and-apk-hash',
      coldStart: 'passed-force-stop-to-foreground',
      warmStart: 'passed-existing-process-to-foreground',
      processKill: 'passed-process-absent-before-restart',
      backgroundForeground: 'passed-same-process-resume',
      repeatedNavigation: `passed-${navigationLabels.length}-destinations`,
      orientationChange: 'passed-bounded-system-rotation-change',
      orientationRestored: 'passed-exact-original-values',
      cameraPermissionDenied: 'passed-observed-without-permission-mutation',
      deepLinks: 'passed-valid-and-invalid-app-intents',
      fatalOrAnrEntries: 0,
    }),
    boundaries: Object.freeze({
      uiHierarchyPersisted: false,
      screenshotsCaptured: false,
      accountContentRecorded: false,
      rawDeviceIdentifierRecorded: false,
      permissionChanged: false,
      orientationLeftChanged: false,
      networkChanged: false,
      appUninstalled: false,
      appDataReset: false,
      loginPerformed: false,
      logoutPerformed: false,
      listingPublished: false,
      realMoneyUsed: false,
      productionChanged: false,
      storeChanged: false,
      containsSecrets: false,
    }),
  });
}

export async function diagnoseR4AndroidLifecycle({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  capturedAt = new Date().toISOString(),
}) {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const before = packageSnapshot(commandRunner, adbPath, device);
  const originalOrientation = Object.freeze({
    accelerometer: setting(commandRunner, adbPath, device, 'accelerometer_rotation'),
    rotation: setting(commandRunner, adbPath, device, 'user_rotation'),
  });
  const camera = cameraPermission(commandRunner, adbPath, device);
  if (camera.granted) fail('R4 requires the existing denied-camera state; it will not revoke permission.');

  let orientationRestored = false;
  let sameProcessResume = false;
  try {
    adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
    if (processId(commandRunner, adbPath, device) !== null) {
      fail('ShareItToo remained running after the bounded process kill.');
    }
    launch(commandRunner, adbPath, device);
    const coldPid = processId(commandRunner, adbPath, device);
    if (coldPid === null || !foreground(commandRunner, adbPath, device)) {
      fail('ShareItToo did not reach the foreground after cold start.');
    }
    launch(commandRunner, adbPath, device);
    if (processId(commandRunner, adbPath, device) !== coldPid
        || !foreground(commandRunner, adbPath, device)) {
      fail('ShareItToo warm start did not retain the process and foreground state.');
    }
    adb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '3']);
    await wait(700);
    if (processId(commandRunner, adbPath, device) !== coldPid
        || foreground(commandRunner, adbPath, device)) {
      fail('ShareItToo background transition was not observed safely.');
    }
    launch(commandRunner, adbPath, device);
    sameProcessResume = processId(commandRunner, adbPath, device) === coldPid
      && foreground(commandRunner, adbPath, device);
    if (!sameProcessResume) fail('ShareItToo did not resume in the same process.');

    await exerciseNavigation(commandRunner, adbPath, device);

    const targetRotation = String((Number(originalOrientation.rotation) + 1) % 4);
    setSetting(commandRunner, adbPath, device, 'accelerometer_rotation', '0');
    setSetting(commandRunner, adbPath, device, 'user_rotation', targetRotation);
    await wait(1200);
    if (setting(commandRunner, adbPath, device, 'accelerometer_rotation') !== '0'
        || setting(commandRunner, adbPath, device, 'user_rotation') !== targetRotation
        || processId(commandRunner, adbPath, device) === null
        || !foreground(commandRunner, adbPath, device)) {
      fail('The bounded Android orientation transition failed.');
    }

    startLink(commandRunner, adbPath, device, 'shareittoo://notifications/private-id');
    startLink(commandRunner, adbPath, device, 'shareittoo://notifications');
    if (!foreground(commandRunner, adbPath, device)) {
      fail('ShareItToo lost foreground state during bounded app-link intents.');
    }
  } finally {
    setSetting(commandRunner, adbPath, device, 'user_rotation', originalOrientation.rotation);
    setSetting(commandRunner, adbPath, device, 'accelerometer_rotation', originalOrientation.accelerometer);
    await wait(900);
    orientationRestored = setting(commandRunner, adbPath, device, 'user_rotation')
        === originalOrientation.rotation
      && setting(commandRunner, adbPath, device, 'accelerometer_rotation')
        === originalOrientation.accelerometer;
    try {
      launch(commandRunner, adbPath, device);
    } catch {
      // Preserve the primary result. A failed final convenience launch cannot
      // turn a partial run into evidence because the checks below still fail.
    }
  }

  const finalPid = processId(commandRunner, adbPath, device);
  const observed = Object.freeze({
    exactInstalledCandidate: true,
    coldStart: true,
    warmStart: true,
    processKill: true,
    backgroundForeground: sameProcessResume,
    repeatedNavigation: true,
    navigationDestinationCount: navigationLabels.length,
    orientationChange: true,
    orientationRestored,
    cameraPermissionDeniedObserved: camera.granted === false,
    invalidDeepLinkHandled: true,
    validDeepLinkHandled: true,
    fatalOrAnrEntries: fatalEntries(commandRunner, adbPath, device, finalPid),
  });
  const after = packageSnapshot(commandRunner, adbPath, device);
  return buildR4AndroidLifecycleEvidence({
    candidate,
    deviceSummary,
    before,
    after,
    observed,
    capturedAt,
  });
}

async function run() {
  const candidateArchive = await validateAndroidLocalQaCandidate({
    expectedBuildNumber: buildNumber,
    expectedCommit: implementationCommit,
    includePrivateArtifact: true,
  });
  const candidate = Object.freeze({
    ...candidateArchive,
    android: Object.freeze({ apkSha256: candidateArchive.apkSha256 }),
  });
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner('adb', ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ device });
  const evidence = await diagnoseR4AndroidLifecycle({
    device,
    deviceSummary,
    candidate,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'R4 Android lifecycle diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
