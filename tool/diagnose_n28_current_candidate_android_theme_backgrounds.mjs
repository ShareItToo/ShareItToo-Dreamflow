#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
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

const expectedOptions = Object.freeze(['Dark 1', 'Dark 2', 'Light 1', 'Light 2']);

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N28 value.`);
}

export function parseAndroidNightMode(value) {
  const match = /^Night mode:\s*(yes|no|auto)\s*$/u.exec(String(value).trim());
  if (match === null) fail('Android night mode cannot be restored exactly.');
  return match[1];
}

export function readAndroidNightMode(commandRunner, adbPath, device) {
  return parseAndroidNightMode(currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'cmd', 'uimode', 'night'],
  ));
}

export function setAndroidNightMode(commandRunner, adbPath, device, mode) {
  if (!['yes', 'no', 'auto'].includes(mode)) fail('Unsupported Android night mode.');
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'cmd', 'uimode', 'night', mode],
  );
}

function centerOfNode(node, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  const [, x1, y1, x2, y2] = bounds.map(Number);
  return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
}

export function tapSingleNamedNode(commandRunner, adbPath, device, hierarchy, label) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const candidates = clickable.length > 0 ? clickable : enabled;
  if (candidates.length !== 1) fail(`The sanitized ${label} action is missing or ambiguous.`);
  const point = centerOfNode(candidates[0], label);
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'input', 'tap', String(point.x), String(point.y)],
  );
}

async function waitForLabels({ commandRunner, adbPath, device, labels, wait, failure }) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    await wait(600);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (labels.every((label) => currentHeadAndroidNamedNodes(hierarchy, label).length >= 1)) {
      return hierarchy;
    }
  }
  fail(failure);
}

export function capturePrivateScreenshot(commandRunner, adbPath, device, directory, name) {
  const bytes = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'screencap', '-p'],
    { binary: true },
  );
  if (bytes.length < 10_000) fail('The private N28 screenshot is invalid.');
  const path = resolve(directory, name);
  writeFileSync(path, bytes, { mode: 0o600 });
  chmodSync(path, 0o600);
  return createHash('sha256').update(bytes).digest('hex');
}

async function captureMode({
  mode,
  commandRunner,
  adbPath,
  device,
  candidate,
  directory,
  wait,
}) {
  setAndroidNightMode(commandRunner, adbPath, device, mode);
  await wait(1400);
  same(readAndroidNightMode(commandRunner, adbPath, device), mode, `${mode} system theme`);
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const hierarchy = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  if (currentHeadAndroidNamedNodes(hierarchy, 'Bitte zuerst anmelden').length > 0) {
    fail('The N28 theme capture lost the authenticated synthetic session.');
  }
  const sha256 = capturePrivateScreenshot(
    commandRunner,
    adbPath,
    device,
    directory,
    `n28-${mode === 'yes' ? 'dark' : 'light'}-main.png`,
  );
  return { mode, sha256, candidateBuildNumber: candidate.buildNumber };
}

export async function openBackgroundOptions({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapSingleNamedNode(commandRunner, adbPath, device, main, 'Mein SIT');
  const profile = await waitForLabels({
    commandRunner,
    adbPath,
    device,
    labels: ['Meine Anzeigen', 'Mietanfragen', 'Abmelden', 'Suchen'],
    wait,
    failure: 'The authenticated profile surface did not appear for N28 backgrounds.',
  });
  tapSingleNamedNode(commandRunner, adbPath, device, profile, 'Suchen');
  const search = await waitForLabels({
    commandRunner,
    adbPath,
    device,
    labels: ['Suche schließen'],
    wait,
    failure: 'The profile search surface did not appear for N28 backgrounds.',
  });
  if (currentHeadAndroidNamedNodes(search, 'Suchen').length > 0) {
    fail('The profile search did not enter its focused state for N28 backgrounds.');
  }
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'input', 'text', 'Kontoeinstellungen'],
  );
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'input', 'keyevent', '66'],
  );
  await waitForLabels({
    commandRunner,
    adbPath,
    device,
    labels: ['Kontoeinstellungen', 'PROFIL', 'SICHERHEIT'],
    wait,
    failure: 'The read-only account-settings surface did not appear for N28 backgrounds.',
  });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, 'Hintergrund').length === 1) {
      tapSingleNamedNode(commandRunner, adbPath, device, hierarchy, 'Hintergrund');
      return waitForLabels({
        commandRunner,
        adbPath,
        device,
        labels: ['Hintergrund', ...expectedOptions],
        wait,
        failure: 'The four N28 background options were not all reachable.',
      });
    }
    currentHeadAndroidAdb(
      commandRunner,
      adbPath,
      device,
      ['shell', 'input', 'swipe', '720', '2450', '720', '850', '450'],
    );
    await wait(500);
  }
  fail('The read-only background entry was not reachable in account settings.');
}

export function summarizeN28ThemeBackgrounds({
  candidate,
  deviceSummary,
  sourceDrift,
  originalMode,
  restoredMode,
  dark,
  light,
  backgroundOptionCount,
  backgroundCaptureSha256,
  capturedAt,
}) {
  same(restoredMode, originalMode, 'restored Android night mode');
  same(dark?.mode, 'yes', 'dark mode');
  same(light?.mode, 'no', 'light mode');
  same(dark?.candidateBuildNumber, candidate.buildNumber, 'dark candidate');
  same(light?.candidateBuildNumber, candidate.buildNumber, 'light candidate');
  for (const [label, hash] of [
    ['dark capture', dark?.sha256],
    ['light capture', light?.sha256],
    ['background capture', backgroundCaptureSha256],
  ]) {
    if (!/^[a-f0-9]{64}$/u.test(hash ?? '')) fail(`${label} is invalid.`);
  }
  same(backgroundOptionCount, 4, 'background option count');
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  const result = {
    schemaVersion: 1,
    kind: 'sit-n28-current-candidate-pixel-theme-background-diagnostic',
    status: 'captures-created-visual-review-pending',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      apkSha256: candidate.android.apkSha256,
      mobileSourceChangedAfterCandidate: sourceDrift.mobileSourceChanged,
    },
    device: deviceSummary,
    tests: {
      systemDarkModeApplied: true,
      systemLightModeApplied: true,
      authenticatedSessionRetained: true,
      backgroundOptionsReachable: [...expectedOptions],
      backgroundSelectionChanged: false,
      exactOriginalNightModeRestored: true,
      visualReview: 'pending-private-captures',
      darkCaptureSha256: dark.sha256,
      lightCaptureSha256: light.sha256,
      backgroundCaptureSha256,
    },
    boundaries: {
      privateCapturesAssumedSensitive: true,
      privateCapturesCommitted: false,
      privateCapturesDistributionAllowed: false,
      accountIdentityRecorded: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
      backgroundPreferenceMutated: false,
      supportSubmitted: false,
      messageSent: false,
      paymentEndpointCalled: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('N28 theme evidence contains private or credential-shaped material.');
  }
  return result;
}

export async function diagnoseN28CurrentCandidateAndroidThemeBackgrounds({
  root,
  candidateDirectory,
  privateArtifactDirectory,
  adbPath = 'adb',
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const archive = await validatePrivateAndroidReleaseArchive({ root, candidateDirectory });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const changedPaths = collectCurrentCandidateDriftPaths({
    root,
    candidateCommit: candidate.commit,
  });
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(changedPaths);
  const devices = parseAdbDevices(commandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const originalMode = readAndroidNightMode(commandRunner, adbPath, device);
  const directory = resolve(privateArtifactDirectory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  let restoredMode = null;
  try {
    const dark = await captureMode({
      mode: 'yes', commandRunner, adbPath, device, candidate, directory, wait,
    });
    const light = await captureMode({
      mode: 'no', commandRunner, adbPath, device, candidate, directory, wait,
    });
    const backgroundHierarchy = await openBackgroundOptions({
      commandRunner, adbPath, device, wait,
    });
    const backgroundOptionCount = expectedOptions.filter((label) => (
      currentHeadAndroidNamedNodes(backgroundHierarchy, label).length >= 1
    )).length;
    const backgroundCaptureSha256 = capturePrivateScreenshot(
      commandRunner,
      adbPath,
      device,
      directory,
      'n28-background-options.png',
    );
    setAndroidNightMode(commandRunner, adbPath, device, originalMode);
    await wait(1200);
    restoredMode = readAndroidNightMode(commandRunner, adbPath, device);
    return summarizeN28ThemeBackgrounds({
      candidate,
      deviceSummary,
      sourceDrift,
      originalMode,
      restoredMode,
      dark,
      light,
      backgroundOptionCount,
      backgroundCaptureSha256,
      capturedAt,
    });
  } finally {
    if (restoredMode !== originalMode) {
      setAndroidNightMode(commandRunner, adbPath, device, originalMode);
      await wait(1200);
      same(
        readAndroidNightMode(commandRunner, adbPath, device),
        originalMode,
        'finally-restored Android night mode',
      );
    }
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

function parseArguments(values) {
  let candidateDirectory = null;
  let privateArtifactDirectory = null;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--private-artifact-dir') {
      privateArtifactDirectory = values[index + 1]
        ?? fail('--private-artifact-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) fail('--candidate-dir is required.');
  if (privateArtifactDirectory === null) {
    fail('--private-artifact-dir is required for sensitive screenshots.');
  }
  return {
    candidateDirectory: resolve(candidateDirectory),
    privateArtifactDirectory: resolve(privateArtifactDirectory),
    adbPath,
  };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const result = await diagnoseN28CurrentCandidateAndroidThemeBackgrounds({ root, ...args });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N28 theme/background diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
