#!/usr/bin/env node

import { chmodSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  restoreCurrentHeadAndroidExplore,
  verifyCurrentHeadAndroidInstalledCandidate,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  capturePrivateScreenshot,
  openBackgroundOptions,
  readAndroidNightMode,
  setAndroidNightMode,
  tapSingleNamedNode,
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

export const wp42BackgroundChoices = Object.freeze([
  Object.freeze({ key: 'system', label: 'Systemeinstellung verwenden' }),
  Object.freeze({ key: 'dark-1', label: 'Dark 1 Hintergrund' }),
  Object.freeze({ key: 'dark-2', label: 'Dark 2 Hintergrund' }),
  Object.freeze({ key: 'light-1', label: 'Light 1 Hintergrund' }),
  Object.freeze({ key: 'light-2', label: 'Light 2 Hintergrund' }),
]);

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified WP42 value.`);
}

function choiceNode(hierarchy, choice) {
  const nodes = currentHeadAndroidNamedNodes(hierarchy, choice.label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  if (nodes.length !== 1) {
    fail(`The ${choice.key} background choice is missing or ambiguous.`);
  }
  return nodes[0];
}

export function selectedWp42BackgroundChoice(hierarchy) {
  const selected = wp42BackgroundChoices.filter((choice) => (
    currentHeadAndroidNodeAttribute(choiceNode(hierarchy, choice), 'selected') === 'true'
  ));
  if (selected.length !== 1) {
    fail('The current background choice is missing or ambiguous.');
  }
  return selected[0];
}

async function waitForSelectedChoice({
  commandRunner,
  adbPath,
  device,
  choice,
  wait,
}) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    await wait(450);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (selectedWp42BackgroundChoice(hierarchy).key === choice.key) {
      return hierarchy;
    }
  }
  fail(`The ${choice.key} background choice did not become authoritative.`);
}

async function selectChoice({
  hierarchy,
  commandRunner,
  adbPath,
  device,
  choice,
  wait,
}) {
  if (selectedWp42BackgroundChoice(hierarchy).key === choice.key) return hierarchy;
  tapSingleNamedNode(
    commandRunner,
    adbPath,
    device,
    hierarchy,
    choice.label,
  );
  return waitForSelectedChoice({ commandRunner, adbPath, device, choice, wait });
}

export function summarizeWp42ThemeChoices({
  candidate,
  deviceSummary,
  sourceDrift,
  originalChoice,
  restoredChoice,
  originalNightMode,
  restoredNightMode,
  captures,
  capturedAt,
}) {
  same(restoredChoice, originalChoice, 'restored background choice');
  same(restoredNightMode, originalNightMode, 'restored Android night mode');
  same(sourceDrift?.mobileSourceChanged, false, 'post-candidate mobile source');
  const keys = Object.keys(captures ?? {}).toSorted();
  const expectedKeys = wp42BackgroundChoices.map((choice) => choice.key).toSorted();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    fail('The complete five-choice capture set is missing.');
  }
  for (const hash of Object.values(captures)) {
    if (!/^[a-f0-9]{64}$/u.test(hash)) fail('A private choice capture hash is invalid.');
  }
  const result = {
    schemaVersion: 1,
    kind: 'sit-wp42-current-candidate-pixel-theme-choice-diagnostic',
    status: 'passed-five-theme-choices-restored-private-review-pending',
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
      exercisedChoices: wp42BackgroundChoices.map((choice) => choice.key),
      selectedSemanticsAuthoritativeForEveryChoice: true,
      originalChoice,
      exactOriginalChoiceRestored: true,
      exactOriginalNightModeRestored: true,
      visualReview: 'pending-private-captures',
      captureSha256: captures,
    },
    boundaries: {
      privateCapturesAssumedSensitive: true,
      privateCapturesCommitted: false,
      privateCapturesDistributionAllowed: false,
      accountIdentityRecorded: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
      backgroundPreferenceRestored: true,
      accountMutationPerformed: false,
      messageSent: false,
      bookingCreated: false,
      paymentEndpointCalled: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/iu.test(JSON.stringify(result))) {
    fail('WP42 theme-choice evidence contains private or credential-shaped material.');
  }
  return Object.freeze(result);
}

export async function diagnoseWp42CurrentCandidateAndroidThemeChoices({
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

  const directory = resolve(privateArtifactDirectory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const originalNightMode = readAndroidNightMode(commandRunner, adbPath, device);
  let hierarchy = await openBackgroundOptions({ commandRunner, adbPath, device, wait });
  const originalChoice = selectedWp42BackgroundChoice(hierarchy).key;
  let restoredChoice = null;
  let restoredNightMode = null;
  const captures = {};

  try {
    for (const choice of wp42BackgroundChoices) {
      hierarchy = await selectChoice({
        hierarchy,
        commandRunner,
        adbPath,
        device,
        choice,
        wait,
      });
      captures[choice.key] = capturePrivateScreenshot(
        commandRunner,
        adbPath,
        device,
        directory,
        `wp42-${choice.key}.png`,
      );
    }
    const restoreChoice = wp42BackgroundChoices.find((choice) => choice.key === originalChoice)
      ?? fail('The original background choice cannot be restored.');
    hierarchy = await selectChoice({
      hierarchy,
      commandRunner,
      adbPath,
      device,
      choice: restoreChoice,
      wait,
    });
    restoredChoice = selectedWp42BackgroundChoice(hierarchy).key;
    restoredNightMode = readAndroidNightMode(commandRunner, adbPath, device);
    return summarizeWp42ThemeChoices({
      candidate,
      deviceSummary,
      sourceDrift,
      originalChoice,
      restoredChoice,
      originalNightMode,
      restoredNightMode,
      captures,
      capturedAt,
    });
  } finally {
    if (restoredChoice !== originalChoice) {
      hierarchy = await openBackgroundOptions({ commandRunner, adbPath, device, wait });
      const restoreChoice = wp42BackgroundChoices.find((choice) => choice.key === originalChoice)
        ?? fail('The original background choice is unavailable during recovery.');
      hierarchy = await selectChoice({
        hierarchy,
        commandRunner,
        adbPath,
        device,
        choice: restoreChoice,
        wait,
      });
      same(
        selectedWp42BackgroundChoice(hierarchy).key,
        originalChoice,
        'finally-restored background choice',
      );
    }
    if (readAndroidNightMode(commandRunner, adbPath, device) !== originalNightMode) {
      setAndroidNightMode(commandRunner, adbPath, device, originalNightMode);
      await wait(1200);
      same(
        readAndroidNightMode(commandRunner, adbPath, device),
        originalNightMode,
        'finally-restored Android night mode',
      );
    }
    restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
}

export function parseWp42ThemeChoiceArguments(values) {
  let candidateDirectory;
  let privateArtifactDirectory;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = resolve(values[index + 1] ?? fail('--candidate-dir requires a path.'));
      index += 1;
    } else if (values[index] === '--private-artifact-dir') {
      privateArtifactDirectory = resolve(
        values[index + 1] ?? fail('--private-artifact-dir requires a path.'),
      );
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === undefined) fail('--candidate-dir is required.');
  if (privateArtifactDirectory === undefined) fail('--private-artifact-dir is required.');
  return { candidateDirectory, privateArtifactDirectory, adbPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseWp42ThemeChoiceArguments(process.argv.slice(2));
  const result = await diagnoseWp42CurrentCandidateAndroidThemeChoices({ root, ...args });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'WP42 theme-choice diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
