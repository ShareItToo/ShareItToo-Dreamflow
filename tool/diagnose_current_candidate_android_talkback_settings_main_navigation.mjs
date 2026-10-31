#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  exactTalkBackConfiguration,
  readTalkBackConfiguration,
  restoreTalkBackConfiguration,
  traverseCurrentCandidateTalkBackMainNavigation,
} from './diagnose_current_candidate_android_talkback_main_navigation.mjs';
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
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';

const talkBackComponent =
  'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService';
const talkBackPackage = 'com.google.android.marvin.talkback';
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

function isTalkBackComponent(value) {
  return value === talkBackComponent
    || value === `${talkBackPackage}/.TalkBackService`;
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

function tapNode(commandRunner, adbPath, device, node, label) {
  const bounds = nodeBounds(node, label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'tap',
    String(Math.floor((bounds.x1 + bounds.x2) / 2)),
    String(Math.floor((bounds.y1 + bounds.y2) / 2)),
  ]);
}

function namedNode(hierarchy, labels, label) {
  for (const candidate of labels) {
    const nodes = currentHeadAndroidNamedNodes(hierarchy, candidate);
    if (nodes.length > 0) return nodes[0];
  }
  fail(`${label} is unavailable in Android Settings.`);
}

function namedNodePresent(hierarchy, labels) {
  return labels.some((label) => currentHeadAndroidNamedNodes(hierarchy, label).length > 0);
}

async function waitForHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  accept,
  label,
}) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await wait(350);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (accept(hierarchy)) return hierarchy;
  }
  fail(`${label} did not appear in Android Settings.`);
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

function assertDisabledBaseline(previous) {
  if (previous.accessibilityEnabled !== '0'
      || previous.enabledServices !== 'null'
      || previous.touchExplorationEnabled !== '0'
      || previous.touchExplorationGrantedServices !== 'null'
      || previous.accessibilityKeyGestureTargets !== '') {
    fail('The TalkBack Settings diagnostic requires the known disabled baseline.');
  }
}

async function openTalkBackSettings({ commandRunner, adbPath, device, wait }) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'am',
    'start',
    '--activity-clear-top',
    '-a',
    'android.settings.ACCESSIBILITY_SETTINGS',
  ]);
  let hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Accessibility root',
    accept: (value) => namedNodePresent(value, ['Bedienungshilfen', 'Accessibility'])
      && namedNodePresent(value, ['Screenreader', 'Screen readers'])
      && namedNodePresent(value, ['TalkBack']),
  });
  tapNode(
    commandRunner,
    adbPath,
    device,
    namedNode(hierarchy, ['TalkBack'], 'TalkBack Settings row'),
    'TalkBack Settings row',
  );
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'TalkBack service details',
    accept: (value) => namedNodePresent(value, ['TalkBack verwenden', 'Use TalkBack'])
      && namedNodePresent(value, ['Kurzbefehl für TalkBack', 'TalkBack shortcut']),
  });
  return hierarchy;
}

async function enableTalkBackThroughSettings({
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  const hierarchy = await openTalkBackSettings({ commandRunner, adbPath, device, wait });
  tapNode(
    commandRunner,
    adbPath,
    device,
    namedNode(
      hierarchy,
      ['TalkBack verwenden', 'Use TalkBack'],
      'TalkBack service toggle',
    ),
    'TalkBack service toggle',
  );

  let confirmationAccepted = false;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await wait(350);
    const configuration = readTalkBackConfiguration(commandRunner, adbPath, device);
    if (configuration.accessibilityEnabled === '1'
        && isTalkBackComponent(configuration.enabledServices)) break;
    const dialog = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const confirmationNodes = [
      ...currentHeadAndroidNamedNodes(dialog, 'Zulassen'),
      ...currentHeadAndroidNamedNodes(dialog, 'Allow'),
      ...currentHeadAndroidNamedNodes(dialog, 'Erlauben'),
    ].filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
    if (confirmationNodes.length > 0) {
      tapNode(
        commandRunner,
        adbPath,
        device,
        confirmationNodes[0],
        'TalkBack Android confirmation',
      );
      confirmationAccepted = true;
    }
  }
  await wait(1200);
  const configuration = readTalkBackConfiguration(commandRunner, adbPath, device);
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
  const runtimeTouchExplorationSignals = [...accessibility.matchAll(
    /\btouchExplorationEnabled\s*[:=]\s*(true|false)/giu,
  )].map((match) => match[1].toLowerCase() === 'true');
  return Object.freeze({
    configuration,
    settingsSurfaceOpened: true,
    settingsTogglePresent: true,
    confirmationAccepted,
    serviceProcessActive: /^\d+(?:\s+\d+)*$/u.test(process),
    serviceBound: accessibility.includes(talkBackComponent),
    runtimeTouchExplorationSignals: Object.freeze(runtimeTouchExplorationSignals),
    runtimeTouchExploration: runtimeTouchExplorationSignals.includes(true),
  });
}

