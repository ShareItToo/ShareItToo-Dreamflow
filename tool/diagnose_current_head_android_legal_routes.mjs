#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

export const legalChecks = Object.freeze([
  Object.freeze({ label: 'Impressum', marker: 'Anbieter' }),
  Object.freeze({ label: 'Datenschutz', marker: 'Welche Daten Nutzer angeben' }),
  Object.freeze({ label: 'AGB', marker: 'Geltungsbereich und Dokumentenstand' }),
  Object.freeze({ label: 'Community‑Regeln', marker: 'Erlaubte Inhalte' }),
  Object.freeze({ label: 'Gebühren & Zahlungsbedingungen', marker: 'Plattformgebühr' }),
  Object.freeze({ label: 'Stornierungsbedingungen', marker: 'Wann kann storniert werden?' }),
  Object.freeze({ label: 'Haftungsausschluss', marker: 'Rolle der Plattform' }),
]);
const legalCheckByLabel = new Map(legalChecks.map((check) => [check.label, check]));

function fail(message) {
  throw new Error(message);
}

function collectCurrentCandidateLegalDrift({ root, candidateCommit, gitRunner = execFileSync }) {
  if (typeof candidateCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(candidateCommit)) {
    fail('The legal-route candidate commit is invalid.');
  }
  const output = String(gitRunner('git', ['diff', '--name-only', `${candidateCommit}..HEAD`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
  const mobilePaths = output
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((path) => /^(?:lib\/|android\/|assets\/|pubspec\.yaml$|pubspec\.lock$)/u.test(path));
  if (mobilePaths.length > 0) {
    fail('Android application source changed after the verified private legal-route candidate.');
  }
  return Object.freeze({ mobileSourceChanged: false });
}

function candidateFromPrivateArchive(archive) {
  const apkSha256 = archive?.android?.apkSha256 ?? archive?.apkSha256;
  if (typeof archive?.applicationId !== 'string'
      || typeof archive?.bundleId !== 'string'
      || typeof archive?.versionName !== 'string'
      || typeof archive?.buildNumber !== 'string'
      || typeof archive?.commit !== 'string'
      || !/^[a-f0-9]{40}$/u.test(archive.commit)
      || !/^[a-f0-9]{64}$/u.test(apkSha256 ?? '')) {
    fail('The private legal-route candidate archive is incomplete.');
  }
  return Object.freeze({
    applicationId: archive.applicationId,
    bundleId: archive.bundleId,
    versionName: archive.versionName,
    buildNumber: archive.buildNumber,
    commit: archive.commit,
    releaseChannel: archive.releaseChannel,
    apiBaseUrl: archive.apiBaseUrl,
    firebaseConfigured: archive.firebaseConfigured,
    paymentMode: 'memory',
    stripeLivemode: false,
    android: Object.freeze({ apkSha256 }),
  });
}

function validateLegalChecks(checks) {
  if (!Array.isArray(checks)
      || checks.length === 0
      || checks.some((check) => !legalCheckByLabel.has(check?.label))
      || new Set(checks.map((check) => check.label)).size !== checks.length) {
    fail('The requested legal-route diagnostic scope is invalid.');
  }
  return checks.map((check) => legalCheckByLabel.get(check.label));
}

function centerOfNode(node, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  const [, x1, y1, x2, y2] = bounds.map(Number);
  return {
    x: Math.floor((x1 + x2) / 2),
    y: Math.floor((y1 + y2) / 2),
  };
}

function tapSingleNamedNode(commandRunner, adbPath, device, hierarchy, label) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const candidates = clickable.length > 0 ? clickable : enabled;
  if (candidates.length !== 1) {
    fail(`The sanitized ${label} action is missing or ambiguous.`);
  }
  const center = centerOfNode(candidates[0], label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'input',
    'tap',
    String(center.x),
    String(center.y),
  ]);
}

async function waitForNamedSurface({
  commandRunner,
  adbPath,
  device,
  labels,
  failure,
  wait,
}) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await wait(600);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const complete = labels.every((label) => (
      currentHeadAndroidNamedNodes(hierarchy, label).length >= 1
    ));
    if (complete
        && currentHeadAndroidNamedNodes(hierarchy, 'Bitte zuerst anmelden').length === 0) {
      return hierarchy;
    }
  }
  fail(failure);
}

