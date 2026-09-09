#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  validateCurrentHeadAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const rolloverManifestPath = 'store/google-play/current-rollover-candidate.json';
const rolloverInstallStatuses = new Set([
  'build-ready-play-internal-upload-pending',
  'build-ready-play-internal-activation-pending',
  'play-internal-active-device-verification-pending',
]);
const postCandidateEvidencePrefixes = [
  '.github/',
  'docs/',
  'scripts/',
  'store/',
  'test/',
  'tool/',
];

function fail(message) {
  throw new Error(message);
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateRolloverAndroidInstallBinding({
  rollover,
  candidate,
  sourceIsAncestor,
  changedPaths = [],
} = {}) {
  const identity = rollover?.candidate;
  const artifact = rollover?.artifact;
  if (rollover?.schemaVersion !== 1
      || rollover?.kind !== 'android-current-rollover-candidate'
      || !rolloverInstallStatuses.has(rollover?.status)
      || identity?.applicationId !== 'com.shareittoo.app'
      || identity?.releaseChannel !== 'internal'
      || identity?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || !/^\d+\.\d+\.\d+$/u.test(identity?.versionName ?? '')
      || !/^\d{10}$/u.test(identity?.versionCode ?? '')
      || !/^[a-f0-9]{40}$/u.test(identity?.artifactSourceHead ?? '')
      || sourceIsAncestor !== true) {
    fail('Current rollover candidate is not eligible for direct device installation.');
  }
  for (const [actual, expected] of [
    [candidate.applicationId, identity.applicationId],
    [candidate.versionName, identity.versionName],
    [candidate.buildNumber, identity.versionCode],
    [candidate.commit, identity.artifactSourceHead],
    [candidate.releaseChannel, identity.releaseChannel],
    [candidate.apiBaseUrl, identity.apiBaseUrl],
    [candidate.apkSha256, artifact?.apkSha256],
    [candidate.aabSha256, artifact?.aabSha256],
    [candidate.signingCertificateSha256, artifact?.uploadCertificateSha256],
  ]) {
    if (actual !== expected) {
      fail('Private archive does not match the current rollover candidate.');
    }
  }
  const runtimeDrift = changedPaths.filter((path) =>
    !postCandidateEvidencePrefixes.some((prefix) => path.startsWith(prefix)));
  if (runtimeDrift.length > 0) {
    fail('Runtime-affecting files changed after the rollover candidate was built.');
  }
  return candidate;
}

async function validateCurrentRolloverAndroidReleaseArchive({
  root,
  candidateDirectory,
  commandRunner = execFileSync,
} = {}) {
  const rollover = JSON.parse(readFileSync(resolve(root, rolloverManifestPath), 'utf8'));
  const identity = rollover?.candidate ?? {};
  const candidate = await validateCurrentHeadAndroidReleaseArchive({
    root,
    candidateDirectory,
    expectedIdentity: {
      versionName: identity.versionName,
      buildNumber: identity.versionCode,
      commit: identity.artifactSourceHead,
    },
  });
  let sourceIsAncestor = true;
  try {
    commandRunner('git', ['merge-base', '--is-ancestor', candidate.commit, 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    sourceIsAncestor = false;
  }
  const gitLines = (args) => String(commandRunner('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })).trim().split('\n').filter(Boolean);
  const changedPaths = [...new Set([
    ...gitLines(['diff', '--name-only', `${candidate.commit}..HEAD`]),
    ...gitLines(['diff', '--name-only']),
    ...gitLines(['diff', '--cached', '--name-only']),
  ])];
  return validateRolloverAndroidInstallBinding({
    rollover,
    candidate,
    sourceIsAncestor,
    changedPaths,
  });
}

export function parseAndroidInstalledPackageSnapshot(output, userId = '0') {
  const value = String(output);
  const versionName = /^\s*versionName=([^\s]+)\s*$/mu.exec(value)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/mu.exec(value)?.[1] ?? null;
  if (!/^\d+$/u.test(userId)) {
    fail('Current Android user could not be verified.');
  }
  const userHeader = new RegExp(`^\\s*User ${userId}:`, 'mu').exec(value);
  const followingUser = userHeader === null
    ? null
    : /^\s*User \d+:/mu.exec(value.slice(userHeader.index + userHeader[0].length));
  const userBlock = userHeader === null
    ? ''
    : value.slice(
      userHeader.index,
      followingUser === null
        ? value.length
        : userHeader.index + userHeader[0].length + followingUser.index,
    );
  const firstInstallTime = /^\s*firstInstallTime=(.+?)\s*$/mu.exec(userBlock)?.[1] ?? null;
  const ceDataInode = /\bceDataInode=(\d+)\b/u.exec(userBlock)?.[1] ?? null;
  if (versionName === null
      || buildNumber === null
      || firstInstallTime === null
      || ceDataInode === null
      || firstInstallTime.length > 64) {
    fail('Installed ShareItToo package does not expose the required update-preservation facts.');
  }
  return { versionName, buildNumber, firstInstallTime, ceDataInode };
}

function installedApkBytes(commandRunner, adbPath, device, applicationId) {
  const paths = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'pm', 'path', applicationId],
  )
    .split(/\r?\n/u)
    .map((line) => line.replace(/^package:/u, '').trim())
    .filter(Boolean);
  if (paths.length !== 1 || !paths[0].startsWith('/data/app/')) {
    fail('Installed ShareItToo package is not a single direct APK.');
  }
  return Buffer.from(currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'cat', paths[0]],
    { binary: true },
  ));
}

function readInstalledSnapshot(commandRunner, adbPath, device, applicationId) {
  const userId = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'am', 'get-current-user'],
  ).trim();
  return parseAndroidInstalledPackageSnapshot(currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'package', applicationId],
  ), userId);
}

