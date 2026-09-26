#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  defaultCurrentHeadAndroidCommandRunner,
  verifyCurrentHeadAndroidInstalledCandidate,
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
  inspectCurrentCandidateAndroidDeviceServiceState,
} from './diagnose_current_candidate_android_device_services_opt_in.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const productJourneyScript = resolve(
  repositoryRoot,
  'tool',
  'diagnose_android_email_verified_two_role_product_journey.mjs',
);

export const wp117ScopedResetGate =
  'ONEPLUS_SIT_PACKAGE_RESET_FOR_EXACT_CANDIDATE_GO';
export const wp117ExecutionGate =
  'WP117_ONEPLUS_CURRENT_CANDIDATE_TWO_ROLE_GO';

export const wp117Candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026091110',
  commit: 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  apkSha256: '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
  signingCertificateSha256:
    '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
});

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`WP117 ${label} is not exact.`);
}

function requiredArgument(values, index, flag) {
  const value = values[index + 1];
  if (typeof value !== 'string' || value.trim() === '' || value.startsWith('--')) {
    fail(`${flag} requires a value.`);
  }
  return value;
}

export function parseWp117Arguments(values) {
  const parsed = {
    adbPath: process.env.SIT_ADB_PATH ?? 'adb',
    sourceVaultFile: null,
    candidateDirectory: null,
    privateArtifactDirectory: null,
    executionAllowed: false,
    scopedResetAllowed: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (flag === '--adb') {
      parsed.adbPath = requiredArgument(values, index, flag);
      index += 1;
    } else if (flag === '--source-vault-file') {
      parsed.sourceVaultFile = resolve(requiredArgument(values, index, flag));
      index += 1;
    } else if (flag === '--candidate-dir') {
      parsed.candidateDirectory = resolve(requiredArgument(values, index, flag));
      index += 1;
    } else if (flag === '--private-artifact-dir') {
      parsed.privateArtifactDirectory = resolve(requiredArgument(values, index, flag));
      index += 1;
    } else if (flag === '--confirm-scoped-app-reset') {
      if (requiredArgument(values, index, flag) !== wp117ScopedResetGate) {
        fail('The exact WP117 package-reset gate was not supplied.');
      }
      parsed.scopedResetAllowed = true;
      index += 1;
    } else if (flag === '--confirm-execution') {
      if (requiredArgument(values, index, flag) !== wp117ExecutionGate) {
        fail('The exact WP117 execution gate was not supplied.');
      }
      parsed.executionAllowed = true;
      index += 1;
    } else {
      fail('Unknown WP117 argument.');
    }
  }
  for (const [key, label] of [
    ['sourceVaultFile', '--source-vault-file'],
    ['candidateDirectory', '--candidate-dir'],
    ['privateArtifactDirectory', '--private-artifact-dir'],
  ]) {
    if (parsed[key] === null) fail(`${label} is required.`);
  }
  if (!parsed.executionAllowed) fail('The exact WP117 execution gate is required.');
  return Object.freeze(parsed);
}

export function assertWp117ExactCandidate(candidate) {
  for (const [key, expected] of Object.entries(wp117Candidate)) {
    exact(candidate?.[key], expected, `candidate ${key}`);
  }
  exact(candidate?.firebaseConfigured, true, 'candidate Firebase configuration');
  exact(candidate?.privacyScan, 'passed', 'candidate privacy scan');
  return true;
}

export function classifyWp117Installation({
  packagePresent,
  exactCandidateInstalled,
  scopedResetAllowed,
} = {}) {
  if (typeof packagePresent !== 'boolean'
      || typeof exactCandidateInstalled !== 'boolean'
      || typeof scopedResetAllowed !== 'boolean'
      || (exactCandidateInstalled && !packagePresent)) {
    fail('WP117 installation state is invalid.');
  }
  if (exactCandidateInstalled) {
    return Object.freeze({
      action: 'preserve-exact-installed-candidate',
      uninstallRequired: false,
      installRequired: false,
      localAppDataReset: false,
    });
  }
  if (packagePresent && !scopedResetAllowed) {
    fail('WP117 requires the exact scoped package-reset gate for a non-exact installation.');
  }
  return Object.freeze({
    action: packagePresent
      ? 'reset-shareittoo-package-and-install-exact-candidate'
      : 'install-exact-candidate-without-reset',
    uninstallRequired: packagePresent,
    installRequired: true,
    localAppDataReset: packagePresent,
  });
}

