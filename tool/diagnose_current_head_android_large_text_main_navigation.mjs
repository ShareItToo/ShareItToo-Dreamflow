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
  launchCurrentHeadAndroidCandidate,
  restoreCurrentHeadAndroidExplore,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  loadCurrentHeadAndroidDeviceCandidate,
} from './validate_current_head_android_candidate.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';
import {
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';

const targetFontScale = 2;
export const largeTextNavigationChecks = Object.freeze([
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
const largeTextNavigationCheckByLabel = new Map(
  largeTextNavigationChecks.map((check) => [check.label, check]),
);

function fail(message) {
  throw new Error(message);
}

function validateLargeTextChecks(checks) {
  if (!Array.isArray(checks)
      || checks.length === 0
      || checks.some((check) => !largeTextNavigationCheckByLabel.has(check?.label))
      || new Set(checks.map((check) => check.label)).size !== checks.length) {
    fail('The requested large-text navigation diagnostic scope is invalid.');
  }
  return checks.map((check) => largeTextNavigationCheckByLabel.get(check.label));
}

export function parseAndroidFontScale(value) {
  const normalized = String(value).trim();
  if (normalized === 'null') return null;
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) {
    fail('Android returned an invalid system font scale.');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 3) {
    fail('Android returned an unsupported system font scale.');
  }
  return parsed;
}

export function readAndroidFontScale(commandRunner, adbPath, device) {
  const raw = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'settings', 'get', 'system', 'font_scale'],
  );
  return { raw, value: parseAndroidFontScale(raw) };
}

export function setAndroidFontScale(commandRunner, adbPath, device, value) {
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'settings', 'put', 'system', 'font_scale', String(value)],
  );
}

export function restoreAndroidFontScale(commandRunner, adbPath, device, previous) {
  if (previous.value === null) {
    currentHeadAndroidAdb(
      commandRunner,
      adbPath,
      device,
      ['shell', 'settings', 'delete', 'system', 'font_scale'],
    );
  } else {
    setAndroidFontScale(commandRunner, adbPath, device, previous.raw);
  }
  const restored = readAndroidFontScale(commandRunner, adbPath, device);
  const exact = previous.value === null
    ? restored.value === null
    : restored.value === previous.value;
  if (!exact) {
    fail('The previous Android system font scale was not restored exactly.');
  }
  return restored.value;
}

function tapBottomNavigationLabel(commandRunner, adbPath, device, hierarchy, label) {
  const candidates = currentHeadAndroidNamedNodes(hierarchy, label)
    .map((node) => {
      const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
        currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
      );
      if (bounds === null) return null;
      const [, x1, y1, x2, y2] = bounds.map(Number);
      return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
    })
    .filter((value) => value !== null)
    .sort((left, right) => right.y - left.y);
  if (candidates.length === 0) {
    fail(`The ${label} bottom-navigation destination is unavailable at large text.`);
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'tap',
    String(candidates[0].x),
    String(candidates[0].y),
  ]);
}

async function openAndVerifyLargeTextNavigation({
  commandRunner,
  adbPath,
  device,
  check,
  wait,
}) {
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapBottomNavigationLabel(commandRunner, adbPath, device, main, check.label);
  const observedAll = new Set();
  let observedAny = check.requiredAny.length === 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(600);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, 'Bitte zuerst anmelden').length >= 1) {
      fail(`The authenticated ${check.label} large-text surface was replaced by a login gate.`);
    }
    for (const label of check.requiredAll) {
      if (currentHeadAndroidNamedNodes(hierarchy, label).length >= 1) observedAll.add(label);
    }
    if (check.requiredAny.some((label) => (
      currentHeadAndroidNamedNodes(hierarchy, label).length >= 1
    ))) {
      observedAny = true;
    }
    if (observedAll.size === check.requiredAll.length && observedAny) return;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell',
      'input',
      'swipe',
      '500',
      '1800',
      '500',
      '700',
      '300',
    ]);
    await wait(350);
  }
  fail(`The authenticated ${check.label} large-text surface was not fully reachable.`);
}

export async function diagnoseCurrentHeadAndroidLargeTextMainNavigation({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  checks = largeTextNavigationChecks,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const selectedChecks = validateLargeTextChecks(checks);
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  const previous = readAndroidFontScale(commandRunner, adbPath, device);
  let restoredFontScale;
  try {
    setAndroidFontScale(commandRunner, adbPath, device, targetFontScale);
    await wait(1200);
    const active = readAndroidFontScale(commandRunner, adbPath, device);
    if (active.value === null || active.value < targetFontScale) {
      fail('Android did not apply the required 200 percent system font scale.');
    }
    try {
      launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
      for (const check of selectedChecks) {
        await openAndVerifyLargeTextNavigation({
          commandRunner,
          adbPath,
          device,
          check,
          wait,
        });
      }
    } finally {
      restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
    }
  } finally {
    restoredFontScale = restoreAndroidFontScale(
      commandRunner,
      adbPath,
      device,
      previous,
    );
  }

  const complete = selectedChecks.length === largeTextNavigationChecks.length;
  return {
    schemaVersion: 1,
    kind: 'android-current-head-authenticated-large-text-main-navigation-diagnostic',
    status: complete
      ? 'passed-bounded-authenticated-large-text-main-navigation-diagnostic'
      : 'passed-bounded-authenticated-large-text-main-navigation-subset',
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
      previousFontScale: previous.value,
      targetFontScale,
      fontScaleAtLeast200PercentDuringDiagnostic: true,
      restoredFontScale,
      exactPreviousFontScaleRestored: true,
    },
    tests: Object.fromEntries(selectedChecks.map((check) => [
      check.label,
      {
        status: 'passed',
        result: 'authenticated-read-only-surface-reachable-at-200-percent-text',
      },
    ])),
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      authenticatedMainNavigationAtLargeTextPassed: complete,
      completeLargeTextNavigationMatrixPassed: complete,
      ...(complete ? {} : { largeTextDestinationsTested: selectedChecks.map((check) => check.label) }),
      manualVisualLargeTextReviewPassed: false,
      manualTalkBackTraversalPassed: false,
      talkBackSettingModified: false,
      screenshotCaptured: false,
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
      containsReviewCredentials: false,
    },
  };
}

export function parseLargeTextMainNavigationArguments(values) {
  let currentHead = false;
  let adbPath = 'adb';
  let candidateDirectory = null;
  let onlyLabel = null;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--current-head') {
      currentHead = true;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--only') {
      onlyLabel = values[index + 1] ?? fail('--only requires one exact navigation label.');
      if (!largeTextNavigationCheckByLabel.has(onlyLabel)) {
        fail('--only must name one supported large-text navigation label.');
      }
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (!currentHead) fail('The large-text diagnostic requires --current-head.');
  return { currentHead, adbPath, candidateDirectory, onlyLabel };
}

async function run() {
  const args = parseLargeTextMainNavigationArguments(process.argv.slice(2));
  const candidate = args.candidateDirectory === null
    ? await loadCurrentHeadAndroidDeviceCandidate()
    : validateCurrentPrivateAndroidCandidate(await validatePrivateAndroidReleaseArchive({
      candidateDirectory: args.candidateDirectory,
    }));
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = await diagnoseCurrentHeadAndroidLargeTextMainNavigation({
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    ...(args.onlyLabel === null
      ? {}
      : { checks: [largeTextNavigationCheckByLabel.get(args.onlyLabel)] }),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'Current-head Android large-text diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
