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
  inspectCurrentCandidateAndroidDeviceServiceState,
} from './diagnose_current_candidate_android_device_services_opt_in.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const productJourneyScript = resolve(
  repositoryRoot,
  'tool',
  'diagnose_android_email_verified_two_role_product_journey.mjs',
);

export const wp143InstallGate =
  'WP143_ONEPLUS_CURRENT_CANDIDATE_DATA_PRESERVING_INSTALL_GO';
export const wp143ExecutionGate =
  'WP143_ONEPLUS_CURRENT_CANDIDATE_TWO_ROLE_GO';

export const wp143Candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026091312',
  commit: '904c2b734160544aaeb1128cac15191a521739e7',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  apkSha256: 'e6d1df85e4e8973765c594b8fe9eb2654c876ee11cafe6d94cfe5c57ff8d7fb9',
  signingCertificateSha256:
    '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  socialAuth: Object.freeze({
    googleEnabled: true,
    appleEnabled: false,
    facebookEnabled: false,
  }),
});

function fail(message) {
  throw new Error(`WP143 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} is not exact.`);
  }
}

function requiredArgument(values, index, flag) {
  const value = values[index + 1];
  if (typeof value !== 'string' || value.trim() === '' || value.startsWith('--')) {
    fail(`${flag} requires a value.`);
  }
  return value;
}

export function parseWp143Arguments(values) {
  const parsed = {
    adbPath: process.env.SIT_ADB_PATH ?? 'adb',
    sourceVaultFile: null,
    candidateDirectory: null,
    privateArtifactDirectory: null,
    installAllowed: false,
    executionAllowed: false,
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
    } else if (flag === '--confirm-data-preserving-install') {
      if (requiredArgument(values, index, flag) !== wp143InstallGate) {
        fail('the exact data-preserving install gate was not supplied.');
      }
      parsed.installAllowed = true;
      index += 1;
    } else if (flag === '--confirm-execution') {
      if (requiredArgument(values, index, flag) !== wp143ExecutionGate) {
        fail('the exact execution gate was not supplied.');
      }
      parsed.executionAllowed = true;
      index += 1;
    } else {
      fail('an unknown argument was supplied.');
    }
  }
  for (const [key, flag] of [
    ['sourceVaultFile', '--source-vault-file'],
    ['candidateDirectory', '--candidate-dir'],
    ['privateArtifactDirectory', '--private-artifact-dir'],
  ]) {
    if (parsed[key] === null) fail(`${flag} is required.`);
  }
  if (!parsed.executionAllowed) fail('the exact execution gate is required.');
  return Object.freeze(parsed);
}

function assertOwnerOnlyPrivatePath(path, { file = false } = {}) {
  let canonical;
  let link;
  let stat;
  try {
    const requested = resolve(path);
    const requestedLink = lstatSync(requested);
    if (requestedLink.isSymbolicLink()) {
      fail('a private input is not an owner-only path outside the repository.');
    }
    canonical = realpathSync(requested);
    link = lstatSync(canonical);
    stat = statSync(canonical);
  } catch (error) {
    if (String(error?.message ?? '').startsWith('WP143 ')) throw error;
    fail('a private input is not an owner-only path outside the repository.');
  }
  if ((file ? !link.isFile() : !link.isDirectory())
      || link.isSymbolicLink()
      || (stat.mode & 0o077) !== 0
      || (file && stat.size === 0)
      || canonical === repositoryRoot
      || canonical.startsWith(`${repositoryRoot}${sep}`)) {
    fail('a private input is not an owner-only path outside the repository.');
  }
  return canonical;
}

function adb(commandRunner, adbPath, device, args, { optional = false } = {}) {
  try {
    return String(commandRunner(adbPath, ['-s', device.serial, ...args])).trim();
  } catch {
    if (optional) return '';
    fail('an ADB command failed without exposing the device identifier.');
  }
}

function assertOnePlus(deviceSummary) {
  if (deviceSummary?.physical !== true
      || deviceSummary?.model !== 'CPH2581'
      || !/^oneplus$/iu.test(String(deviceSummary?.manufacturer ?? ''))) {
    fail('the exact physical OnePlus CPH2581 is required.');
  }
}

export function assertWp143ExactCandidate(candidate) {
  for (const [key, expected] of Object.entries(wp143Candidate)) {
    exact(candidate?.[key], expected, `candidate ${key}`);
  }
  exact(candidate?.firebaseConfigured, true, 'candidate Firebase configuration');
  exact(candidate?.privacyScan, 'passed', 'candidate privacy scan');
  return true;
}

export function parseWp143InstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/mu.exec(String(output))?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/mu.exec(String(output))?.[1] ?? null;
  if (versionName === null || buildNumber === null) {
    fail('the installed ShareItToo version is unavailable.');
  }
  return Object.freeze({ versionName, buildNumber });
}

