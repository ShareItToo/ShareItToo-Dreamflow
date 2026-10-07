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
  restoreCurrentHeadAndroidExplore,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import { loadPf16CurrentCandidate } from './diagnose_pf16_current_candidate_read_only.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const talkBackComponent =
  'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService';
const talkBackPackage = 'com.google.android.marvin.talkback';
const navigationChecks = Object.freeze([
  Object.freeze({
    label: 'Entdecken',
    requiredAll: [],
    requiredAny: ['Jetzt suchen', 'Standort aktualisieren'],
  }),
  Object.freeze({
    label: 'Mietkorb',
    requiredAll: ['Gemerkt'],
    requiredAny: ['Im Mietkorb – noch nicht reserviert', 'Dein Mietkorb', 'Mietkorb'],
  }),
  Object.freeze({
    label: 'Buchungen',
    requiredAll: ['Meine Buchungen'],
    requiredAny: [],
  }),
  Object.freeze({
    label: 'Nachrichten',
    requiredAll: ['Nachrichten-Einstellungen'],
    requiredAny: ['Noch keine Nachrichten', 'Keine aktiven Nachrichten', 'Nachrichten'],
  }),
  Object.freeze({
    label: 'Mein SIT',
    requiredAll: ['Meine Anzeigen', 'Mietanfragen', 'Abmelden'],
    requiredAny: [],
  }),
]);
const traversalOrder = Object.freeze([
  'Mietkorb',
  'Buchungen',
  'Nachrichten',
  'Mein SIT',
  'Entdecken',
]);

function fail(message) {
  throw new Error(message);
}

function readSecureSetting(commandRunner, adbPath, device, key) {
  const raw = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'settings',
    'get',
    'secure',
    key,
  ]);
  if (raw.includes('\n') || raw.includes('\r')) {
    fail(`Android returned an invalid ${key} setting.`);
  }
  return raw;
}

function writeSecureSetting(commandRunner, adbPath, device, key, value) {
  if (value === '') {
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell',
      `settings put secure ${key} ''`,
    ]);
    return;
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'settings',
    value === 'null' ? 'delete' : 'put',
    'secure',
    key,
    ...(value === 'null' ? [] : [value]),
  ]);
}

export function readTalkBackConfiguration(commandRunner, adbPath, device) {
  return Object.freeze({
    accessibilityEnabled: readSecureSetting(
      commandRunner,
      adbPath,
      device,
      'accessibility_enabled',
    ),
    enabledServices: readSecureSetting(
      commandRunner,
      adbPath,
      device,
      'enabled_accessibility_services',
    ),
    touchExplorationEnabled: readSecureSetting(
      commandRunner,
      adbPath,
      device,
      'touch_exploration_enabled',
    ),
    touchExplorationGrantedServices: readSecureSetting(
      commandRunner,
      adbPath,
      device,
      'touch_exploration_granted_accessibility_services',
    ),
    accessibilityKeyGestureTargets: readSecureSetting(
      commandRunner,
      adbPath,
      device,
      'accessibility_key_gesture_targets',
    ),
  });
}

export function exactTalkBackConfiguration(actual, expected) {
  return actual.accessibilityEnabled === expected.accessibilityEnabled
    && actual.enabledServices === expected.enabledServices
    && actual.touchExplorationEnabled === expected.touchExplorationEnabled
    && actual.touchExplorationGrantedServices
      === expected.touchExplorationGrantedServices
    && actual.accessibilityKeyGestureTargets
      === expected.accessibilityKeyGestureTargets;
}

export function restoreTalkBackConfiguration(
  commandRunner,
  adbPath,
  device,
  previous,
) {
  const failures = [];
  for (const [key, value] of [
    ['accessibility_enabled', previous.accessibilityEnabled],
    ['enabled_accessibility_services', previous.enabledServices],
    ['touch_exploration_enabled', previous.touchExplorationEnabled],
    [
      'touch_exploration_granted_accessibility_services',
      previous.touchExplorationGrantedServices,
    ],
    ['accessibility_key_gesture_targets', previous.accessibilityKeyGestureTargets],
  ]) {
    try {
      writeSecureSetting(commandRunner, adbPath, device, key, value);
    } catch {
      failures.push(key);
    }
  }
  if (failures.length > 0) {
    fail('The previous Android accessibility configuration could not be restored.');
  }
  const restored = readTalkBackConfiguration(commandRunner, adbPath, device);
  if (!exactTalkBackConfiguration(restored, previous)) {
    fail('The previous Android accessibility configuration was not restored exactly.');
  }
  return restored;
}

