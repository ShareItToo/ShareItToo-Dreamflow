#!/usr/bin/env node

import { chmodSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
import {
  capturePrivateScreenshot,
  readAndroidNightMode,
  setAndroidNightMode,
} from './diagnose_n28_current_candidate_android_theme_backgrounds.mjs';
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

const backgroundChoices = Object.freeze([
  Object.freeze({ key: 'system', label: 'Systemeinstellung verwenden' }),
  Object.freeze({ key: 'dark-1', label: 'Dark 1 Hintergrund' }),
  Object.freeze({ key: 'dark-2', label: 'Dark 2 Hintergrund' }),
  Object.freeze({ key: 'light-1', label: 'Light 1 Hintergrund' }),
  Object.freeze({ key: 'light-2', label: 'Light 2 Hintergrund' }),
]);
const backgroundChoiceByKey = new Map(backgroundChoices.map((choice) => [choice.key, choice]));
const backgroundOptionLabels = Object.freeze(['Dark 1', 'Dark 2', 'Light 1', 'Light 2']);

function fail(message) {
  throw new Error(message);
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} is not the verified WP100 value.`);
}

function safeResult(value, label) {
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(value))) {
    fail(`${label} evidence contains private or credential-shaped material.`);
  }
  return Object.freeze(value);
}

function candidateSummary(candidate, sourceDrift) {
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  return {
    applicationId: candidate.applicationId,
    versionName: candidate.versionName,
    buildNumber: candidate.buildNumber,
    commit: candidate.commit,
    apkSha256: candidate.android.apkSha256,
    mobileSourceChangedAfterCandidate: false,
  };
}

function baseBoundaries() {
  return {
    privateCapturesAssumedSensitive: true,
    privateCapturesCommitted: false,
    privateCapturesDistributionAllowed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsCredential: false,
    containsRawDeviceIdentifier: false,
    containsPrivateFilesystemPath: false,
    backgroundPreferencePersistentlyChanged: false,
    backgroundPreferenceRestored: true,
    messageSent: false,
    paymentEndpointCalled: false,
    productionChanged: false,
    googlePlayChanged: false,
    onePlusContacted: false,
  };
}

function center(node, label) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (match === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(match[1]) + Number(match[3])) / 2),
    y: Math.floor((Number(match[2]) + Number(match[4])) / 2),
  };
}

function tapUniqueNamed({ commandRunner, adbPath, device, hierarchy, label }) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled.filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const candidates = clickable.length > 0 ? clickable : enabled;
  if (candidates.length !== 1) fail(`The sanitized ${label} action is missing or ambiguous.`);
  const point = center(candidates[0], label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

async function waitForMarkers({
  commandRunner,
  adbPath,
  device,
  markers,
  wait,
  label,
  attempts = 12,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (markers.every((marker) => currentHeadAndroidNamedNodes(hierarchy, marker).length > 0)) {
      return hierarchy;
    }
  }
  fail(`The read-only ${label} surface did not appear.`);
}

function selectedBackgroundChoice(hierarchy) {
  const selected = backgroundChoices.filter((choice) => {
    const nodes = currentHeadAndroidNamedNodes(hierarchy, choice.label)
      .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
      .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
    return nodes.length === 1 && currentHeadAndroidNodeAttribute(nodes[0], 'selected') === 'true';
  });
  if (selected.length !== 1) fail('The current background choice is missing or ambiguous.');
  return selected[0];
}

async function waitForSelectedBackground({ commandRunner, adbPath, device, choice, wait }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(450);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (selectedBackgroundChoice(hierarchy).key === choice.key) return hierarchy;
  }
  fail(`The ${choice.key} background choice did not become authoritative.`);
}

function ensurePrivateCaptureDirectory(privateArtifactDirectory) {
  const directory = resolve(privateArtifactDirectory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  return directory;
}

function preflight({ root, candidateDirectory, commandRunner, adbPath }) {
  return validatePrivateAndroidReleaseArchive({ root, candidateDirectory }).then((archive) => {
    const candidate = validateCurrentPrivateAndroidCandidate(archive);
    const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(
      collectCurrentCandidateDriftPaths({ root, candidateCommit: candidate.commit }),
    );
    const device = selectSinglePhysicalDevice(parseAdbDevices(
      commandRunner(adbPath, ['devices', '-l']),
    ));
    const deviceSummary = inspectPhysicalDevice({ adbPath, device });
    assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
    verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
    return { candidate, sourceDrift, device, deviceSummary };
  });
}

export function summarizeWp100SystemThemeCapture({
  candidate,
  sourceDrift,
  deviceSummary,
  targetMode,
  originalMode,
  restoredMode,
  captureSha256,
  capturedAt,
}) {
  if (!['yes', 'no'].includes(targetMode)) fail('The requested system theme is invalid.');
  if (!/^[a-f0-9]{64}$/u.test(captureSha256 ?? '')) fail('The private system-theme capture hash is invalid.');
  same(restoredMode, originalMode, 'restored Android night mode');
  return safeResult({
    schemaVersion: 1,
    kind: 'sit-wp100-current-candidate-pixel-system-theme-capture',
    status: 'passed-private-system-theme-capture-restored',
    capturedAt,
    candidate: candidateSummary(candidate, sourceDrift),
    device: deviceSummary,
    tests: {
      targetSystemMode: targetMode === 'yes' ? 'dark' : 'light',
      authenticatedMainNavigationVisible: true,
      privateCaptureSha256: captureSha256,
      exactOriginalNightModeRestored: true,
    },
    boundaries: baseBoundaries(),
  }, 'WP100 system theme');
}

export function summarizeWp100BackgroundOptionsPreparation({
  candidate,
  sourceDrift,
  deviceSummary,
  capturedAt,
}) {
  return safeResult({
    schemaVersion: 1,
    kind: 'sit-wp100-current-candidate-pixel-background-options-preparation',
    status: 'prepared-read-only-background-options',
    capturedAt,
    candidate: candidateSummary(candidate, sourceDrift),
    device: deviceSummary,
    tests: {
      accountSettingsRootVerified: true,
      backgroundOptionsVisible: backgroundOptionLabels,
      backgroundChoiceVerified: false,
    },
    boundaries: {
      ...baseBoundaries(),
      privateCapturesAssumedSensitive: false,
      backgroundPreferenceTemporarilyChanged: false,
    },
  }, 'WP100 background-options preparation');
}

export function summarizeWp100BackgroundChoiceCapture({
  candidate,
  sourceDrift,
  deviceSummary,
  targetChoice,
  originalChoice,
  restoredChoice,
  captureSha256,
  capturedAt,
}) {
  if (!backgroundChoiceByKey.has(targetChoice)
      || !backgroundChoiceByKey.has(originalChoice)
      || !backgroundChoiceByKey.has(restoredChoice)) {
    fail('The background-choice capture includes an unsupported choice.');
  }
  same(restoredChoice, originalChoice, 'restored background choice');
  if (!/^[a-f0-9]{64}$/u.test(captureSha256 ?? '')) fail('The private background capture hash is invalid.');
  return safeResult({
    schemaVersion: 1,
    kind: 'sit-wp100-current-candidate-pixel-background-choice-capture',
    status: 'passed-private-background-choice-capture-restored',
    capturedAt,
    candidate: candidateSummary(candidate, sourceDrift),
    device: deviceSummary,
    tests: {
      targetChoice,
      originalChoice,
      selectedSemanticsAuthoritative: true,
      privateCaptureSha256: captureSha256,
      exactOriginalChoiceRestored: true,
    },
    boundaries: {
      ...baseBoundaries(),
      backgroundPreferenceTemporarilyChanged: targetChoice !== originalChoice,
    },
  }, 'WP100 background choice');
}

export function summarizeWp100BackgroundOptionsRestore({
  candidate,
  sourceDrift,
  deviceSummary,
  capturedAt,
}) {
  return safeResult({
    schemaVersion: 1,
    kind: 'sit-wp100-current-candidate-pixel-background-options-restore',
    status: 'passed-background-options-normal-surface-restored',
    capturedAt,
    candidate: candidateSummary(candidate, sourceDrift),
    device: deviceSummary,
    tests: { backgroundOptionsRootVerified: true, normalExploreRestored: true },
    boundaries: baseBoundaries(),
  }, 'WP100 background-options restoration');
}

export async function diagnoseWp100SystemThemeCapture({
  root,
  candidateDirectory,
  privateArtifactDirectory,
  targetMode,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const { candidate, sourceDrift, device, deviceSummary } = await preflight({
    root, candidateDirectory, commandRunner, adbPath,
  });
  const directory = ensurePrivateCaptureDirectory(privateArtifactDirectory);
  const originalMode = readAndroidNightMode(commandRunner, adbPath, device);
  let restoredMode = null;
  try {
    setAndroidNightMode(commandRunner, adbPath, device, targetMode);
    await wait(1200);
    same(readAndroidNightMode(commandRunner, adbPath, device), targetMode, 'target Android night mode');
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
    const captureSha256 = capturePrivateScreenshot(
      commandRunner,
      adbPath,
      device,
      directory,
      `wp100-system-${targetMode === 'yes' ? 'dark' : 'light'}-main.png`,
    );
    setAndroidNightMode(commandRunner, adbPath, device, originalMode);
    await wait(1200);
    restoredMode = readAndroidNightMode(commandRunner, adbPath, device);
    return summarizeWp100SystemThemeCapture({
      candidate, sourceDrift, deviceSummary, targetMode, originalMode, restoredMode, captureSha256, capturedAt,
    });
  } finally {
    if (restoredMode !== originalMode) {
      setAndroidNightMode(commandRunner, adbPath, device, originalMode);
      await wait(1200);
      same(readAndroidNightMode(commandRunner, adbPath, device), originalMode, 'finally-restored Android night mode');
    }
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

export async function prepareWp100BackgroundOptionsFromCurrentSettings({
  root,
  candidateDirectory,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const { candidate, sourceDrift, device, deviceSummary } = await preflight({
    root, candidateDirectory, commandRunner, adbPath,
  });
  let prepared = false;
  try {
    await waitForMarkers({
      commandRunner,
      adbPath,
      device,
      markers: ['Kontoeinstellungen', 'PROFIL', 'SICHERHEIT'],
      wait,
      label: 'current account settings root',
      attempts: 4,
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      if (currentHeadAndroidNamedNodes(hierarchy, 'Hintergrund').length === 1) {
        tapUniqueNamed({ commandRunner, adbPath, device, hierarchy, label: 'Hintergrund' });
        await waitForMarkers({
          commandRunner,
          adbPath,
          device,
          markers: ['Hintergrund', ...backgroundOptionLabels],
          wait,
          label: 'background options',
        });
        prepared = true;
        return summarizeWp100BackgroundOptionsPreparation({
          candidate, sourceDrift, deviceSummary, capturedAt,
        });
      }
      currentHeadAndroidAdb(commandRunner, adbPath, device, [
        'shell', 'input', 'swipe', '720', '2450', '720', '750', '500',
      ]);
      await wait(500);
    }
    fail('The current account-settings background entry was not reachable.');
  } finally {
    if (!prepared) restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

export async function diagnoseWp100BackgroundChoiceFromCurrentOptions({
  root,
  candidateDirectory,
  privateArtifactDirectory,
  targetChoice,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const choice = backgroundChoiceByKey.get(targetChoice);
  if (choice === undefined) fail('The requested background choice is unsupported.');
  const { candidate, sourceDrift, device, deviceSummary } = await preflight({
    root, candidateDirectory, commandRunner, adbPath,
  });
  const directory = ensurePrivateCaptureDirectory(privateArtifactDirectory);
  let originalChoice = null;
  let restoredChoice = null;
  try {
    let hierarchy = await waitForMarkers({
      commandRunner,
      adbPath,
      device,
      markers: ['Hintergrund', ...backgroundOptionLabels],
      wait,
      label: 'current background options',
      attempts: 4,
    });
    originalChoice = selectedBackgroundChoice(hierarchy);
    if (originalChoice.key !== choice.key) {
      tapUniqueNamed({ commandRunner, adbPath, device, hierarchy, label: choice.label });
      hierarchy = await waitForSelectedBackground({ commandRunner, adbPath, device, choice, wait });
    }
    const captureSha256 = capturePrivateScreenshot(
      commandRunner,
      adbPath,
      device,
      directory,
      `wp100-background-${choice.key}.png`,
    );
    if (originalChoice.key !== choice.key) {
      tapUniqueNamed({ commandRunner, adbPath, device, hierarchy, label: originalChoice.label });
      hierarchy = await waitForSelectedBackground({
        commandRunner, adbPath, device, choice: originalChoice, wait,
      });
    }
    restoredChoice = selectedBackgroundChoice(hierarchy);
    return summarizeWp100BackgroundChoiceCapture({
      candidate,
      sourceDrift,
      deviceSummary,
      targetChoice: choice.key,
      originalChoice: originalChoice.key,
      restoredChoice: restoredChoice.key,
      captureSha256,
      capturedAt,
    });
  } finally {
    if (originalChoice !== null && restoredChoice?.key !== originalChoice.key) {
      const hierarchy = await waitForMarkers({
        commandRunner,
        adbPath,
        device,
        markers: ['Hintergrund', ...backgroundOptionLabels],
        wait,
        label: 'background options recovery',
        attempts: 4,
      });
      tapUniqueNamed({ commandRunner, adbPath, device, hierarchy, label: originalChoice.label });
      const recovered = await waitForSelectedBackground({
        commandRunner, adbPath, device, choice: originalChoice, wait,
      });
      same(selectedBackgroundChoice(recovered).key, originalChoice.key, 'finally-restored background choice');
    }
  }
}

export async function restoreWp100BackgroundOptionsToExplore({
  root,
  candidateDirectory,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const { candidate, sourceDrift, device, deviceSummary } = await preflight({
    root, candidateDirectory, commandRunner, adbPath,
  });
  try {
    await waitForMarkers({
      commandRunner,
      adbPath,
      device,
      markers: ['Hintergrund', ...backgroundOptionLabels],
      wait,
      label: 'current background options before restoration',
      attempts: 4,
    });
    currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
  } finally {
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
  return summarizeWp100BackgroundOptionsRestore({
    candidate, sourceDrift, deviceSummary, capturedAt,
  });
}

export function parseWp100ThemePhaseArguments(values) {
  let candidateDirectory = null;
  let privateArtifactDirectory = null;
  let adbPath = 'adb';
  let systemMode = null;
  let prepareBackgroundOptions = false;
  let backgroundChoice = null;
  let restoreExplore = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = resolve(values[index + 1] ?? fail('--candidate-dir requires a path.'));
      index += 1;
    } else if (values[index] === '--private-artifact-dir') {
      privateArtifactDirectory = resolve(values[index + 1] ?? fail('--private-artifact-dir requires a path.'));
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--system-mode') {
      const value = values[index + 1] ?? fail('--system-mode requires dark or light.');
      if (!['dark', 'light'].includes(value)) fail('--system-mode requires dark or light.');
      systemMode = value;
      index += 1;
    } else if (values[index] === '--prepare-background-options-from-current-settings') {
      prepareBackgroundOptions = true;
    } else if (values[index] === '--background-choice') {
      backgroundChoice = values[index + 1] ?? fail('--background-choice requires a supported key.');
      if (!backgroundChoiceByKey.has(backgroundChoice)) fail('--background-choice requires a supported key.');
      index += 1;
    } else if (values[index] === '--restore-explore-from-current-background-options') {
      restoreExplore = true;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  const modeCount = [systemMode !== null, prepareBackgroundOptions, backgroundChoice !== null, restoreExplore]
    .filter(Boolean).length;
  if (modeCount !== 1) fail('Exactly one WP100 theme phase is required.');
  if ((systemMode !== null || backgroundChoice !== null) && privateArtifactDirectory === null) {
    fail('--private-artifact-dir is required for private visual captures.');
  }
  return {
    candidateDirectory,
    privateArtifactDirectory,
    adbPath,
    systemMode,
    prepareBackgroundOptions,
    backgroundChoice,
    restoreExplore,
  };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseWp100ThemePhaseArguments(process.argv.slice(2));
  const result = args.systemMode !== null
    ? await diagnoseWp100SystemThemeCapture({
      root,
      ...args,
      targetMode: args.systemMode === 'dark' ? 'yes' : 'no',
    })
    : args.prepareBackgroundOptions
      ? await prepareWp100BackgroundOptionsFromCurrentSettings({ root, ...args })
      : args.backgroundChoice !== null
        ? await diagnoseWp100BackgroundChoiceFromCurrentOptions({
          root, ...args, targetChoice: args.backgroundChoice,
        })
        : await restoreWp100BackgroundOptionsToExplore({ root, ...args });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP100 theme phase failed.'}\n`);
    process.exitCode = 1;
  }
}