async function openAuthenticatedLegalRoot({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapSingleNamedNode(commandRunner, adbPath, device, main, 'Mein SIT');
  const profile = await waitForNamedSurface({
    commandRunner,
    adbPath,
    device,
    labels: ['Meine Anzeigen', 'Mietanfragen', 'Abmelden', 'Suchen'],
    failure: 'The authenticated profile surface did not appear.',
    wait,
  });
  tapSingleNamedNode(commandRunner, adbPath, device, profile, 'Suchen');
  const search = await waitForNamedSurface({
    commandRunner,
    adbPath,
    device,
    labels: ['Suche schließen'],
    failure: 'The profile search surface did not appear.',
    wait,
  });
  if (currentHeadAndroidNamedNodes(search, 'Suchen').length >= 1) {
    fail('The profile search did not enter its focused open state.');
  }
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'input', 'text', 'Rechtliches'],
  );
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'input', 'keyevent', '66'],
  );
  return waitForNamedSurface({
    commandRunner,
    adbPath,
    device,
    labels: ['Rechtliches', 'Impressum', 'Datenschutz', 'AGB'],
    failure: 'The read-only legal root did not appear.',
    wait,
  });
}

async function findAndOpenLegalDocument({
  commandRunner,
  adbPath,
  device,
  check,
  wait,
}) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, check.label).length >= 1) {
      tapSingleNamedNode(commandRunner, adbPath, device, hierarchy, check.label);
      await waitForNamedSurface({
        commandRunner,
        adbPath,
        device,
        labels: [check.label, check.marker],
        failure: `The read-only ${check.label} document did not appear.`,
        wait,
      });
      currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'input', 'keyevent', '4'],
      );
      await waitForNamedSurface({
        commandRunner,
        adbPath,
        device,
        labels: ['Rechtliches'],
        failure: 'The legal root did not return after a read-only document.',
        wait,
      });
      return;
    }
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
  fail(`The read-only ${check.label} legal entry is unavailable.`);
}

export async function diagnoseCurrentHeadAndroidLegalRoutes({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  checks = legalChecks,
  startAtLegalRoot = false,
  retainLegalRoot = false,
  sourceDrift = null,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const selectedChecks = validateLegalChecks(checks);
  if (retainLegalRoot && (!startAtLegalRoot || selectedChecks.length !== 1)) {
    fail('Retaining a legal root requires one document from an existing legal root.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  let retainedRoot = false;
  try {
    if (startAtLegalRoot) {
      await waitForNamedSurface({
        commandRunner,
        adbPath,
        device,
        labels: ['Rechtliches', 'Impressum', 'Datenschutz', 'AGB'],
        failure: 'The current read-only legal root is unavailable.',
        wait,
      });
    } else {
      await openAuthenticatedLegalRoot({ commandRunner, adbPath, device, wait });
    }
    for (const check of selectedChecks) {
      await findAndOpenLegalDocument({ commandRunner, adbPath, device, check, wait });
    }
    if (retainLegalRoot) {
      retainedRoot = true;
    } else {
      currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'input', 'keyevent', '4'],
      );
    }
  } finally {
    if (!retainedRoot) restoreCurrentHeadAndroidExplore(commandRunner, adbPath, device);
  }
  const complete = selectedChecks.length === legalChecks.length;
  return {
    schemaVersion: 1,
    kind: 'android-current-head-authenticated-legal-route-diagnostic',
    status: complete
      ? 'passed-bounded-authenticated-legal-route-diagnostic'
      : 'passed-bounded-authenticated-legal-route-subset',
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
      ...(sourceDrift === null ? {} : { mobileSourceChangedAfterCandidate: sourceDrift.mobileSourceChanged }),
    },
    installed: {
      packageIdentityVerified: true,
      versionName: installed.versionName,
      buildNumber: installed.buildNumber,
      delivery: installed.delivery,
      apkSha256: installed.apkSha256,
    },
    device: deviceSummary,
    tests: Object.fromEntries(selectedChecks.map((check) => [
      check.label,
      { status: 'passed', result: 'read-only-document-reachable' },
    ])),
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      authenticatedLegalRoutesPassed: complete,
      completeLegalRouteMatrixPassed: complete,
      ...(complete ? {} : { legalDocumentsTested: selectedChecks.map((check) => check.label) }),
      ...(retainedRoot ? { legalRootRetainedAfterDocumentDiagnostic: true } : {}),
      professionalLegalApprovalPassed: false,
      platformWithdrawalOpened: false,
      platformWithdrawalSubmitted: false,
      supportSubmitted: false,
      contactActionPerformed: false,
      accountMutationPerformed: false,
      loginPerformed: false,
      logoutPerformed: false,
      accountIdentityRecorded: false,
      lockCodeUsed: false,
      containsLegalContactValues: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  };
}

