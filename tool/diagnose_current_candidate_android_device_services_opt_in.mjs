#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import { loadPf16CurrentCandidate } from './diagnose_pf16_current_candidate_read_only.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';
const pushLabel = 'Push-Mitteilungen auf diesem Gerät';
const crashLabel = 'Freiwillige Crashdiagnose';
const notificationSettingsLabel = 'Benachrichtigungseinstellungen';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function nodeBounds(node, label) {
  const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`${label} has no usable Android bounds.`);
  const [, x1, y1, x2, y2] = bounds.map(Number);
  if (x2 <= x1 || y2 <= y1) fail(`${label} has invalid Android bounds.`);
  return Object.freeze({ x1, y1, x2, y2 });
}

function center(bounds) {
  return Object.freeze({
    x: Math.floor((bounds.x1 + bounds.x2) / 2),
    y: Math.floor((bounds.y1 + bounds.y2) / 2),
  });
}

function tapPoint(commandRunner, adbPath, device, point) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'tap',
    String(point.x),
    String(point.y),
  ]);
}

async function waitForHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  accept,
  label,
}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (accept(hierarchy)) return hierarchy;
  }
  fail(`${label} did not appear on the exact Android candidate.`);
}

function namedClickableNode(hierarchy, label, { highest = false } = {}) {
  const candidates = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true')
    .map((node) => ({ node, bounds: nodeBounds(node, label) }))
    .sort((left, right) => (
      highest ? left.bounds.y1 - right.bounds.y1 : right.bounds.y1 - left.bounds.y1
    ));
  if (candidates.length === 0) fail(`${label} is not an available read-only control.`);
  return candidates[0];
}

function namedNodePresent(hierarchy, label) {
  return currentHeadAndroidNamedNodes(hierarchy, label).length >= 1;
}

function mainNavigationPresent(hierarchy) {
  return ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT']
    .every((label) => namedNodePresent(hierarchy, label));
}

async function openNotificationSettings({ commandRunner, adbPath, device, wait }) {
  let hierarchy = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapPoint(
    commandRunner,
    adbPath,
    device,
    center(namedClickableNode(hierarchy, 'Mein SIT').bounds),
  );
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated Mein SIT profile surface',
    accept: (value) => ['Meine Anzeigen', 'Mietanfragen', 'Abmelden']
      .every((label) => namedNodePresent(value, label)),
  });
  tapPoint(
    commandRunner,
    adbPath,
    device,
    center(namedClickableNode(hierarchy, 'Benachrichtigungen', { highest: true }).bounds),
  );
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated notifications surface',
    accept: (value) => namedNodePresent(value, 'Benachrichtigungen')
      && namedNodePresent(value, 'Mehr Optionen'),
  });
  tapPoint(
    commandRunner,
    adbPath,
    device,
    center(namedClickableNode(hierarchy, 'Mehr Optionen', { highest: true }).bounds),
  );
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'notification options menu',
    accept: (value) => namedNodePresent(value, 'Alle als gelesen markieren')
      && namedNodePresent(value, 'Nur ungelesene anzeigen'),
  });

  // Android clips the first popup row's text from its accessibility hierarchy on
  // this candidate. Target its stable row directly above the fully exposed
  // second row instead of retaining or matching any notification content.
  const secondRow = namedClickableNode(hierarchy, 'Alle als gelesen markieren').bounds;
  const rowHeight = secondRow.y2 - secondRow.y1;
  const firstRowPoint = {
    x: Math.floor((secondRow.x1 + secondRow.x2) / 2),
    y: Math.floor((secondRow.y1 + secondRow.y2) / 2) - rowHeight,
  };
  if (firstRowPoint.y <= 0) fail('The notification-settings popup row is unavailable.');
  tapPoint(commandRunner, adbPath, device, firstRowPoint);
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'notification settings surface',
    accept: (value) => namedNodePresent(value, notificationSettingsLabel),
  });
}

function parseDisplaySize(output) {
  const match = /Physical size:\s*(\d+)x(\d+)/u.exec(output)
    ?? /Override size:\s*(\d+)x(\d+)/u.exec(output);
  if (match === null) fail('The Android display size could not be verified.');
  const [, width, height] = match.map(Number);
  if (width < 600 || height < 900) fail('The Android display size is invalid.');
  return Object.freeze({ width, height });
}