function normalizeCertificate(value) {
  const normalized = String(value).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) {
    fail('Android APK signing certificate could not be verified.');
  }
  return normalized;
}

export function inspectAndroidApkCertificate({
  apkPath,
  apksignerPath,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
}) {
  const output = String(commandRunner(
    apksignerPath,
    ['verify', '--print-certs', apkPath],
  ));
  const certificate = /^(?:V\d+ Signer:|Signer #\d+) certificate SHA-256 digest:\s*([a-f0-9]{64})\s*$/imu
    .exec(output)?.[1];
  return normalizeCertificate(certificate ?? '');
}

function inspectBytesCertificate({ bytes, certificateInspector }) {
  const directory = mkdtempSync(join(tmpdir(), 'sit-installed-apk-'));
  chmodSync(directory, 0o700);
  const path = join(directory, 'installed.apk');
  try {
    writeFileSync(path, bytes, { mode: 0o600 });
    chmodSync(path, 0o600);
    return normalizeCertificate(certificateInspector(path));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function verifyCurrentHeadAndroidCandidateUpdatePrerequisites({
  commandRunner,
  adbPath,
  device,
  candidate,
  certificateInspector,
}) {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const candidateCertificate = normalizeCertificate(
    certificateInspector(candidate.apkPath),
  );
  if (candidateCertificate !== candidate.signingCertificateSha256) {
    fail('Candidate APK certificate does not match the verified private archive.');
  }
  const before = readInstalledSnapshot(
    commandRunner,
    adbPath,
    device,
    candidate.applicationId,
  );
  if (BigInt(candidate.buildNumber) <= BigInt(before.buildNumber)) {
    fail('Candidate build must be strictly newer; downgrade or reinstall is forbidden.');
  }
  const installedBeforeBytes = installedApkBytes(
    commandRunner,
    adbPath,
    device,
    candidate.applicationId,
  );
  const installedBeforeCertificate = inspectBytesCertificate({
    bytes: installedBeforeBytes,
    certificateInspector,
  });
  if (installedBeforeCertificate !== candidateCertificate) {
    fail('Candidate certificate does not match the currently installed app.');
  }
  return { before, candidateCertificate };
}

export function preflightCurrentHeadAndroidCandidateUpdate({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  candidate,
  certificateInspector,
  capturedAt = new Date().toISOString(),
}) {
  const { before } = verifyCurrentHeadAndroidCandidateUpdatePrerequisites({
    commandRunner,
    adbPath,
    device,
    candidate,
    certificateInspector,
  });
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-data-preserving-direct-update-preflight',
    status: 'eligible-no-device-write-performed',
    capturedAt,
    applicationId: candidate.applicationId,
    installedVersion: `${before.versionName}+${before.buildNumber}`,
    candidateVersion: `${candidate.versionName}+${candidate.buildNumber}`,
    conditions: Object.freeze({
      exactPackageIdentity: true,
      candidateSignatureMatchesArchiveAndInstalledApp: true,
      strictlyNewerBuild: true,
      replaceInstallOnly: true,
      uninstallOrResetRequired: false,
      deviceAlreadyUnlocked: true,
      postInstallDataIdentityVerificationRequired: true,
    }),
    boundaries: Object.freeze({
      deviceWritePerformed: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
      containsSigningDigests: false,
    }),
  });
}

function launchAndVerifyForeground(commandRunner, adbPath, device, applicationId) {
  const launch = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${applicationId}/.MainActivity`,
  ]);
  if (!/^Status:\s*ok\s*$/mu.test(launch)
      || !new RegExp(`^Activity:\\s*${applicationId.replaceAll('.', '\\.')}\/`, 'mu')
        .test(launch)) {
    fail('Updated ShareItToo candidate did not complete a deterministic activity start.');
  }
  const activities = currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'dumpsys', 'activity', 'activities'],
  );
  const escaped = applicationId.replaceAll('.', '\\.');
  if (!new RegExp(
    `(?:mResumedActivity|topResumedActivity|ResumedActivity:).*${escaped}/`,
    'u',
  ).test(activities)) {
    fail('Updated ShareItToo candidate did not become the foreground activity.');
  }
}

export function installCurrentHeadAndroidCandidateUpdate({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  certificateInspector,
  capturedAt = new Date().toISOString(),
}) {
  const { before, candidateCertificate } = verifyCurrentHeadAndroidCandidateUpdatePrerequisites({
    commandRunner,
    adbPath,
    device,
    candidate,
    certificateInspector,
  });

  const installResult = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'install',
    '--no-streaming',
    '-r',
    candidate.apkPath,
  ]);
  if (!/(^|\n)Success\s*$/mu.test(installResult)) {
    fail('ADB did not confirm the safe update installation.');
  }

  const after = readInstalledSnapshot(
    commandRunner,
    adbPath,
    device,
    candidate.applicationId,
  );
  if (after.versionName !== candidate.versionName
      || after.buildNumber !== candidate.buildNumber) {
    fail('Installed app identity does not match the current-head candidate.');
  }
  if (after.firstInstallTime !== before.firstInstallTime
      || after.ceDataInode !== before.ceDataInode) {
    fail('Android app data identity changed during the update; preservation is unverified.');
  }
  const installedAfterBytes = installedApkBytes(
    commandRunner,
    adbPath,
    device,
    candidate.applicationId,
  );
  if (sha256Bytes(installedAfterBytes) !== candidate.apkSha256) {
    fail('Installed APK bytes do not match the verified current-head candidate.');
  }
  const installedAfterCertificate = inspectBytesCertificate({
    bytes: installedAfterBytes,
    certificateInspector,
  });
  if (installedAfterCertificate !== candidateCertificate) {
    fail('Installed APK certificate changed during the update.');
  }
  launchAndVerifyForeground(
    commandRunner,
    adbPath,
    device,
    candidate.applicationId,
  );

  return {
    schemaVersion: 1,
    kind: 'android-current-head-data-preserving-direct-update',
    status: 'passed-data-preserving-direct-update',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.apkSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
      privacyScan: candidate.privacyScan,
    },
    device: deviceSummary,
    update: {
      installedVersionBefore: `${before.versionName}+${before.buildNumber}`,
      installedVersionAfter: `${after.versionName}+${after.buildNumber}`,
      strictlyNewerBuildInstalled: true,
      candidateSignatureMatchedInstalledApp: true,
      installedCandidateHashMatches: true,
      firstInstallTimePreserved: true,
      ceDataInodePreserved: true,
      foregroundActivityVerified: true,
      method: 'adb-install-no-streaming-replace',
    },
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      uninstallUsed: false,
      dataResetUsed: false,
      downgradeUsed: false,
      loginPerformed: false,
      accountMutationPerformed: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  };
}

function resolveApksigner(root) {
  const localProperties = resolve(root, 'android', 'local.properties');
  const configured = process.env.ANDROID_HOME
    ?? process.env.ANDROID_SDK_ROOT
    ?? (existsSync(localProperties)
      ? /^sdk\.dir=(.+)$/mu.exec(readFileSync(localProperties, 'utf8'))?.[1]
      : undefined)
    ?? resolve(process.env.HOME ?? '', 'Library', 'Android', 'sdk');
  const buildTools = resolve(configured, 'build-tools');
  if (!existsSync(buildTools)) fail('Android build-tools directory is unavailable.');
  const versions = readdirSync(buildTools).sort((left, right) => (
    left.localeCompare(right, undefined, { numeric: true })
  ));
  const path = resolve(buildTools, versions.at(-1) ?? '', 'apksigner');
  if (!existsSync(path)) fail('Android apksigner is unavailable.');
  return path;
}

function parseArguments(values) {
  let candidateDirectory;
  let adbPath = 'adb';
  let apksignerPath;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1] ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else if (values[index] === '--apksigner') {
      apksignerPath = values[index + 1] ?? fail('--apksigner requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  return { candidateDirectory, adbPath, apksignerPath };
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseArguments(process.argv.slice(2));
  const candidate = await validateCurrentRolloverAndroidReleaseArchive({
    root,
    candidateDirectory: args.candidateDirectory,
  });
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: args.adbPath, device });
  const apksignerPath = resolve(args.apksignerPath ?? resolveApksigner(root));
  const evidence = installCurrentHeadAndroidCandidateUpdate({
    adbPath: args.adbPath,
    device,
    deviceSummary,
    candidate,
    certificateInspector: (apkPath) => inspectAndroidApkCertificate({
      apkPath,
      apksignerPath,
    }),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error?.message ?? 'Current-head Android update failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