function assertTalkBackAvailable(commandRunner, adbPath, device) {
  const paths = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'pm',
    'path',
    talkBackPackage,
  ]).split(/\r?\n/u).filter(Boolean);
  if (paths.length === 0 || !paths.every((value) => value.startsWith('package:/'))) {
    fail('TalkBack is unavailable on the Android device.');
  }
}

function nodePoint(node, label) {
  const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`${label} has no usable Android bounds.`);
  const [, x1, y1, x2, y2] = bounds.map(Number);
  return Object.freeze({
    x: Math.floor((x1 + x2) / 2),
    y: Math.floor((y1 + y2) / 2),
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

async function waitForNode({
  commandRunner,
  adbPath,
  device,
  wait,
  find,
  label,
}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(500);
    const node = find(dumpCurrentHeadAndroidUi(commandRunner, adbPath, device));
    if (node !== undefined) return node;
  }
  fail(`${label} did not appear in Android accessibility settings.`);
}

function isTalkBackComponent(value) {
  return value === talkBackComponent
    || value === `${talkBackPackage}/.TalkBackService`;
}

function sendTalkBackKeyboardShortcut(commandRunner, adbPath, device) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'keyboard',
    'keycombination',
    '-t',
    '100',
    'KEYCODE_META_LEFT',
    'KEYCODE_ALT_LEFT',
    'KEYCODE_T',
  ]);
}

async function authorizeTalkBackKeyboardShortcut({
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  sendTalkBackKeyboardShortcut(commandRunner, adbPath, device);
  const enableNode = await waitForNode({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'TalkBack keyboard-shortcut authorization control',
    find: (hierarchy) => (
      currentHeadAndroidNamedNodes(hierarchy, 'Tastenkombination aktivieren')[0]
        ?? currentHeadAndroidNamedNodes(hierarchy, 'Enable keyboard shortcut')[0]
    ),
  });
  tapPoint(
    commandRunner,
    adbPath,
    device,
    nodePoint(enableNode, 'TalkBack keyboard-shortcut authorization control'),
  );
  await wait(1000);
  const authorized = readSecureSetting(
    commandRunner,
    adbPath,
    device,
    'accessibility_key_gesture_targets',
  );
  if (!isTalkBackComponent(authorized)) {
    fail('Android did not authorize the official TalkBack keyboard shortcut.');
  }
  sendTalkBackKeyboardShortcut(commandRunner, adbPath, device);
}

async function enableTalkBack({ commandRunner, adbPath, device, wait }) {
  await authorizeTalkBackKeyboardShortcut({ commandRunner, adbPath, device, wait });
  await wait(1500);
  const active = readTalkBackConfiguration(commandRunner, adbPath, device);
  const process = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'pidof',
    talkBackPackage,
  ]);
  const accessibility = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'dumpsys',
    'accessibility',
  ]);
  const runtimeTouchExploration =
    /\btouchExplorationEnabled=true\b/u.test(accessibility);
  return Object.freeze({
    configuration: active,
    serviceProcessActive: /^\d+(?:\s+\d+)*$/u.test(process),
    serviceBound: accessibility.includes(talkBackComponent),
    runtimeTouchExploration,
  });
}

function navigationPoint(hierarchy, label) {
  const candidates = currentHeadAndroidNamedNodes(hierarchy, label)
    .map((node) => nodePoint(node, `${label} TalkBack destination`))
    .sort((left, right) => right.y - left.y);
  if (candidates.length === 0) {
    fail(`The ${label} TalkBack destination is unavailable.`);
  }
  return candidates[0];
}

