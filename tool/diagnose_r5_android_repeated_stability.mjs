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
  defaultCurrentHeadAndroidCommandRunner,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import { parseAndroidInstalledPackageSnapshot } from './install_current_head_android_candidate_update.mjs';
import { validateAndroidLocalQaCandidate } from './validate_android_local_qa_candidate.mjs';

export const r5RequiredDeviceCycles = 25;
export const r5DeviceResultClassification =
  'BOUNDED_PHYSICAL_STABILITY_OBSERVATION_NOT_PERFORMANCE_CERTIFICATION';

const applicationId = 'com.shareittoo.app';
const defaultBuildNumber = '2026082405';

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
    if (!/^\d+(?:\s+\d+)*$/u.test(value)) fail('R5 received an invalid app-process state.');
    return value.split(/\s+/u)[0];
  } catch {
    const state = adb(commandRunner, adbPath, device, ['get-state']);
    if (state !== 'device') fail('The Android device disconnected during R5.');
    return null;
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

export function parseR5AndroidStartMetrics(output) {
  const value = String(output);
  const status = /^Status:\s*(\S+)\s*$/mu.exec(value)?.[1] ?? null;
  const activity = /^Activity:\s*(\S+)\s*$/mu.exec(value)?.[1] ?? null;
  const totalTimeMs = Number(/^TotalTime:\s*(\d+)\s*$/mu.exec(value)?.[1]);
  const waitTimeMs = Number(/^WaitTime:\s*(\d+)\s*$/mu.exec(value)?.[1]);
  if (status !== 'ok'
      || !activity?.startsWith(`${applicationId}/`)
      || !Number.isSafeInteger(totalTimeMs)
      || !Number.isSafeInteger(waitTimeMs)
      || totalTimeMs < 0
      || waitTimeMs < totalTimeMs) {
    fail('R5 Android activity-start metrics are invalid.');
  }
  return Object.freeze({ totalTimeMs, waitTimeMs });
}

export function parseR5AndroidTotalPssKib(output) {
  const value = String(output);
  const match = /TOTAL PSS:\s*(\d+)/u.exec(value)
    ?? /^\s*TOTAL\s+(\d+)\b/mu.exec(value);
  const totalPssKib = Number(match?.[1]);
  if (!Number.isSafeInteger(totalPssKib) || totalPssKib <= 0) {
    fail('R5 Android memory observation is unavailable.');
  }
  return totalPssKib;
}

function logObservation(value) {
  const text = String(value);
  const urlHosts = [...text.matchAll(/https?:\/\/([^\s/?#]+)/giu)]
    .map((match) => match[1].toLowerCase().replace(/^\[|\]$/gu, ''));
  const unexpected = [...new Set(urlHosts.filter((host) => (
    host !== '127.0.0.1'
      && host !== 'localhost'
      && host !== '::1'
  )))];
  return Object.freeze({
    fatalOrAnrEntries: (text.match(
      /FATAL EXCEPTION|Fatal signal|ANR in com\.shareittoo\.app/gu,
    ) ?? []).length,
    uncaughtFlutterErrors: (text.match(
      /Unhandled Exception|FlutterError|EXCEPTION CAUGHT BY FLUTTER FRAMEWORK/gu,
    ) ?? []).length,
    unexpectedNetworkTargetCount: unexpected.length,
  });
}

function roundedMean(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export async function runR5AndroidCycles({ cycle }) {
  if (typeof cycle !== 'function') fail('R5 device cycle dependency is invalid.');
  const observations = [];
  for (let index = 0; index < r5RequiredDeviceCycles; index += 1) {
    const observation = await cycle(index);
    if (!Number.isSafeInteger(observation?.totalTimeMs)
        || observation.totalTimeMs < 0
        || !Number.isSafeInteger(observation?.waitTimeMs)
        || observation.waitTimeMs < observation.totalTimeMs
        || !Number.isSafeInteger(observation?.totalPssKib)
        || observation.totalPssKib <= 0
        || observation.mainNavigationRestored !== true
        || observation.fatalOrAnrEntries !== 0
        || observation.uncaughtFlutterErrors !== 0
        || observation.unexpectedNetworkTargetCount !== 0) {
      fail(`R5 device cycle ${index + 1} failed closed.`);
    }
    observations.push(observation);
  }
  const starts = observations.map((entry) => entry.totalTimeMs);
  const memory = observations.map((entry) => entry.totalPssKib);
  return Object.freeze({
    completedCycles: observations.length,
    start: Object.freeze({
      minimumMs: Math.min(...starts),
      maximumMs: Math.max(...starts),
      firstFiveMeanMs: roundedMean(starts.slice(0, 5)),
      lastFiveMeanMs: roundedMean(starts.slice(-5)),
      trendDeltaMs: roundedMean(starts.slice(-5)) - roundedMean(starts.slice(0, 5)),
    }),
    memory: Object.freeze({
      minimumTotalPssKib: Math.min(...memory),
      maximumTotalPssKib: Math.max(...memory),
      firstFiveMeanTotalPssKib: roundedMean(memory.slice(0, 5)),
      lastFiveMeanTotalPssKib: roundedMean(memory.slice(-5)),
      trendDeltaTotalPssKib:
        roundedMean(memory.slice(-5)) - roundedMean(memory.slice(0, 5)),
    }),
    failures: Object.freeze({
      crashesOrAnr: 0,
      uncaughtFlutterErrors: 0,
      failedMainNavigationRestorations: 0,
      unexpectedNetworkTargetsInErrorLogs: 0,
    }),
  });
}

export function buildR5AndroidRepeatedStabilityEvidence({
  candidate,
  deviceSummary,
  before,
  after,
  cycles,
  capturedAt = new Date().toISOString(),
}) {
  if (!/^[0-9a-f]{40}$/u.test(candidate?.commit ?? '')
      || candidate.applicationId !== applicationId
      || candidate.versionName !== '1.0.0'
      || !/^\d{10,12}$/u.test(candidate.buildNumber ?? '')
      || deviceSummary?.physical !== true
      || deviceSummary.containsRawDeviceIdentifier !== false
      || before?.versionName !== candidate.versionName
      || before?.buildNumber !== candidate.buildNumber
      || after?.versionName !== before.versionName
      || after?.buildNumber !== before.buildNumber
      || after?.firstInstallTime !== before.firstInstallTime
      || after?.ceDataInode !== before.ceDataInode
      || cycles?.completedCycles !== r5RequiredDeviceCycles) {
    fail('R5 candidate, device or app-data preservation evidence is invalid.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-r5-android-repeated-stability-observation',
    status: 'passed-25-bounded-physical-start-stop-cycles',
    resultClassification: r5DeviceResultClassification,
    capturedAt,
    source: Object.freeze({
      branch: 'codex/master-workflow-20260808',
      commit: candidate.commit,
      applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
    }),
    device: Object.freeze({ ...deviceSummary }),
    cycles,
    state: Object.freeze({
      appDataIdentityPreserved: true,
      packageIdentityPreserved: true,
      mainNavigationRestoredEveryCycle: true,
      detectedDataCorruptions: 0,
    }),
    limitations: Object.freeze({
      fullBlueOceanUiFlowRepeatedOnDevice: false,
      networkObservation: 'ERROR_LOG_URL_OBSERVATION_NOT_PACKET_CAPTURE',
      performanceCertificationClaimed: false,
      memoryLeakCertificationClaimed: false,
    }),
    boundaries: Object.freeze({
      uiHierarchyPersisted: false,
      screenshotsCaptured: false,
      accountContentRecorded: false,
      privateMediaRead: false,
      rawDeviceIdentifierRecorded: false,
      networkSettingsChanged: false,
      accessibilitySettingsChanged: false,
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

export async function diagnoseR5AndroidRepeatedStability({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  pause = wait,
  capturedAt = new Date().toISOString(),
}) {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const before = packageSnapshot(commandRunner, adbPath, device);

  const cycles = await runR5AndroidCycles({
    cycle: async () => {
      adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
      if (processId(commandRunner, adbPath, device) !== null) {
        fail('ShareItToo remained running after an R5 close cycle.');
      }
      const start = parseR5AndroidStartMetrics(adb(commandRunner, adbPath, device, [
        'shell', 'am', 'start', '-W', '-n', `${applicationId}/.MainActivity`,
      ]));
      await waitForCurrentHeadAndroidMainNavigation({
        commandRunner,
        adbPath,
        device,
        wait: pause,
      });
      const pid = processId(commandRunner, adbPath, device);
      if (pid === null) fail('ShareItToo process disappeared during an R5 cycle.');
      const totalPssKib = parseR5AndroidTotalPssKib(adb(
        commandRunner,
        adbPath,
        device,
        ['shell', 'dumpsys', 'meminfo', '--local', applicationId],
      ));
      const logs = logObservation(adb(commandRunner, adbPath, device, [
        'logcat', '-d', '--pid', pid, '-v', 'brief', '*:E',
      ]));
      return Object.freeze({
        ...start,
        totalPssKib,
        mainNavigationRestored: true,
        ...logs,
      });
    },
  });
  const after = packageSnapshot(commandRunner, adbPath, device);
  return buildR5AndroidRepeatedStabilityEvidence({
    candidate,
    deviceSummary,
    before,
    after,
    cycles,
    capturedAt,
  });
}

async function runCli() {
  if (process.argv.length !== 2) fail(`Unknown argument: ${process.argv[2]}`);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const buildNumber = process.env.SIT_R5_LOCAL_QA_BUILD_NUMBER ?? defaultBuildNumber;
  const candidateArchive = await validateAndroidLocalQaCandidate({
    root,
    expectedBuildNumber: buildNumber,
    expectedCommit: commit,
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
  const evidence = await diagnoseR5AndroidRepeatedStability({
    device,
    deviceSummary,
    candidate,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'R5 Android diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