function allNodes(hierarchy) {
  return String(hierarchy).match(/<node\b[^>]*>/gu) ?? [];
}

function containsBounds(outer, inner) {
  return inner.x1 >= outer.x1
    && inner.y1 >= outer.y1
    && inner.x2 <= outer.x2
    && inner.y2 <= outer.y2;
}

export function readDeviceServiceControls(hierarchy) {
  const pushNodes = new Set(currentHeadAndroidNamedNodes(hierarchy, pushLabel));
  const sectionNodes = currentHeadAndroidNamedNodes(hierarchy, crashLabel)
    .filter((node) => pushNodes.has(node));
  if (sectionNodes.length !== 1) {
    fail('The independent Firebase device-service labels are not exposed together.');
  }
  const sectionBounds = nodeBounds(sectionNodes[0], 'Firebase device-services section');
  const switches = allNodes(hierarchy)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.Switch')
    .map((node) => ({
      bounds: nodeBounds(node, 'Firebase device-service switch'),
      checkable: currentHeadAndroidNodeAttribute(node, 'checkable'),
      checked: currentHeadAndroidNodeAttribute(node, 'checked'),
      clickable: currentHeadAndroidNodeAttribute(node, 'clickable'),
      enabled: currentHeadAndroidNodeAttribute(node, 'enabled'),
    }))
    .filter((control) => containsBounds(sectionBounds, control.bounds))
    .sort((left, right) => left.bounds.y1 - right.bounds.y1);
  if (switches.length !== 2
      || switches.some((control) => control.checkable !== 'true'
        || !['true', 'false'].includes(control.checked)
        || control.clickable !== 'true'
        || control.enabled !== 'true')) {
    fail('The two independent Firebase device-service switches are not available.');
  }
  return Object.freeze({
    independentSwitchCount: 2,
    push: Object.freeze({ controlPresent: true, enabled: switches[0].checked === 'true' }),
    crashDiagnostics: Object.freeze({
      controlPresent: true,
      enabled: switches[1].checked === 'true',
    }),
  });
}

export function inspectDeviceServiceControls(hierarchy) {
  const controls = readDeviceServiceControls(hierarchy);
  if (controls.push.enabled || controls.crashDiagnostics.enabled) {
    fail('The Firebase device-service preflight requires both user choices to remain off.');
  }
  return controls;
}

async function revealDeviceServiceControls({
  commandRunner,
  adbPath,
  device,
  wait,
  hierarchy,
}) {
  const display = parseDisplaySize(currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'wm', 'size'],
  ));
  let current = hierarchy;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return Object.freeze({ hierarchy: current, controls: readDeviceServiceControls(current) });
    } catch (error) {
      if (attempt === 3) throw error;
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell',
        'input',
        'swipe',
        String(Math.floor(display.width / 2)),
        String(Math.floor(display.height * 0.82)),
        String(Math.floor(display.width / 2)),
        String(Math.floor(display.height * 0.22)),
        '700',
      ]);
      await wait(700);
      current = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    }
  }
  fail('The Firebase device-service controls are unavailable.');
}

async function restoreExplore({ commandRunner, adbPath, device, wait }) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      if (mainNavigationPresent(hierarchy)) {
        tapPoint(
          commandRunner,
          adbPath,
          device,
          center(namedClickableNode(hierarchy, 'Entdecken').bounds),
        );
        await wait(500);
        return true;
      }
    } catch {
      // Back navigation below remains the bounded restoration route.
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell',
      'input',
      'keyevent',
      '4',
    ]);
    await wait(400);
  }
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const hierarchy = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapPoint(
    commandRunner,
    adbPath,
    device,
    center(namedClickableNode(hierarchy, 'Entdecken').bounds),
  );
  await wait(500);
  return true;
}

