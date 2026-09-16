#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createSyntheticBookingFixture,
  prepareSyntheticBookingThread,
  retireSyntheticBookingFixture,
  transitionSyntheticBookingFixture,
} from './run_staging_synthetic_booking.mjs';

const diagnostics = Object.freeze({
  fcm: './diagnose_android_controlled_fcm.mjs',
  logout: './diagnose_android_logout_lifecycle.mjs',
  offline: './diagnose_android_offline_realtime.mjs',
});

function fail(message) {
  throw new Error(message);
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

const unsafeFailureDetail = /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|\b\d{6,}\b)/iu;

export function sanitizedChildFailure(error) {
  const stderr = Buffer.isBuffer(error?.stderr)
    ? error.stderr.toString('utf8')
    : typeof error?.stderr === 'string'
      ? error.stderr
      : '';
  const line = stderr
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('ERROR: '))
    .at(-1);
  const candidates = [
    line === undefined ? null : line.slice('ERROR: '.length).trim(),
    typeof error?.message === 'string' ? error.message.trim() : null,
  ];
  for (const detail of candidates) {
    if (detail === null || detail.length === 0 || detail.length > 240) continue;
    const structuredStagingFailure = /^Staging (GET|POST|PUT|PATCH|DELETE) request failed with HTTP (\d{3})(?: \(([A-Za-z0-9_.:-]{1,120})\))?(?: \[request [^\]]+\])?\.$/u.exec(detail);
    if (structuredStagingFailure !== null) {
      const [, method, status, code] = structuredStagingFailure;
      return `Staging ${method} request failed with HTTP ${status}${code ? ` (${code})` : ''}.`;
    }
    if (unsafeFailureDetail.test(detail)) continue;
    if (!/^[A-Za-z0-9 .,()'/-]+$/u.test(detail)) continue;
    return detail;
  }
  return null;
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function protectedVault(path) {
  const raw = readFileSync(path);
  const vault = JSON.parse(raw.toString('utf8'));
  if (vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || vault?.stripeLivemode !== false
      || !Array.isArray(vault.accounts)
      || vault.accounts.length !== 2) {
    fail('The protected review vault is not a safe two-role Staging fixture.');
  }
  return { raw, vault };
}

export function reusableNonBindingDiagnosticContext(vault) {
  const simulation = vault?.nonBindingSimulation;
  const expectedVerificationStatus = new Map([
    ['isolated-staging-fixture', 'fixture-verified'],
    ['email-link', 'email-link-verified'],
  ]).get(vault?.verificationMethod);
  const accountRoles = new Set(
    Array.isArray(vault?.accounts)
      ? vault.accounts.map((account) => account?.role)
      : [],
  );
  return vault?.status === 'non-binding-simulation-active'
    && expectedVerificationStatus !== undefined
    && Array.isArray(vault.accounts)
    && vault.accounts.length === 2
    && accountRoles.size === 2
    && accountRoles.has('owner')
    && accountRoles.has('renter')
    && vault.accounts.every((account) => (
      account?.registrationStatus === 'accepted'
      && account?.verificationStatus === expectedVerificationStatus
    ))
    && simulation?.schemaVersion === 1
    && simulation.status === 'accepted-chat-ready'
    && typeof simulation.listingId === 'string'
    && typeof simulation.bookingId === 'string'
    && typeof simulation.threadId === 'string'
    && simulation.availabilityUnaffected === true
    && simulation.paymentReadRejected === true
    && simulation.inAppNotificationsVerified === true
    && simulation.paymentEndpointCalled === false
    && simulation.stripeLivemode === false;
}

export function projectNonBindingDiagnosticVault(vault) {
  if (!reusableNonBindingDiagnosticContext(vault)) {
    fail('The protected non-binding simulation cannot be projected for diagnostics.');
  }
  const projected = structuredClone(vault);
  const simulation = projected.nonBindingSimulation;
  projected.syntheticBooking = {
    schemaVersion: 1,
    listingId: simulation.listingId,
    bookingId: simulation.bookingId,
    threadId: simulation.threadId,
    title: `SIT Rollenprüfung ${projected.runId}`,
    workflowStatus: 'accepted',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  delete projected.nonBindingSimulation;
  projected.status = 'synthetic-booking-active';
  return projected;
}

async function run() {
  const args = process.argv.slice(2);
  const kind = argumentValue(args, '--kind') ?? fail('--kind is required.');
  const diagnosticRelativePath = diagnostics[kind] ?? fail('--kind must be fcm, logout, or offline.');
  const vaultFile = resolve(argumentValue(args, '--vault-file') ?? fail('--vault-file is required.'));
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const candidateDirectory = argumentValue(args, '--candidate-dir');
  const privateArtifactDirectory = argumentValue(args, '--private-artifact-dir');
  const { raw, vault } = protectedVault(vaultFile);
  const originalSha256 = sha256(raw);
  const reuseNonBinding = reusableNonBindingDiagnosticContext(vault);
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), `sit-isolated-${kind}-`));
  chmodSync(temporaryDirectory, 0o700);
  const isolatedVaultFile = resolve(temporaryDirectory, 'accounts.json');
  const isolatedVault = reuseNonBinding
    ? projectNonBindingDiagnosticVault(vault)
    : structuredClone(vault);
  if (!reuseNonBinding) {
    delete isolatedVault.syntheticBooking;
    delete isolatedVault.nonBindingSimulation;
    isolatedVault.status = 'fixture-verified-ready-for-login';
    isolatedVault.runId = `${kind}-${randomBytes(8).toString('hex')}`;
  }
  writeFileSync(isolatedVaultFile, `${JSON.stringify(isolatedVault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(isolatedVaultFile, 0o600);

  let result;
  let primaryFailure = null;
  let fixtureCreated = false;
  let retirement = null;
  let failureStage = 'create-fixture';
  try {
    if (!reuseNonBinding) {
      await createSyntheticBookingFixture({ vaultFile: isolatedVaultFile });
      fixtureCreated = true;
      failureStage = 'accept-fixture';
      await transitionSyntheticBookingFixture({ vaultFile: isolatedVaultFile, status: 'accepted' });
      failureStage = 'prepare-thread';
      await prepareSyntheticBookingThread({ vaultFile: isolatedVaultFile, actorRole: 'owner' });
    }
    failureStage = 'bind-device-session';
    const sessionBindingPath = fileURLToPath(new URL(
      './restore_android_synthetic_session.mjs',
      import.meta.url,
    ));
    execFileSync(process.execPath, [
      sessionBindingPath,
      '--vault-file', isolatedVaultFile,
      '--role', 'owner',
      '--adb', adbPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    failureStage = 'device-diagnostic';
    const diagnosticPath = fileURLToPath(new URL(diagnosticRelativePath, import.meta.url));
    const childArgs = [
      diagnosticPath,
      '--vault-file', isolatedVaultFile,
      '--adb', adbPath,
    ];
    if (candidateDirectory !== null) childArgs.push('--candidate-dir', candidateDirectory);
    if (kind === 'fcm' && privateArtifactDirectory !== null) {
      childArgs.push('--private-artifact-dir', privateArtifactDirectory);
    }
    const output = execFileSync(process.execPath, childArgs, {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    result = JSON.parse(output);
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (fixtureCreated) {
      try {
        retirement = await retireSyntheticBookingFixture({ vaultFile: isolatedVaultFile });
      } catch {
        if (primaryFailure === null) {
          primaryFailure = new Error('The isolated diagnostic fixture could not be retired safely.');
        }
      }
    }
    const protectedUnchanged = sha256(readFileSync(vaultFile)) === originalSha256;
    rmSync(temporaryDirectory, { recursive: true, force: true });
    if (!protectedUnchanged) {
      throw new Error('The protected review vault changed during the isolated diagnostic.');
    }
  }
  if (primaryFailure !== null) {
    const detail = sanitizedChildFailure(primaryFailure);
    fail(detail === null
      ? `The isolated ${kind} diagnostic failed safely during ${failureStage}.`
      : `The isolated ${kind} diagnostic failed safely: ${detail}`);
  }
  const evidence = result?.evidence ?? result;
  console.log(JSON.stringify({
    ...evidence,
    isolation: reuseNonBinding
      ? {
          mode: 'existing-protected-non-binding-simulation',
          protectedReviewFixturePreserved: true,
          diagnosticMessagesOnly: true,
          temporaryVaultRemovedAfterProbe: true,
          listingCreatedDuringProbe: false,
          reservationCreatedDuringProbe: false,
          contractCreatedDuringProbe: false,
          containsReviewCredentials: false,
        }
      : {
          protectedReviewFixtureUnchanged: true,
          temporaryVaultRemovedAfterProbe: true,
          temporaryBookingCompleted: retirement?.bookingCompleted === true,
          temporaryListingPaused: retirement?.listingPaused === true,
          listingDeleted: false,
          containsReviewCredentials: false,
        },
  }, null, 2));
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