export function summarizeCurrentCandidateLegalRootPreparation({
  candidate,
  deviceSummary,
  sourceDrift,
  capturedAt,
}) {
  if (sourceDrift?.mobileSourceChanged !== false) {
    fail('The legal-root preparation requires an unchanged candidate mobile source.');
  }
  return {
    schemaVersion: 1,
    kind: 'sit-current-candidate-pixel-legal-root-preparation',
    status: 'prepared-read-only-legal-root',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      apkSha256: candidate.android.apkSha256,
      mobileSourceChangedAfterCandidate: false,
    },
    device: deviceSummary,
    tests: { legalRootVisible: true, documentVerified: false },
    boundaries: {
      readOnly: true,
      legalDocumentOpened: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
      containsCredential: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
    },
  };
}

export function parseLegalRouteArguments(values) {
  let currentHead = false;
  let adbPath = 'adb';
  let candidateDirectory = null;
  let onlyLabel = null;
  let prepareLegalRoot = false;
  let fromCurrentLegalRoot = false;
  let retainLegalRoot = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--current-head') {
      currentHead = true;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--candidate-dir') {
      candidateDirectory = resolve(values[index + 1] ?? fail('--candidate-dir requires a path.'));
      index += 1;
    } else if (values[index] === '--only') {
      onlyLabel = values[index + 1] ?? fail('--only requires one exact legal document label.');
      if (!legalCheckByLabel.has(onlyLabel)) fail('--only must name one supported legal document.');
      index += 1;
    } else if (values[index] === '--prepare-legal-root') {
      prepareLegalRoot = true;
    } else if (values[index] === '--from-current-legal-root') {
      fromCurrentLegalRoot = true;
    } else if (values[index] === '--retain-legal-root') {
      retainLegalRoot = true;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null && !currentHead) {
    fail('The legal-route diagnostic requires --current-head or --candidate-dir.');
  }
  if (candidateDirectory !== null && currentHead) {
    fail('--current-head cannot be combined with --candidate-dir.');
  }
  if (prepareLegalRoot && (onlyLabel !== null || fromCurrentLegalRoot || retainLegalRoot)) {
    fail('--prepare-legal-root cannot be combined with a legal document diagnostic.');
  }
  if (fromCurrentLegalRoot && onlyLabel === null) {
    fail('--from-current-legal-root requires --only with one exact legal document.');
  }
  if (retainLegalRoot && !fromCurrentLegalRoot) {
    fail('--retain-legal-root requires --from-current-legal-root with one exact legal document.');
  }
  return {
    currentHead,
    adbPath,
    candidateDirectory,
    onlyLabel,
    prepareLegalRoot,
    fromCurrentLegalRoot,
    retainLegalRoot,
  };
}

async function run() {
  const args = parseLegalRouteArguments(process.argv.slice(2));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const archive = args.candidateDirectory === null
    ? null
    : await validatePrivateAndroidReleaseArchive({ root, candidateDirectory: args.candidateDirectory });
  const candidate = archive === null
    ? await loadCurrentHeadAndroidDeviceCandidate()
    : candidateFromPrivateArchive(archive);
  const sourceDrift = archive === null
    ? null
    : collectCurrentCandidateLegalDrift({ root, candidateCommit: candidate.commit });
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const evidence = args.prepareLegalRoot
    ? await (async () => {
      assertCurrentHeadAndroidDeviceAlreadyUnlocked(
        defaultCurrentHeadAndroidCommandRunner, args.adbPath, device,
      );
      verifyCurrentHeadAndroidInstalledCandidate(
        defaultCurrentHeadAndroidCommandRunner, args.adbPath, device, candidate,
      );
      let prepared = false;
      try {
        await openAuthenticatedLegalRoot({
          commandRunner: defaultCurrentHeadAndroidCommandRunner,
          adbPath: args.adbPath,
          device,
          wait: (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
        });
        prepared = true;
        return summarizeCurrentCandidateLegalRootPreparation({
          candidate, deviceSummary, sourceDrift, capturedAt: new Date().toISOString(),
        });
      } finally {
        if (!prepared) {
          restoreCurrentHeadAndroidExplore(defaultCurrentHeadAndroidCommandRunner, args.adbPath, device);
        }
      }
    })()
    : await diagnoseCurrentHeadAndroidLegalRoutes({
      adbPath: args.adbPath,
      device,
      deviceSummary,
      candidate,
      checks: args.onlyLabel === null ? legalChecks : [legalCheckByLabel.get(args.onlyLabel)],
      startAtLegalRoot: args.fromCurrentLegalRoot,
      retainLegalRoot: args.retainLegalRoot,
      sourceDrift,
    });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'Current-head Android legal-route diagnostic failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