async function restoreExplore({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const hierarchy = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  const explore = currentHeadAndroidNamedNodes(hierarchy, 'Entdecken')
    .map((node) => ({ node, bounds: nodeBounds(node, 'Entdecken') }))
    .sort((left, right) => right.bounds.y1 - left.bounds.y1)[0];
  if (explore === undefined) fail('The Explore restoration target is unavailable.');
  tapNode(commandRunner, adbPath, device, explore.node, 'Entdecken');
  await wait(500);
  return true;
}

export async function diagnoseCurrentCandidateAndroidTalkBackSettingsMainNavigation({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  probeOnly = false,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  if (candidate?.applicationId !== 'com.shareittoo.app'
      || candidate?.bundleId !== 'com.shareittoo.app'
      || !/^\d{10}$/u.test(candidate?.buildNumber ?? '')
      || !/^[a-f0-9]{40}$/u.test(candidate?.commit ?? '')
      || !/^[a-f0-9]{64}$/u.test(candidate?.android?.apkSha256 ?? '')
      || candidate?.releaseChannel !== 'internal'
      || candidate?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || candidate?.firebaseConfigured !== true
      || candidate?.paymentMode !== 'memory'
      || candidate?.stripeLivemode !== false) {
    fail('TalkBack Settings requires an exact verified Internal Staging candidate.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  assertTalkBackAvailable(commandRunner, adbPath, device);
  const previous = readTalkBackConfiguration(commandRunner, adbPath, device);
  assertDisabledBaseline(previous);

  let activation;
  let tests = null;
  let restored;
  let exploreRestored = false;
  try {
    activation = await enableTalkBackThroughSettings({
      commandRunner,
      adbPath,
      device,
      wait,
    });
    const ready = activation.configuration.accessibilityEnabled === '1'
      && isTalkBackComponent(activation.configuration.enabledServices)
      && activation.serviceProcessActive
      && activation.serviceBound
      && activation.runtimeTouchExploration;
    if (!ready && !probeOnly) {
      fail(
        'TalkBack Settings did not reach the required runtime touch-exploration state '
        + `(accessibility=${activation.configuration.accessibilityEnabled === '1'}, `
        + `service=${isTalkBackComponent(activation.configuration.enabledServices)}, `
        + `process=${activation.serviceProcessActive}, bound=${activation.serviceBound}, `
        + `runtimeTouch=${activation.runtimeTouchExploration}).`,
      );
    }
    if (ready) {
      tests = await traverseCurrentCandidateTalkBackMainNavigation({
        commandRunner,
        adbPath,
        device,
        wait,
      });
    }
  } finally {
    restored = restoreTalkBackConfiguration(commandRunner, adbPath, device, previous);
    exploreRestored = await restoreExplore({ commandRunner, adbPath, device, wait });
  }

  const common = {
    schemaVersion: 1,
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
  };
  const configuration = {
    settingsSurfaceOpened: activation.settingsSurfaceOpened,
    settingsTogglePresent: activation.settingsTogglePresent,
    confirmationAccepted: activation.confirmationAccepted,
    talkBackEnabledDuringDiagnostic:
      activation.configuration.accessibilityEnabled === '1'
        && isTalkBackComponent(activation.configuration.enabledServices),
    serviceProcessActive: activation.serviceProcessActive,
    serviceBound: activation.serviceBound,
    runtimeTouchExplorationEnabledDuringDiagnostic:
      activation.runtimeTouchExploration,
    secureTouchExplorationEnabledDuringDiagnostic:
      activation.configuration.touchExplorationEnabled === '1',
    secureTouchExplorationGrantPresentDuringDiagnostic:
      isTalkBackComponent(
        activation.configuration.touchExplorationGrantedServices,
      ),
    runtimeTouchExplorationSignalCount:
      activation.runtimeTouchExplorationSignals.length,
    runtimeTouchExplorationTrueSignalCount:
      activation.runtimeTouchExplorationSignals.filter(Boolean).length,
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
    exploreSurfaceRestored: exploreRestored,
  };
  if (tests === null) {
    return Object.freeze({
      ...common,
      kind: 'android-current-candidate-talkback-settings-activation-preflight',
      status: 'blocked-settings-runtime-touch-exploration-unavailable',
      configuration,
      blockers: ['talkback-settings-did-not-reach-runtime-touch-exploration'],
      boundaries: {
        talkBackPassClaimed: false,
        automatedTalkBackMainNavigationPassed: false,
        manualTalkBackTraversalPassed: false,
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
    ...common,
    kind: 'android-current-candidate-authenticated-talkback-settings-main-navigation-diagnostic',
    status: 'passed-bounded-authenticated-talkback-settings-main-navigation-diagnostic',
    configuration,
    tests,
    boundaries: {
      directDiagnosticOnly: true,
      settingsActivationPassed: true,
      automatedTalkBackMainNavigationPassed: true,
      manualTalkBackTraversalPassed: false,
      manualVisualReviewPassed: false,
      storeInstallationGateSatisfied: false,
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

export function parseTalkBackSettingsArguments(values) {
  let adbPath = 'adb';
  let probeOnly = false;
  let candidateDirectory;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--probe-only') {
      probeOnly = true;
    } else if (values[index] === '--candidate-dir') {
      candidateDirectory = resolve(
        values[index + 1] ?? fail('--candidate-dir requires a path.'),
      );
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return {
    adbPath,
    probeOnly,
    ...(candidateDirectory === undefined ? {} : { candidateDirectory }),
  };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { adbPath, probeOnly, candidateDirectory } =
    parseTalkBackSettingsArguments(process.argv.slice(2));
  let candidate;
  if (candidateDirectory === undefined) {
    ({ candidate } = await loadPf16CurrentCandidate());
  } else {
    const archive = await validatePrivateAndroidReleaseArchive({
      root,
      candidateDirectory,
    });
    candidate = validateCurrentPrivateAndroidCandidate(archive);
    const changedPaths = collectCurrentCandidateDriftPaths({
      root,
      candidateCommit: candidate.commit,
    });
    assertCurrentCandidateNoPostCandidateMobileSourceDrift(changedPaths);
  }
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const evidence = await diagnoseCurrentCandidateAndroidTalkBackSettingsMainNavigation({
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
      `ERROR: ${error?.message ?? 'Current-candidate TalkBack Settings diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