function assertOwnerOnlyPrivatePath(path, { file = false } = {}) {
  let canonical;
  let link;
  let stat;
  try {
    const requested = resolve(path);
    const requestedLink = lstatSync(requested);
    if (requestedLink.isSymbolicLink()) {
      fail('WP117 private input is not an owner-only path outside the repository.');
    }
    canonical = realpathSync(requested);
    link = lstatSync(canonical);
    stat = statSync(canonical);
  } catch {
    fail('WP117 private input is not an owner-only path outside the repository.');
  }
  const expectedType = file ? link.isFile() : link.isDirectory();
  if (!expectedType || link.isSymbolicLink() || (stat.mode & 0o077) !== 0
      || (file && stat.size === 0)
      || canonical === repositoryRoot
      || canonical.startsWith(`${repositoryRoot}${sep}`)) {
    fail('WP117 private input is not an owner-only path outside the repository.');
  }
  return canonical;
}

function adb(commandRunner, adbPath, device, args, { optional = false } = {}) {
  try {
    return String(commandRunner(adbPath, ['-s', device.serial, ...args])).trim();
  } catch {
    if (optional) return '';
    fail('WP117 ADB command failed without exposing the device identifier.');
  }
}

function assertOnePlus(deviceSummary) {
  if (deviceSummary?.physical !== true
      || deviceSummary?.model !== 'CPH2581'
      || !/^oneplus$/iu.test(String(deviceSummary?.manufacturer ?? ''))) {
    fail('WP117 requires the exact physical OnePlus CPH2581.');
  }
}

function installedPackagePresent(commandRunner, adbPath, device) {
  const output = adb(commandRunner, adbPath, device, [
    'shell', 'pm', 'path', wp117Candidate.applicationId,
  ], { optional: true });
  if (output === '') return false;
  const paths = output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (paths.some((line) => !line.startsWith('package:/data/app/'))) {
    fail('WP117 found an ambiguous installed package path.');
  }
  return paths.length > 0;
}

function exactCandidateInstalled(commandRunner, adbPath, device, candidate) {
  try {
    verifyCurrentHeadAndroidInstalledCandidate(
      commandRunner,
      adbPath,
      device,
      candidate,
    );
    return true;
  } catch {
    return false;
  }
}

function applyInstallationPlan({
  plan,
  commandRunner,
  adbPath,
  device,
  candidate,
}) {
  if (plan.uninstallRequired) {
    const result = adb(commandRunner, adbPath, device, [
      'uninstall', wp117Candidate.applicationId,
    ]);
    if (result !== 'Success') fail('WP117 scoped ShareItToo package reset failed.');
  }
  if (plan.installRequired) {
    const result = adb(commandRunner, adbPath, device, [
      'install', candidate.apkPath,
    ]);
    if (result !== 'Success') fail('WP117 exact candidate installation failed.');
  }
  verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
}

export function validateWp117JourneyResult(value) {
  exact(value?.schemaVersion, 1, 'journey schema version');
  exact(value?.kind,
    'android-oneplus-email-verified-two-role-product-journey', 'journey kind');
  exact(value?.status,
    'passed-oneplus-email-verified-two-role-product-journey', 'journey status');
  exact(value?.candidate?.applicationId, wp117Candidate.applicationId,
    'journey application ID');
  exact(value?.candidate?.versionName, wp117Candidate.versionName,
    'journey version name');
  exact(value?.candidate?.buildNumber, wp117Candidate.buildNumber,
    'journey build number');
  exact(value?.candidate?.commit, wp117Candidate.commit, 'journey source commit');
  exact(value?.candidate?.apkSha256, wp117Candidate.apkSha256, 'journey APK hash');
  exact(value?.device?.physical, true, 'journey physical device');
  exact(value?.device?.model, 'CPH2581', 'journey device model');
  exact(value?.boundaries?.physicalOnePlusOnly, true, 'OnePlus boundary');
  exact(value?.boundaries?.onePlusContacted, true, 'OnePlus contact boundary');
  exact(value?.boundaries?.listingLeftActive, false, 'listing cleanup');
  exact(value?.boundaries?.testBookingLeftActive, false, 'booking cleanup');
  for (const key of [
    'paymentEndpointCalled',
    'stripeLivemode',
    'contractCreated',
    'reservationCreated',
    'productionChanged',
    'googlePlayChanged',
    'publicRegistrationChanged',
    'realMoneyUsed',
    'containsAccountIdentity',
    'containsSecrets',
    'containsTokens',
    'containsFixtureIdentifiers',
    'containsRawDeviceIdentifiers',
    'containsPrivateFilesystemPaths',
  ]) exact(value?.boundaries?.[key], false, `journey boundary ${key}`);
  return true;
}