function surfacePresent(hierarchy, check) {
  const allPresent = check.requiredAll.every((value) => (
    currentHeadAndroidNamedNodes(hierarchy, value).length >= 1
  ));
  const anyPresent = check.requiredAny.length === 0
    || check.requiredAny.some((value) => (
      currentHeadAndroidNamedNodes(hierarchy, value).length >= 1
    ));
  return allPresent
    && anyPresent
    && currentHeadAndroidNamedNodes(hierarchy, 'Bitte zuerst anmelden').length === 0;
}

async function waitForSurface({ commandRunner, adbPath, device, check, wait }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (surfacePresent(hierarchy, check)) return hierarchy;
  }
  fail(`The authenticated ${check.label} TalkBack surface did not appear.`);
}

function focusNavigationDestination(commandRunner, adbPath, device, point) {
  tapPoint(commandRunner, adbPath, device, point);
}

function activateTalkBackFocus(commandRunner, adbPath, device, point) {
  const x = String(point.x);
  const y = String(point.y);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'sh',
    '-c',
    `input tap ${x} ${y} && input tap ${x} ${y}`,
  ]);
}

async function traverseDestination({
  commandRunner,
  adbPath,
  device,
  previousCheck,
  targetCheck,
  wait,
}) {
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  const point = navigationPoint(main, targetCheck.label);
  focusNavigationDestination(commandRunner, adbPath, device, point);
  await wait(650);
  const focused = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  if (!surfacePresent(focused, previousCheck)) {
    fail(`A single TalkBack focus tap unexpectedly activated ${targetCheck.label}.`);
  }
  activateTalkBackFocus(commandRunner, adbPath, device, point);
  await waitForSurface({ commandRunner, adbPath, device, check: targetCheck, wait });
}