export function classifyWp143Installation({
  packagePresent,
  exactCandidateInstalled,
  installedVersionName = null,
  installedBuildNumber = null,
  installAllowed,
} = {}) {
  for (const [value, label] of [
    [packagePresent, 'package presence'],
    [exactCandidateInstalled, 'exact-candidate state'],
    [installAllowed, 'install gate'],
  ]) {
    if (typeof value !== 'boolean') fail(`${label} is invalid.`);
  }
  if (exactCandidateInstalled && !packagePresent) {
    fail('the installation state is contradictory.');
  }
  if (exactCandidateInstalled) {
    return Object.freeze({
      action: 'preserve-exact-installed-candidate',
      installRequired: false,
      dataPreservingUpdate: false,
      localAppDataReset: false,
    });
  }
  if (!installAllowed) {
    fail('the exact data-preserving install gate is required.');
  }
  if (!packagePresent) {
    return Object.freeze({
      action: 'install-exact-candidate-without-existing-package',
      installRequired: true,
      dataPreservingUpdate: false,
      localAppDataReset: false,
    });
  }
  if (installedVersionName !== wp143Candidate.versionName
      || typeof installedBuildNumber !== 'string'
      || !/^\d{10}$/u.test(installedBuildNumber)) {
    fail('the existing ShareItToo package identity is not safely updatable.');
  }
  const installed = BigInt(installedBuildNumber);
  const expected = BigInt(wp143Candidate.buildNumber);
  if (installed >= expected) {
    fail('the non-exact installed ShareItToo build is not an older candidate.');
  }
  return Object.freeze({
    action: 'data-preserving-update-to-exact-candidate',
    installRequired: true,
    dataPreservingUpdate: true,
    localAppDataReset: false,
  });
}

function inspectInstalledPackage(commandRunner, adbPath, device, candidate) {
  const packageOutput = adb(commandRunner, adbPath, device, [
    'shell', 'pm', 'path', candidate.applicationId,
  ], { optional: true });
  if (packageOutput === '') {
    return Object.freeze({ packagePresent: false, exactCandidateInstalled: false });
  }
  const paths = packageOutput.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (paths.length !== 1 || paths.some((line) => !line.startsWith('package:/data/app/'))) {
    fail('the installed ShareItToo package layout is not a direct APK.');
  }
  let exactCandidateInstalled = false;
  try {
    verifyCurrentHeadAndroidInstalledCandidate(
      commandRunner,
      adbPath,
      device,
      candidate,
    );
    exactCandidateInstalled = true;
  } catch {
    exactCandidateInstalled = false;
  }
  const installed = parseWp143InstalledPackage(adb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'package', candidate.applicationId],
  ));
  return Object.freeze({
    packagePresent: true,
    exactCandidateInstalled,
    installedVersionName: installed.versionName,
    installedBuildNumber: installed.buildNumber,
  });
}

function applyInstallationPlan({
  plan,
  commandRunner,
  adbPath,
  device,
  candidate,
}) {
  if (plan.installRequired) {
    const args = [
      'install',
      '--no-streaming',
      ...(plan.dataPreservingUpdate ? ['-r'] : []),
      candidate.apkPath,
    ];
    const result = adb(commandRunner, adbPath, device, args);
    if (result !== 'Success') fail('the exact candidate installation failed safely.');
  }
  verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
}

export function assertWp143PushOptInReady(value) {
  if (value?.independentSwitchCount !== 2
      || value.pushEnabled !== true
      || typeof value.crashDiagnosticsEnabled !== 'boolean'
      || value.exactSecondObservationUnchanged !== true
      || value.consentDialogOpened !== false
      || value.exploreSurfaceRestored !== true) {
    fail('the stable visible ShareItToo push opt-in is required before product mutation.');
  }
  return true;
}

export function validateWp143JourneyResult(value) {
  exact(value?.schemaVersion, 1, 'journey schema version');
  exact(value?.kind,
    'android-oneplus-email-verified-two-role-product-journey', 'journey kind');
  exact(value?.status,
    'passed-oneplus-email-verified-two-role-product-journey', 'journey status');
  for (const key of [
    'applicationId',
    'versionName',
    'buildNumber',
    'commit',
    'apkSha256',
  ]) {
    exact(value?.candidate?.[key], wp143Candidate[key], `journey candidate ${key}`);
  }
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
    fail('the complete OnePlus two-role product journey failed safely.');
  }
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    fail('the complete OnePlus journey did not return structured evidence.');
  }
  validateWp143JourneyResult(value);
  return value;
}

async function main() {
  const args = parseWp143Arguments(process.argv.slice(2));
  const sourceVaultFile = assertOwnerOnlyPrivatePath(args.sourceVaultFile, { file: true });
  const privateArtifactDirectory = assertOwnerOnlyPrivatePath(args.privateArtifactDirectory);
  const candidateDirectory = assertOwnerOnlyPrivatePath(args.candidateDirectory);
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  assertWp143ExactCandidate(candidate);

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

  const installed = inspectInstalledPackage(
    commandRunner,
    args.adbPath,
    device,
    candidate,
  );
  const plan = classifyWp143Installation({
    ...installed,
    installAllowed: args.installAllowed,
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
  assertWp143PushOptInReady(deviceServices);
  const journey = runProductJourney({
    sourceVaultFile,
    candidateDirectory,
    privateArtifactDirectory,
    adbPath: args.adbPath,
  });
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    workPackage: 'WP143_ONEPLUS_CURRENT_CANDIDATE_TWO_ROLE',
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
      uninstallUsed: false,
      packageResetUsed: false,
      localAppDataReset: false,
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
    process.stderr.write(`ERROR: ${error?.message ?? 'WP143 failed safely.'}\n`);
    process.exitCode = 1;
  });
}