export async function inspectCurrentCandidateAndroidDeviceServiceState({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  let first;
  let second;
  let exploreRestored = false;
  try {
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    const settings = await openNotificationSettings({
      commandRunner,
      adbPath,
      device,
      wait,
    });
    const revealed = await revealDeviceServiceControls({
      commandRunner,
      adbPath,
      device,
      wait,
      hierarchy: settings,
    });
    first = revealed.controls;
    await wait(600);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    second = readDeviceServiceControls(hierarchy);
    if (!exact(first, second)) {
      fail('The Firebase device-service choices changed during the read-only preflight.');
    }
    if (namedNodePresent(hierarchy, 'Push-Mitteilungen aktivieren?')
        || namedNodePresent(hierarchy, 'Freiwillige Crashdiagnose aktivieren?')) {
      fail('A Firebase device-service consent dialog opened unexpectedly.');
    }
  } finally {
    exploreRestored = await restoreExplore({ commandRunner, adbPath, device, wait });
  }
  return Object.freeze({
    independentSwitchCount: first.independentSwitchCount,
    pushEnabled: first.push.enabled,
    crashDiagnosticsEnabled: first.crashDiagnostics.enabled,
    exactSecondObservationUnchanged: exact(first, second),
    consentDialogOpened: false,
    exploreSurfaceRestored: exploreRestored,
  });
}

export async function diagnoseCurrentCandidateAndroidDeviceServicesOptIn({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  if (candidate?.commit !== expectedCommit
      || candidate?.buildNumber !== expectedBuildNumber) {
    fail('PF20 requires the exact verified current candidate.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  let first;
  let second;
  let exploreRestored = false;
  try {
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    const settings = await openNotificationSettings({
      commandRunner,
      adbPath,
      device,
      wait,
    });
    const revealed = await revealDeviceServiceControls({
      commandRunner,
      adbPath,
      device,
      wait,
      hierarchy: settings,
    });
    first = inspectDeviceServiceControls(revealed.hierarchy);
    await wait(600);
    second = inspectDeviceServiceControls(
      dumpCurrentHeadAndroidUi(commandRunner, adbPath, device),
    );
    if (!exact(first, second)) {
      fail('The Firebase device-service choices changed during the read-only preflight.');
    }
    if (namedNodePresent(revealed.hierarchy, 'Push-Mitteilungen aktivieren?')
        || namedNodePresent(revealed.hierarchy, 'Freiwillige Crashdiagnose aktivieren?')) {
      fail('A Firebase device-service consent dialog opened unexpectedly.');
    }
  } finally {
    exploreRestored = await restoreExplore({ commandRunner, adbPath, device, wait });
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-firebase-device-services-opt-in-preflight',
    status: 'passed-bounded-default-off-device-services-preflight',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      bundleId: candidate.bundleId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      paymentMode: candidate.paymentMode,
      stripeLivemode: candidate.stripeLivemode,
    },
    installed: {
      packageIdentityVerified: true,
      versionName: installed.versionName,
      buildNumber: installed.buildNumber,
      delivery: installed.delivery,
      apkSha256: installed.apkSha256,
    },
    device: deviceSummary,
    controls: {
      notificationSettingsSurfacePresent: true,
      serviceSectionPresent: true,
      independentSwitchCount: first.independentSwitchCount,
      pushControlPresent: first.push.controlPresent,
      pushEnabled: first.push.enabled,
      crashDiagnosticsControlPresent: first.crashDiagnostics.controlPresent,
      crashDiagnosticsEnabled: first.crashDiagnostics.enabled,
      exactSecondObservationUnchanged: exact(first, second),
      consentDialogOpened: false,
      exploreSurfaceRestored: exploreRestored,
    },
    boundaries: {
      directDiagnosticOnly: true,
      defaultOffControlsObserved: true,
      externalServiceConsentChanged: false,
      pushActivationAttempted: false,
      crashDiagnosticsActivationAttempted: false,
      controlledCrashDiagnosticTriggered: false,
      optInDependentRegistrationOrReportRequested: false,
      realPushPassed: false,
      firebaseOwnerGateSatisfied: false,
      storeInstallationGateSatisfied: false,
      accountMutationPerformed: false,
      loginPerformed: false,
      logoutPerformed: false,
      screenshotCaptured: false,
      rawHierarchyRetained: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  });
}

export function parseDeviceServicesOptInArguments(values) {
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { adbPath };
}

async function run() {
  const { adbPath } = parseDeviceServicesOptInArguments(process.argv.slice(2));
  const { candidate } = await loadPf16CurrentCandidate();
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const evidence = await diagnoseCurrentCandidateAndroidDeviceServicesOptIn({
    adbPath,
    device,
    deviceSummary,
    candidate,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Current-candidate Firebase device-services preflight failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
