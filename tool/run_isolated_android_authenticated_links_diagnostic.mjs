#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { diagnoseAndroidAuthenticatedLinks } from './diagnose_android_authenticated_links.mjs';
import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
  validateCandidateArchive,
} from './prepare_android_device_test.mjs';
import {
  prepareSyntheticBookingThread,
  retireSyntheticBookingFixture,
  runSyntheticRoleBookingLifecycle,
} from './run_staging_synthetic_booking.mjs';

const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function readProtectedVault(vaultFile) {
  const raw = readFileSync(vaultFile);
  const vault = JSON.parse(raw.toString('utf8'));
  if (vault.kind !== 'sit-staging-synthetic-account-vault'
      || vault.apiBaseUrl !== stagingApiBaseUrl
      || vault.stripeLivemode !== false
      || !Array.isArray(vault.accounts)
      || vault.accounts.length !== 2
      || vault.accounts.some((account) => !['owner', 'renter'].includes(account?.role))) {
    fail('The protected review vault is not a safe two-role Staging fixture.');
  }
  const fixture = vault.syntheticBooking;
  const readyWithoutBooking = fixture === undefined
    && vault.status === 'fixture-verified-ready-for-login';
  const safeActiveBooking = fixture !== undefined
    && ['accepted', 'active'].includes(fixture.workflowStatus)
    && fixture.paymentMode === 'memory'
    && fixture.stripeLivemode === false
    && fixture.paymentEndpointCalled === false;
  if (!readyWithoutBooking && !safeActiveBooking) {
    fail('The protected review vault must be login-ready or hold an active payment-free fixture.');
  }
  return { raw, vault };
}

function accountForRole(vault, role) {
  const account = vault.accounts.find((candidate) => candidate?.role === role);
  if (!account) fail(`The private ${role} fixture is unavailable.`);
  return account;
}

function reusableCompletedFixture(vault) {
  const history = Array.isArray(vault.syntheticBookingHistory)
    ? vault.syntheticBookingHistory
    : [];
  return history.findLast((fixture) => (
    fixture?.workflowStatus === 'completed'
    && fixture?.paymentMode === 'memory'
    && fixture?.stripeLivemode === false
    && fixture?.paymentEndpointCalled === false
    && fixture?.archivedAt == null
    && fixture?.retiredAt == null
    && fixture?.listingStatus !== 'paused'
    && typeof fixture?.listingId === 'string'
    && fixture.listingId.length > 0
    && typeof fixture?.bookingId === 'string'
    && fixture.bookingId.length > 0
    && typeof fixture?.title === 'string'
    && fixture.title.length > 0
  )) ?? null;
}

