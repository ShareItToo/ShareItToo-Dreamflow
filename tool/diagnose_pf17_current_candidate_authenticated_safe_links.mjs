#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { diagnoseAndroidAppLinks } from './diagnose_android_app_links.mjs';
import {
  defaultCurrentHeadAndroidCommandRunner,
} from './diagnose_current_head_android_main_navigation.mjs';
import { loadPf16CurrentCandidate } from './diagnose_pf16_current_candidate_read_only.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';

const expectedCommit = '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b';
const expectedBuildNumber = '2026082302';
const expectedTestKeys = Object.freeze([
  'authenticatedNotificationsBefore',
  'verifiedHttpsMissingListing',
  'unsafeIdentifierRejected',
  'foreignHostNotAssociated',
  'authenticatedNotificationsAfter',
]);
const expectedDeviceSummary = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});
const expectedBoundaries = Object.freeze({
  directDiagnosticOnly: true,
  storeInstallationGateSatisfied: false,
  authenticatedSafeLinksPassed: true,
  authenticatedFixtureLinksPassed: false,
  manualFunctionalMatrixPassed: false,
  bookingFlowPassed: false,
  realPushPassed: false,
  loginPerformed: false,
  logoutPerformed: false,
  accountMutationPerformed: false,
  accountIdentityRecorded: false,
  lockCodeUsed: false,
  containsPersonalAccountData: false,
  containsSecrets: false,
  containsRawDeviceIdentifiers: false,
  containsReviewCredentials: false,
});

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export async function runPf17CurrentCandidateAuthenticatedSafeLinks({
  candidate,
  archive,
  device,
  deviceSummary,
  adbPath = 'adb',
  capturedAt = new Date().toISOString(),
  appLinkDiagnostic = diagnoseAndroidAppLinks,
} = {}) {
  if (candidate?.commit !== expectedCommit
      || candidate?.buildNumber !== expectedBuildNumber
      || archive?.apkSha256 !== candidate?.android?.apkSha256) {
    fail('PF17 requires the exact verified current candidate and private APK archive.');
  }
  if (!exact(deviceSummary, expectedDeviceSummary)) {
    fail('PF17 requires the expected sanitized physical-device state.');
  }
  const result = await appLinkDiagnostic({
    vaultFile: null,
    adbPath,
    device,
    deviceSummary,
    candidate,
    archive,
    sessionMode: 'authenticated-preserved',
    capturedAt,
  });
  if (result.schemaVersion !== 1
      || result.kind !== 'android-authenticated-safe-app-link-diagnostic'
      || result.status !== 'passed-bounded-authenticated-safe-app-link-diagnostic') {
    fail('PF17 authenticated safe-link diagnostic did not pass.');
  }
  if (!exact(result.candidate, {
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
  })) {
    fail('PF17 safe-link result is not bound to the exact current candidate.');
  }
  if (!exact(result.installed, {
    packageIdentityVerified: true,
    versionName: candidate.versionName,
    buildNumber: candidate.buildNumber,
    delivery: 'direct-apk',
    apkSha256: candidate.android.apkSha256,
  })) {
    fail('PF17 safe-link result is not bound to the installed direct APK.');
  }
  if (!exact(result.device, deviceSummary)) {
    fail('PF17 sanitized device summary drifted.');
  }
  if (!exact(Object.keys(result.tests ?? {}), expectedTestKeys)
      || !Object.values(result.tests).every((test) => test.status === 'passed')) {
    fail('PF17 authenticated safe-link checks are incomplete.');
  }
  if (!exact(result.boundaries, expectedBoundaries)) {
    fail('PF17 safe-link boundaries are invalid or overstated.');
  }
  return Object.freeze(result);
}

function parseArguments(values) {
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
  const { adbPath } = parseArguments(process.argv.slice(2));
  const { candidate, archive } = await loadPf16CurrentCandidate();
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const evidence = await runPf17CurrentCandidateAuthenticatedSafeLinks({
    candidate,
    archive,
    device,
    deviceSummary,
    adbPath,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'PF17 current-candidate authenticated safe links failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
