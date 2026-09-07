#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';
import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  readEmailVerifiedJourneyVault,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const applicationId = 'com.shareittoo.app';

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sanitizeGoogleSocialAuthFailure(error) {
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (message.length === 0
      || message.length > 240
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|serial)/iu.test(message)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(message)) {
    return 'safe diagnostic reason unavailable';
  }
  return message;
}

export function googleProfileFingerprint(hierarchy) {
  const value = String(hierarchy);
  if (value.length === 0 || !value.includes('Abmelden')) {
    fail('Authenticated profile hierarchy is unavailable.');
  }
  return sha256(value);
}

export function classifyGoogleSocialAuthSurface(hierarchy, { mailbox } = {}) {
  const value = String(hierarchy);
  const has = (label) => currentHeadAndroidNamedNodes(value, label).length > 0;
  if (has('Abmelden') && has('Entdecken') && has('Mein SIT')) {
    return 'authenticated-main';
  }
  if (has('Abmelden')) return 'authenticated-profile';
  if (typeof mailbox === 'string' && mailbox.length > 0 && has(mailbox)) {
    return 'private-account-chooser';
  }
  if (has('Mit Google anmelden')) return 'login-entry';
  if (has('Registrieren')
      && (value.includes('AGB') || value.includes('Datenschutz'))
      && (value.includes('18') || value.includes('Privat'))) {
    return 'registration-consent';
  }
  if (value.includes('noch nicht freigeschaltet')) {
    return 'provider-unavailable';
  }
  if (value.includes('Anmeldung ist gerade nicht erreichbar')) {
    return 'provider-or-backend-error';
  }
  if (has('Anmelden')) return 'signed-out';
  return 'unclassified';
}