export async function runIsolatedAndroidAuthenticatedLinksDiagnostic({
  vaultFile,
  lifecycleRunner,
  threadRunner,
  retirementRunner,
  ensureGuestRunner,
  restoreSessionRunner,
  deepLinkRunner,
}) {
  const protectedVaultFile = resolve(nonEmptyString(vaultFile, 'vaultFile'));
  const { raw: originalRaw, vault } = readProtectedVault(protectedVaultFile);
  const originalSha256 = sha256(originalRaw);
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'sit-isolated-authenticated-links-'));
  chmodSync(temporaryDirectory, 0o700);
  const isolatedVaultFile = resolve(temporaryDirectory, 'accounts.json');
  const isolatedVault = structuredClone(vault);
  const recoveredCompletedFixture = reusableCompletedFixture(isolatedVault);
  if (recoveredCompletedFixture === null) {
    delete isolatedVault.syntheticBooking;
    isolatedVault.status = 'fixture-verified-ready-for-login';
  } else {
    isolatedVault.syntheticBooking = structuredClone(recoveredCompletedFixture);
    isolatedVault.status = 'synthetic-booking-completed';
  }
  nonEmptyString(vault.runId, 'runId');
  isolatedVault.runId = `auth-links-${randomBytes(8).toString('hex')}`;
  writeFileSync(isolatedVaultFile, `${JSON.stringify(isolatedVault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(isolatedVaultFile, 0o600);

  const protectedAccount = accountForRole(vault, 'owner');
  const isolatedAccount = accountForRole(isolatedVault, 'owner');
  let result;
  let primaryFailure = null;
  let sessionMutationStarted = false;
  let fixtureReadyForRetirement = recoveredCompletedFixture !== null;

  try {
    if (recoveredCompletedFixture === null) {
      const lifecycle = await lifecycleRunner(isolatedVaultFile);
      if (lifecycle?.status !== 'passed-bounded-synthetic-role-booking-lifecycle'
          || lifecycle?.paymentEndpointCalled !== false
          || lifecycle?.stripeLivemode !== false) {
        fail('The isolated Staging lifecycle did not reach a safe completed fixture.');
      }
      fixtureReadyForRetirement = true;
    }
    const thread = await threadRunner(isolatedVaultFile);
    if (thread?.status !== 'synthetic-booking-thread-ready'
        || thread?.workflowStatus !== 'completed'
        || thread?.paymentEndpointCalled !== false
        || thread?.stripeLivemode !== false) {
      fail('The isolated completed fixture did not produce a safe booking thread.');
    }

    sessionMutationStarted = true;
    if (await ensureGuestRunner() !== true || await restoreSessionRunner(isolatedAccount) !== true) {
      fail('The isolated Android test session could not be established safely.');
    }
    const evidence = await deepLinkRunner(isolatedVaultFile);
    if (evidence?.status !== 'passed-bounded-authenticated-deep-link-diagnostic'
        || evidence?.boundaries?.authenticatedDeepLinksPassed !== true
        || evidence?.boundaries?.containsSecrets !== false
        || evidence?.boundaries?.containsReviewCredentials !== false) {
      fail('The isolated authenticated-link diagnostic did not pass safely.');
    }
    result = {
      ...evidence,
      isolation: {
        protectedReviewFixtureUnchanged: true,
        protectedReviewSessionRestored: true,
        temporaryBookingCompleted: true,
        temporaryListingPaused: true,
        temporaryListingDeleted: false,
        temporaryVaultRemovedAfterProbe: true,
        containsReviewCredentials: false,
      },
    };
  } catch (error) {
    primaryFailure = error;
  } finally {
    let restorationFailure = null;
    let retirementFailure = null;
    if (sessionMutationStarted) {
      try {
        if (await ensureGuestRunner() !== true || await restoreSessionRunner(protectedAccount) !== true) {
          fail('The protected Android review session was not restored.');
        }
      } catch {
        restorationFailure = new Error(
          'The protected Android review session could not be restored after the isolated probe.',
        );
      }
    }
    if (fixtureReadyForRetirement) {
      try {
        const retirement = await retirementRunner(isolatedVaultFile);
        if (retirement?.status !== 'synthetic-booking-retired'
            || retirement?.bookingCompleted !== true
            || retirement?.listingPaused !== true
            || retirement?.listingDeleted !== false
            || retirement?.paymentEndpointCalled !== false
            || retirement?.stripeLivemode !== false) {
          fail('The isolated completed fixture was not retired safely.');
        }
      } catch {
        retirementFailure = new Error(
          'The isolated completed fixture could not be retired safely after the authenticated-link probe.',
        );
      }
    }
    const protectedUnchanged = sha256(readFileSync(protectedVaultFile)) === originalSha256;
    rmSync(temporaryDirectory, { recursive: true, force: true });
    if (!protectedUnchanged) {
      throw new Error('The protected review vault changed during the isolated authenticated-link probe.');
    }
    if (restorationFailure !== null) throw restorationFailure;
    if (retirementFailure !== null) throw retirementFailure;
  }

  if (primaryFailure !== null) throw primaryFailure;
  return result;
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function defaultCommandRunner(file, args, { binary = false } = {}) {
  return execFileSync(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = process.argv.slice(2);
  const vaultFile = resolve(argumentValue(args, '--vault-file') ?? fail('--vault-file is required.'));
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const candidateDirectoryArgument = argumentValue(args, '--candidate-dir');
  const manifest = JSON.parse(readFileSync(resolve(root, 'store/device-validation.json'), 'utf8'));
  const candidate = manifest.candidate;
  const candidateDirectory = resolve(
    candidateDirectoryArgument
      ?? resolve(
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
  const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

  const evidence = await runIsolatedAndroidAuthenticatedLinksDiagnostic({
    vaultFile,
    lifecycleRunner: async (isolatedVaultFile) => runSyntheticRoleBookingLifecycle({
      vaultFile: isolatedVaultFile,
    }),
    threadRunner: async (isolatedVaultFile) => prepareSyntheticBookingThread({
      vaultFile: isolatedVaultFile,
    }),
    retirementRunner: async (isolatedVaultFile) => retireSyntheticBookingFixture({
      vaultFile: isolatedVaultFile,
    }),
    ensureGuestRunner: async () => ensureAndroidGuestSession({
      commandRunner: defaultCommandRunner,
      adbPath,
      device,
      wait,
    }),
    restoreSessionRunner: async (account) => restoreSyntheticSession({
      commandRunner: defaultCommandRunner,
      adbPath,
      device,
      wait,
      account,
    }),
    deepLinkRunner: async (isolatedVaultFile) => diagnoseAndroidAuthenticatedLinks({
      vaultFile: isolatedVaultFile,
      commandRunner: defaultCommandRunner,
      adbPath,
      device,
      deviceSummary,
      candidate,
      archive,
      wait,
    }),
  });
  console.log(JSON.stringify(evidence, null, 2));
}

if (typeof process !== 'undefined'
    && process.argv?.[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