export async function traverseCurrentCandidateTalkBackMainNavigation({
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  let previousCheck = navigationChecks[0];
  await waitForSurface({ commandRunner, adbPath, device, check: previousCheck, wait });
  for (const label of traversalOrder) {
    const targetCheck = navigationChecks.find((check) => check.label === label);
    await traverseDestination({
      commandRunner,
      adbPath,
      device,
      previousCheck,
      targetCheck,
      wait,
    });
    previousCheck = targetCheck;
  }
  return Object.freeze(Object.fromEntries(navigationChecks.map((check) => [
    check.label,
    Object.freeze({
      status: 'passed',
      result: 'talkback-focus-before-activation-read-only-surface-reachable',
    }),
  ])));
}

export async function diagnoseCurrentCandidateAndroidTalkBackMainNavigation({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  probeOnly = false,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  assertTalkBackAvailable(commandRunner, adbPath, device);
  const previous = readTalkBackConfiguration(commandRunner, adbPath, device);
  if (previous.accessibilityEnabled !== '0'
      || previous.enabledServices !== 'null'
      || previous.touchExplorationEnabled !== '0'
      || previous.touchExplorationGrantedServices !== 'null'
      || previous.accessibilityKeyGestureTargets !== '') {
    fail('The TalkBack diagnostic requires the known disabled accessibility baseline.');
  }

  let activation;
  let restored;
  let traversalPassed = false;
  try {
    activation = await enableTalkBack({ commandRunner, adbPath, device, wait });
    const ready = activation.configuration.accessibilityEnabled === '1'
      && isTalkBackComponent(activation.configuration.enabledServices)
      && activation.serviceProcessActive
      && activation.serviceBound
      && activation.runtimeTouchExploration;
    if (!ready && !probeOnly) {
      fail(
        'TalkBack did not reach its required runtime touch-exploration state '
        + `(accessibility=${activation.configuration.accessibilityEnabled === '1'}, `
        + `service=${isTalkBackComponent(activation.configuration.enabledServices)}, `
        + `process=${activation.serviceProcessActive}, bound=${activation.serviceBound}, `
        + `runtimeTouch=${activation.runtimeTouchExploration}).`,
      );
    }
    if (ready) {
      await traverseCurrentCandidateTalkBackMainNavigation({
        commandRunner,
        adbPath,
        device,
        wait,
      });
      traversalPassed = true;
    }
  } finally {
    try {
      restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
    } finally {
      restored = restoreTalkBackConfiguration(
        commandRunner,
        adbPath,
        device,
        previous,
      );
    }
  }

  if (!traversalPassed) {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'android-current-candidate-talkback-activation-preflight',
      status: 'blocked-runtime-touch-exploration-not-requested',
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
      activation: {
        officialSettingsAuthorizationCompleted:
          activation.configuration.accessibilityEnabled === '1'
            && isTalkBackComponent(activation.configuration.enabledServices)
            && isTalkBackComponent(
              activation.configuration.accessibilityKeyGestureTargets,
            ),
        serviceProcessActive: activation.serviceProcessActive,
        serviceBound: activation.serviceBound,
        runtimeTouchExplorationEnabled: activation.runtimeTouchExploration,
        runtimeGestureContractSatisfied: false,
        traversalAttempted: false,
        exactPreviousConfigurationRestored:
          exactTalkBackConfiguration(restored, previous),
        accessibilityEnabledAfterDiagnostic: restored.accessibilityEnabled === '1',
        enabledServiceCountAfterDiagnostic: restored.enabledServices === 'null' ? 0 : 1,
        touchExplorationEnabledAfterDiagnostic:
          restored.touchExplorationEnabled === '1',
        touchExplorationGrantCountAfterDiagnostic:
          restored.touchExplorationGrantedServices === 'null' ? 0 : 1,
        keyboardShortcutTargetCountAfterDiagnostic:
          restored.accessibilityKeyGestureTargets === '' ? 0 : 1,
      },
      blockers: ['talkback-service-did-not-request-runtime-touch-exploration'],
      boundaries: {
        talkBackPassClaimed: false,
        manualTalkBackTraversalPassed: false,
        automatedTalkBackMainNavigationPassed: false,
        storeInstallationGateSatisfied: false,
        bookingFlowPassed: false,
        messageSent: false,
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

  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-authenticated-talkback-main-navigation-diagnostic',
    status: 'passed-bounded-authenticated-talkback-main-navigation-diagnostic',
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
    configuration: {
      talkBackPackagePresent: true,
      talkBackEnabledDuringDiagnostic:
        activation.configuration.accessibilityEnabled === '1',
      runtimeTouchExplorationEnabledDuringDiagnostic:
        activation.runtimeTouchExploration,
      previousAccessibilityEnabled: previous.accessibilityEnabled === '1',
      previousEnabledServiceCount: previous.enabledServices === 'null' ? 0 : 1,
      previousTouchExplorationGrantCount:
        previous.touchExplorationGrantedServices === 'null' ? 0 : 1,
      exactPreviousConfigurationRestored:
        exactTalkBackConfiguration(restored, previous),
      accessibilityEnabledAfterDiagnostic: restored.accessibilityEnabled === '1',
      enabledServiceCountAfterDiagnostic: restored.enabledServices === 'null' ? 0 : 1,
      touchExplorationGrantCountAfterDiagnostic:
        restored.touchExplorationGrantedServices === 'null' ? 0 : 1,
      keyboardShortcutTargetCountAfterDiagnostic:
        restored.accessibilityKeyGestureTargets === '' ? 0 : 1,
    },
    tests: Object.fromEntries(navigationChecks.map((check) => [
      check.label,
      {
        status: 'passed',
        result: 'talkback-focus-before-activation-read-only-surface-reachable',
      },
    ])),
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      automatedTalkBackMainNavigationPassed: true,
      manualTalkBackTraversalPassed: false,
      manualVisualReviewPassed: false,
      bookingFlowPassed: false,
      messageSent: false,
      cartMutationPerformed: false,
      accountMutationPerformed: false,
      loginPerformed: false,
      logoutPerformed: false,
      realPushPassed: false,
      screenshotCaptured: false,
      rawHierarchyRetained: false,
      accountIdentityRecorded: false,
      lockCodeUsed: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  });
}

export function parseTalkBackArguments(values) {
  let adbPath = 'adb';
  let probeOnly = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--probe-only') {
      probeOnly = true;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { adbPath, probeOnly };
}

async function run() {
  const { adbPath, probeOnly } = parseTalkBackArguments(process.argv.slice(2));
  const { candidate } = await loadPf16CurrentCandidate();
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const evidence = await diagnoseCurrentCandidateAndroidTalkBackMainNavigation({
    adbPath,
    device,
    deviceSummary,
    candidate,
    probeOnly,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Current-candidate Android TalkBack diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