function assertOwnerOnlyFile(path, label) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile() || stat.size === 0
      || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be a non-empty owner-only file.`);
  }
}

function readPrivateMailbox(path) {
  assertOwnerOnlyFile(path, 'Private Google mailbox selector');
  const mailbox = readFileSync(path, 'utf8').trim();
  if (mailbox.length > 254 || !/^[^@\s]+@[^@\s]+$/u.test(mailbox)) {
    fail('Private Google mailbox selector is invalid.');
  }
  return mailbox;
}

function pointForNode(node, label) {
  const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

function tapNamedNode(
  commandRunner,
  adbPath,
  device,
  hierarchy,
  label,
  { chooseLast = false } = {},
) {
  const nodes = currentHeadAndroidNamedNodes(hierarchy, label);
  if (nodes.length === 0) fail(`The sanitized ${label} action is unavailable.`);
  const point = pointForNode(chooseLast ? nodes.at(-1) : nodes[0], label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

async function waitForHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  attempts = 40,
  label,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(
      commandRunner,
      adbPath,
      device,
    );
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

async function openProfile({ commandRunner, adbPath, device, wait }) {
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  const destinations = currentHeadAndroidNamedNodes(main, 'Mein SIT')
    .map((node) => ({ node, ...pointForNode(node, 'Mein SIT') }))
    .toSorted((left, right) => right.y - left.y);
  if (destinations.length === 0) fail('The sanitized profile destination is unavailable.');
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(destinations[0].x), String(destinations[0].y),
  ]);
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated profile',
    predicate: (hierarchy) => (
      currentHeadAndroidNamedNodes(hierarchy, 'Abmelden').length > 0
        && currentHeadAndroidNamedNodes(hierarchy, 'Anmelden').length === 0
    ),
  });
}

async function loginWithExactPrivateGoogleAccount({
  commandRunner,
  adbPath,
  device,
  wait,
  mailbox,
}) {
  const guest = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  tapNamedNode(commandRunner, adbPath, device, guest, 'Anmelden', {
    chooseLast: true,
  });
  let hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Google login entry',
    predicate: (value) => (
      currentHeadAndroidNamedNodes(value, 'Mit Google anmelden').length === 1
    ),
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Mit Google anmelden');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'private Google account chooser',
    predicate: (value) => currentHeadAndroidNamedNodes(value, mailbox).length === 1,
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, mailbox);
  await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  return openProfile({ commandRunner, adbPath, device, wait });
}

function writePrivateHierarchy(directory, name, hierarchy) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = resolve(directory, name);
  writeFileSync(path, hierarchy, { mode: 0o600 });
  chmodSync(path, 0o600);
  return sha256(hierarchy);
}

export async function diagnoseAndroidGoogleSocialAuth({
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  mailboxFile,
  protectedOwnerVaultFile,
  privateEvidenceDirectory,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(
    commandRunner,
    adbPath,
    device,
  );
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  if (candidate.socialAuth?.googleEnabled !== true
      || candidate.socialAuth?.appleEnabled !== false
      || candidate.socialAuth?.facebookEnabled !== false) {
    fail('The installed candidate is not the exact Google-only social profile.');
  }
  const mailbox = readPrivateMailbox(mailboxFile);
  assertOwnerOnlyFile(protectedOwnerVaultFile, 'Protected synthetic owner vault');
  const { vault } = readEmailVerifiedJourneyVault(protectedOwnerVaultFile);
  const protectedOwner = vault.accounts.find((entry) => entry.role === 'owner');
  if (!protectedOwner) fail('Protected synthetic owner role is unavailable.');

  let diagnosticFailure = null;
  let firstProfile;
  let coldProfile;
  let repeatProfile;
  let failureSurface = 'unavailable';
  let failureSurfaceSha256 = null;
  try {
    await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
    firstProfile = await loginWithExactPrivateGoogleAccount({
      commandRunner,
      adbPath,
      device,
      wait,
      mailbox,
    });
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'am', 'force-stop', applicationId,
    ]);
    launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
    coldProfile = await openProfile({ commandRunner, adbPath, device, wait });

    await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
    repeatProfile = await loginWithExactPrivateGoogleAccount({
      commandRunner,
      adbPath,
      device,
      wait,
      mailbox,
    });
  } catch (error) {
    diagnosticFailure = error;
    try {
      const hierarchy = dumpCurrentHeadAndroidUi(
        commandRunner,
        adbPath,
        device,
      );
      failureSurface = classifyGoogleSocialAuthSurface(hierarchy, { mailbox });
      failureSurfaceSha256 = writePrivateHierarchy(
        privateEvidenceDirectory,
        'google-failure-surface.xml',
        hierarchy,
      );
    } catch {
      failureSurface = 'unavailable';
      failureSurfaceSha256 = null;
    }
  }

  let protectedOwnerRestored = false;
  try {
    await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
    protectedOwnerRestored = await restoreSyntheticSession({
      commandRunner,
      adbPath,
      device,
      wait,
      account: protectedOwner,
    });
  } catch {
    protectedOwnerRestored = false;
  }
  if (!protectedOwnerRestored) {
    fail('The protected synthetic owner session could not be restored.');
  }
  if (diagnosticFailure !== null) {
    const capture = failureSurfaceSha256 === null
      ? 'private-capture-unavailable'
      : 'private-capture-retained';
    throw new Error(
      `Google social-auth stopped at ${failureSurface}; ${capture}.`,
      { cause: diagnosticFailure },
    );
  }

  const firstHash = googleProfileFingerprint(firstProfile);
  const coldHash = googleProfileFingerprint(coldProfile);
  const repeatHash = googleProfileFingerprint(repeatProfile);
  if (firstHash !== coldHash || firstHash !== repeatHash) {
    fail('The exact Google account did not retain one stable Staging profile.');
  }
  const privateHashes = {
    firstProfileSha256: writePrivateHierarchy(
      privateEvidenceDirectory,
      'google-first-profile.xml',
      firstProfile,
    ),
    coldProfileSha256: writePrivateHierarchy(
      privateEvidenceDirectory,
      'google-cold-profile.xml',
      coldProfile,
    ),
    repeatProfileSha256: writePrivateHierarchy(
      privateEvidenceDirectory,
      'google-repeat-profile.xml',
      repeatProfile,
    ),
  };

  return {
    schemaVersion: 1,
    kind: 'android-google-social-auth-principal-epoch-diagnostic',
    status: 'passed-google-login-cold-start-repeat-and-owner-restore',
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
      socialAuth: candidate.socialAuth,
    },
    installed: {
      physicalDevice: true,
      exactCandidateHashMatched: true,
      versionName: installed.versionName,
      buildNumber: installed.buildNumber,
      delivery: installed.delivery,
    },
    device: deviceSummary,
    results: {
      exactPrivateGoogleAccountSelected: true,
      firstGoogleLogin: 'passed',
      coldStartSessionPersistence: 'passed',
      repeatGoogleLogin: 'passed',
      sameStagingProfileAcrossAllThreeObservations: true,
      duplicateAccountObserved: false,
      accountCreationVersusExistingLinkage: 'not-asserted',
      protectedSyntheticOwnerRestored: true,
      privateArtifacts: privateHashes,
    },
    boundaries: {
      stagingOnly: true,
      googleOnly: true,
      appleUsed: false,
      facebookUsed: false,
      productionChanged: false,
      googlePlayChanged: false,
      firebaseConfigurationChanged: false,
      paymentCalled: false,
      realMoneyUsed: false,
      publicRegistrationChanged: false,
      accountIdentityRecorded: false,
      containsEmailAddress: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  };
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

export function parseGoogleSocialAuthArguments(values) {
  let candidateDirectory = null;
  let adbPath = 'adb';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--candidate-dir') {
      candidateDirectory = values[index + 1]
        ?? fail('--candidate-dir requires a path.');
      index += 1;
    } else if (values[index] === '--adb') {
      adbPath = values[index + 1] ?? fail('--adb requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (candidateDirectory === null) {
    fail('--candidate-dir is required.');
  }
  return { candidateDirectory, adbPath };
}

async function run() {
  const args = parseGoogleSocialAuthArguments(process.argv.slice(2));
  const mailboxFile = requiredEnvironment('SIT_N23_GOOGLE_MAILBOX_FILE');
  const protectedOwnerVaultFile = requiredEnvironment(
    'SIT_N23_PROTECTED_OWNER_VAULT_FILE',
  );
  const privateEvidenceDirectory = requiredEnvironment(
    'SIT_N23_PRIVATE_EVIDENCE_DIR',
  );
  const candidate = await validatePrivateAndroidReleaseArchive({
    candidateDirectory: resolve(args.candidateDirectory),
  });
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner(args.adbPath, ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({
    adbPath: args.adbPath,
    device,
  });
  try {
    const evidence = await diagnoseAndroidGoogleSocialAuth({
      adbPath: args.adbPath,
      device,
      deviceSummary,
      candidate,
      mailboxFile,
      protectedOwnerVaultFile,
      privateEvidenceDirectory,
    });
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `ERROR: ${sanitizeGoogleSocialAuthFailure(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
