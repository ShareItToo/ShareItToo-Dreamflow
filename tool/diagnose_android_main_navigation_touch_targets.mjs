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
  launchCurrentHeadAndroidCandidate,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  readAndroidFontScale,
  restoreAndroidFontScale,
  setAndroidFontScale,
} from './diagnose_current_head_android_large_text_main_navigation.mjs';
import {
  validateCurrentHeadAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

export const androidTouchTargetMinimumDp = 48;
export const androidTouchTargetFontScale = 2;
export const androidMainNavigationLabels = Object.freeze([
  'Entdecken',
  'Mietkorb',
  'Buchungen',
  'Nachrichten',
  'Mein SIT',
]);

function fail(message) {
  throw new Error(message);
}

export function parseAndroidEffectiveDisplayMetrics(sizeOutput, densityOutput) {
  const sizes = [...String(sizeOutput).matchAll(
    /^(Physical|Override) size:\s*(\d+)x(\d+)\s*$/gimu,
  )];
  const densities = [...String(densityOutput).matchAll(
    /^(Physical|Override) density:\s*(\d+)\s*$/gimu,
  )];
  const size = sizes.find((match) => match[1].toLowerCase() === 'override')
    ?? sizes.find((match) => match[1].toLowerCase() === 'physical');
  const density = densities.find((match) => match[1].toLowerCase() === 'override')
    ?? densities.find((match) => match[1].toLowerCase() === 'physical');
  const widthPixels = Number(size?.[2]);
  const heightPixels = Number(size?.[3]);
  const densityDpi = Number(density?.[2]);
  if (!Number.isInteger(widthPixels)
      || !Number.isInteger(heightPixels)
      || !Number.isInteger(densityDpi)
      || widthPixels < 320
      || heightPixels < 320
      || densityDpi < 120
      || densityDpi > 1000) {
    fail('Android returned invalid effective display metrics.');
  }
  return Object.freeze({ widthPixels, heightPixels, densityDpi });
}

function parseBounds(value) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(value ?? '');
  if (match === null) fail('A navigation target has invalid Android bounds.');
  const [, x1, y1, x2, y2] = match.map(Number);
  if (x2 <= x1 || y2 <= y1) fail('A navigation target has empty Android bounds.');
  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

function rectanglesOverlap(left, right) {
  return Math.max(left.x1, right.x1) < Math.min(left.x2, right.x2)
    && Math.max(left.y1, right.y1) < Math.min(left.y2, right.y2);
}

export function evaluateAndroidMainNavigationTouchTargets({ hierarchy, metrics }) {
  const targets = androidMainNavigationLabels.map((label) => {
    const nodes = currentHeadAndroidNamedNodes(hierarchy, label).filter((node) => (
      currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.Button'
      && currentHeadAndroidNodeAttribute(node, 'clickable') === 'true'
      && currentHeadAndroidNodeAttribute(node, 'enabled') === 'true'
    ));
    if (nodes.length !== 1) {
      fail(`Expected exactly one enabled clickable Android Button for ${label}.`);
    }
    return { label, bounds: parseBounds(currentHeadAndroidNodeAttribute(nodes[0], 'bounds')) };
  });
  const uniqueBounds = new Set(targets.map(({ bounds }) => (
    `${bounds.x1},${bounds.y1},${bounds.x2},${bounds.y2}`
  )));
  if (uniqueBounds.size !== androidMainNavigationLabels.length) {
    fail('Main-navigation touch targets do not have five unique bounds.');
  }
  for (const { bounds } of targets) {
    if (bounds.x1 < 0
        || bounds.y1 < 0
        || bounds.x2 > metrics.widthPixels
        || bounds.y2 > metrics.heightPixels) {
      fail('A main-navigation touch target extends outside the effective display.');
    }
  }
  for (let left = 0; left < targets.length; left += 1) {
    for (let right = left + 1; right < targets.length; right += 1) {
      if (rectanglesOverlap(targets[left].bounds, targets[right].bounds)) {
        fail('Main-navigation touch targets overlap.');
      }
    }
  }
  const pixelsPerDp = metrics.densityDpi / 160;
  const widthsDp = targets.map(({ bounds }) => bounds.width / pixelsPerDp);
  const heightsDp = targets.map(({ bounds }) => bounds.height / pixelsPerDp);
  const minimumWidthDp = Math.min(...widthsDp);
  const minimumHeightDp = Math.min(...heightsDp);
  if (minimumWidthDp < androidTouchTargetMinimumDp
      || minimumHeightDp < androidTouchTargetMinimumDp) {
    fail(
      `A main-navigation target is smaller than ${androidTouchTargetMinimumDp}dp.`,
    );
  }
  const round = (value) => Math.round(value * 100) / 100;
  return Object.freeze({
    targetCount: targets.length,
    minimumWidthDp: round(minimumWidthDp),
    minimumHeightDp: round(minimumHeightDp),
    allTargetsAtLeast48Dp: true,
    allTargetsWithinDisplay: true,
    allTargetsPairwiseNonOverlapping: true,
    allTargetsEnabledClickableAndroidButtons: true,
  });
}

export async function diagnoseAndroidMainNavigationTouchTargets({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
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
  const previous = readAndroidFontScale(commandRunner, adbPath, device);
  let restoredFontScale;
  let result;
  try {
    setAndroidFontScale(
      commandRunner,
      adbPath,
      device,
      androidTouchTargetFontScale,
    );
    await wait(1200);
    const active = readAndroidFontScale(commandRunner, adbPath, device);
    if (active.value === null || active.value < androidTouchTargetFontScale) {
      fail('Android did not apply the required 200 percent system font scale.');
    }
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    const hierarchy = await waitForCurrentHeadAndroidMainNavigation({
      commandRunner,
      adbPath,
      device,
      wait,
    });
    const metrics = parseAndroidEffectiveDisplayMetrics(
      currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'wm', 'size'],
      ),
      currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'wm', 'density'],
      ),
    );
    const geometry = evaluateAndroidMainNavigationTouchTargets({
      hierarchy,
      metrics,
    });
    result = { metrics, geometry };
  } finally {
    restoredFontScale = restoreAndroidFontScale(
      commandRunner,
      adbPath,
      device,
      previous,
    );
  }

  return {
    schemaVersion: 1,
    kind: 'android-current-head-main-navigation-touch-target-diagnostic',
    status: 'passed-physical-200-percent-touch-target-geometry',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
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
      previousFontScale: previous.value,
      targetFontScale: androidTouchTargetFontScale,
      fontScaleAtLeast200PercentDuringDiagnostic: true,
      restoredFontScale,
      exactPreviousFontScaleRestored: true,
    },
    display: {
      widthPixels: result.metrics.widthPixels,
      heightPixels: result.metrics.heightPixels,
      effectiveDensityDpi: result.metrics.densityDpi,
    },
    touchTargets: result.geometry,
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      authenticatedMainNavigationPassed: true,
      manualVisualReviewPassed: false,
      manualTalkBackTraversalPassed: false,
      talkBackSettingModified: false,
      screenshotCaptured: false,
      rawHierarchyRetained: false,
      bookingFlowPassed: false,
      messageSent: false,
      cartMutationPerformed: false,
      accountMutationPerformed: false,
      loginPerformed: false,
      logoutPerformed: false,
      accountIdentityRecorded: false,
      lockCodeUsed: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  };
}

function parseArguments(values) {
  let candidateDirectory;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { candidateDirectory, adbPath };
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  const candidate = await validateCurrentHeadAndroidReleaseArchive({
    candidateDirectory: args.candidateDirectory,
  });
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = await diagnoseAndroidMainNavigationTouchTargets({
    adbPath: args.adbPath,
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
      `ERROR: ${error?.message ?? 'Android touch-target diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