export function assertWp117PushOptInReady(value) {
  if (value?.independentSwitchCount !== 2
      || value.pushEnabled !== true
      || typeof value.crashDiagnosticsEnabled !== 'boolean'
      || value.exactSecondObservationUnchanged !== true
      || value.consentDialogOpened !== false
      || value.exploreSurfaceRestored !== true) {
    fail('WP117 requires the visible ShareItToo app-level push opt-in before product mutation.');
  }
  return true;
}

function runProductJourney({
  sourceVaultFile,
  candidateDirectory,
  privateArtifactDirectory,
  adbPath,
}) {
  let output;
  try {
    output = execFileSync(process.execPath, [
      productJourneyScript,
      '--source-vault-file', sourceVaultFile,
      '--candidate-dir', candidateDirectory,
      '--private-artifact-dir', privateArtifactDirectory,
      '--device-profile', 'oneplus',
      '--adb', adbPath,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    fail('WP117 complete OnePlus two-role product journey failed safely.');
  }
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    fail('WP117 complete OnePlus journey did not return structured evidence.');
  }
  validateWp117JourneyResult(value);
  return value;
}

async function main() {
  const args = parseWp117Arguments(process.argv.slice(2));
  const sourceVaultFile = assertOwnerOnlyPrivatePath(args.sourceVaultFile, { file: true });
  const privateArtifactDirectory = assertOwnerOnlyPrivatePath(args.privateArtifactDirectory);
  const candidateDirectory = assertOwnerOnlyPrivatePath(args.candidateDirectory);
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  assertWp117ExactCandidate(candidate);

  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const devices = parseAdbDevices(commandRunner(args.adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({
    commandRunner,
    adbPath: args.adbPath,
    device,
  });
  assertOnePlus(deviceSummary);
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(
    commandRunner,
    args.adbPath,
    device,
  );

  const packagePresent = installedPackagePresent(
    commandRunner,
    args.adbPath,
    device,
  );
  const installedExact = packagePresent && exactCandidateInstalled(
    commandRunner,
    args.adbPath,
    device,
    candidate,
  );
  const plan = classifyWp117Installation({
    packagePresent,
    exactCandidateInstalled: installedExact,
    scopedResetAllowed: args.scopedResetAllowed,
  });
  applyInstallationPlan({
    plan,
    commandRunner,
    adbPath: args.adbPath,
    device,
    candidate,
  });
  const deviceServices = await inspectCurrentCandidateAndroidDeviceServiceState({
    commandRunner,
    adbPath: args.adbPath,
    device,
  });
  assertWp117PushOptInReady(deviceServices);
  const journey = runProductJourney({
    sourceVaultFile,
    candidateDirectory,
    privateArtifactDirectory,
    adbPath: args.adbPath,
  });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    workPackage: 'WP117_ONEPLUS_CURRENT_CANDIDATE_TWO_ROLE',
    status: 'passed-exact-current-candidate-oneplus-two-role',
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      apkSha256: candidate.apkSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
    },
    device: {
      physical: true,
      manufacturer: deviceSummary.manufacturer,
      model: deviceSummary.model,
      containsRawDeviceIdentifier: false,
    },
    installation: plan,
    deviceServices: {
      pushEnabled: true,
      crashDiagnosticsEnabled: deviceServices.crashDiagnosticsEnabled,
      exactSecondObservationUnchanged: true,
      consentDialogOpened: false,
      exploreSurfaceRestored: true,
    },
    journey,
    boundaries: {
      onlyShareItTooPackageMayHaveBeenReset: true,
      otherDeviceDataChanged: false,
      containsAccountIdentity: false,
      containsSecrets: false,
      containsTokens: false,
      containsPrivateFilesystemPaths: false,
    },
  }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP117 failed safely.'}\n`);
    process.exitCode = 1;
  });
}
