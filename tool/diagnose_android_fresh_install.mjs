#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from './prepare_android_device_test.mjs';
import { diagnoseAndroidAuthenticatedSession } from './diagnose_android_authenticated_session.mjs';
import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';
import { selectLatestEligibleVault } from './diagnose_store_review_accounts.mjs';

const applicationId = 'com.shareittoo.app';
const defaultVaultRoot = join(
  homedir(),
  'Library',
  'Application Support',
  'ShareItToo',
  'qa',
  'staging-accounts',
);

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function defaultCommandRunner(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function clearApplicationData(commandRunner, adbPath, device) {
  let result;
  try {
    result = commandRunner(adbPath, [
      '-s',
      device.serial,
      'shell',
      'pm',
      'clear',
      applicationId,
    ]);
  } catch {
    fail('Android could not clear the isolated ShareItToo app data.');
  }
  if (String(result).trim() !== 'Success') {
    fail('Android did not confirm the isolated ShareItToo app-data reset.');
  }
}

export async function diagnoseAndroidFreshInstall({
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  archive,
  account,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  restoreSession = restoreSyntheticSession,
  ensureGuest = ensureAndroidGuestSession,
  authenticate = diagnoseAndroidAuthenticatedSession,
}) {
  let resetConfirmed = false;
  let guestConfirmed = false;
  let sessionRestored = false;
  let diagnosticFailure = null;

  try {
    const preflightRestored = await restoreSession({
      commandRunner,
      adbPath,
      device,
      wait,
      account,
    });
    if (!preflightRestored) fail('The private synthetic Staging session was unavailable before reset.');

    await authenticate({
      commandRunner,
      adbPath,
      device,
      deviceSummary,
      candidate,
      archive,
      wait,
    });

    clearApplicationData(commandRunner, adbPath, device);
    resetConfirmed = true;
    guestConfirmed = await ensureGuest({ commandRunner, adbPath, device, wait });
    if (!guestConfirmed) fail('The cleared Play installation did not open in a signed-out first-start state.');

    sessionRestored = await restoreSession({
      commandRunner,
      adbPath,
      device,
      wait,
      account,
    });
    if (!sessionRestored) fail('The private synthetic Staging session was not restored after reset.');

    const postReset = await authenticate({
      commandRunner,
      adbPath,
      device,
      deviceSummary,
      candidate,
      archive,
      wait,
    });
    if (postReset.installed?.delivery !== 'google-play-split'
        || postReset.installed?.installerPackageName !== 'com.android.vending'
        || postReset.tests?.authenticatedProfileAccess?.status !== 'passed'
        || postReset.tests?.coldStartSessionRestore?.status !== 'passed') {
      fail('The restored session did not retain the exact Google Play candidate guarantees.');
    }
  } catch (error) {
    diagnosticFailure = error;
  }

  if (resetConfirmed && !sessionRestored) {
    sessionRestored = await restoreSession({
      commandRunner,
      adbPath,
      device,
      wait,
      account,
    });
  }
  if (resetConfirmed && !sessionRestored) {
    fail('The app-data reset completed, but the protected synthetic session could not be restored.');
  }
  if (diagnosticFailure !== null) throw diagnosticFailure;

  return {
    schemaVersion: 1,
    kind: 'android-fresh-install-diagnostic',
    status: 'passed-play-install-fresh-app-data-and-session-restore',
    capturedAt,
    scenario: 'freshInstall',
    candidate: {
      applicationId: candidate.applicationId,
      bundleId: candidate.bundleId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
    },
    installed: {
      delivery: 'google-play-split',
      installerPackageName: 'com.android.vending',
      packageIdentityVerifiedBeforeAndAfterReset: true,
    },
    checks: {
      isolatedAppDataResetConfirmed: true,
      signedOutFirstStartConfirmed: true,
      syntheticReviewLoginRestored: true,
      authenticatedProfileConfirmed: true,
      coldStartSessionRestoreConfirmed: true,
    },
    environment: {
      apiBaseUrl: candidate.apiBaseUrl,
      paymentMode: candidate.paymentMode,
      stripeLivemode: candidate.stripeLivemode,
      paymentEndpointCalled: false,
    },
    device: deviceSummary,
    boundaries: {
      appPackageUninstalled: false,
      playTrackChanged: false,
      publicStoreChanged: false,
      productionChanged: false,
      syntheticAccountsOnly: true,
      containsSecrets: false,
      containsEmailAddresses: false,
      containsTokens: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
      rawDeviceIdentifierPrinted: false,
      lockCodeUsed: false,
    },
  };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = process.argv.slice(2);
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const vaultRoot = resolve(argumentValue(args, '--vault-root') ?? defaultVaultRoot);
  const deviceManifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
  const candidate = deviceManifest.candidate;
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir')
      ?? join(
        homedir(),
        'Library',
        'Application Support',
        'ShareItToo',
        'release',
        'android',
        `${nonEmptyString(candidate.buildNumber, 'candidate.buildNumber')}-${nonEmptyString(candidate.commit, 'candidate.commit')}`,
      ),
  );
  const archive = await validateCandidateArchive({ root, candidateDirectory });
  const devices = parseAdbDevices(defaultCommandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const selected = selectLatestEligibleVault(vaultRoot);
  const account = selected.accounts.get('owner') ?? fail('The verified owner review role is unavailable.');
  const evidence = await diagnoseAndroidFreshInstall({
    adbPath,
    device,
    deviceSummary,
    candidate,
    archive,
    account,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (typeof process !== 'undefined' && process.argv?.[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
