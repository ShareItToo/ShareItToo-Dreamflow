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

import { retireSyntheticBookingFixture } from './run_staging_synthetic_booking.mjs';
import {
  reusableNonBindingDiagnosticContext,
} from './run_isolated_android_device_message_diagnostic.mjs';

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

function sanitizedChildFailure(error) {
  const stderr = Buffer.isBuffer(error?.stderr)
    ? error.stderr.toString('utf8')
    : typeof error?.stderr === 'string'
      ? error.stderr
      : '';
  const line = stderr.split(/\r?\n/u).map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('ERROR: ')).at(-1);
  if (line === undefined) return null;
  const detail = line.slice('ERROR: '.length).trim();
  if (detail.length === 0 || detail.length > 240
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:()[\]'/-]+$/u.test(detail)) {
    return null;
  }
  return detail;
}

function sanitizedLocalFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 300
      || /(?:@|https?:\/\/|\/Users\/|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:()[\]'/-]+$/u.test(detail)) {
    return 'safe cleanup reason unavailable';
  }
  return detail;
}

function readProtectedVault(vaultFile) {
  const raw = readFileSync(vaultFile);
  const vault = JSON.parse(raw.toString('utf8'));
  if (vault.kind !== 'sit-staging-synthetic-account-vault' ||
      vault.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1' ||
      vault.stripeLivemode !== false ||
      !Array.isArray(vault.accounts) || vault.accounts.length !== 2 ||
      vault.accounts.some((account) => !['owner', 'renter'].includes(account?.role))) {
    fail('The protected review vault is not a safe two-role Staging fixture.');
  }
  const fixture = vault.syntheticBooking;
  const readyWithoutBooking = fixture === undefined
    && [
      'fixture-verified-ready-for-login',
      'email-link-verified-ready-for-login',
    ].includes(vault.status);
  const reusableNonBinding = reusableNonBindingDiagnosticContext(vault);
  const safeActiveBooking = fixture !== undefined
    && ['accepted', 'active'].includes(fixture.workflowStatus)
    && fixture.paymentMode === 'memory'
    && fixture.stripeLivemode === false
    && fixture.paymentEndpointCalled === false;
  if (!readyWithoutBooking && !safeActiveBooking && !reusableNonBinding) {
    fail('The protected review vault must be login-ready or hold a reusable payment-free fixture.');
  }
  return { raw, vault, reusableNonBinding };
}

export async function runIsolatedAndroidRoleBookingDiagnostic({
  vaultFile,
  runner,
  retirementRunner = retireSyntheticBookingFixture,
  expectedStatus = 'passed-bounded-synthetic-role-booking-diagnostic',
}) {
  const protectedVaultFile = resolve(nonEmptyString(vaultFile, 'vaultFile'));
  const exactExpectedStatus = nonEmptyString(expectedStatus, 'expectedStatus');
  const {
    raw: originalRaw,
    vault,
    reusableNonBinding,
  } = readProtectedVault(protectedVaultFile);
  const originalSha256 = sha256(originalRaw);
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'sit-isolated-role-booking-'));
  chmodSync(temporaryDirectory, 0o700);
  const isolatedVaultFile = resolve(temporaryDirectory, 'accounts.json');
  const isolatedVault = structuredClone(vault);
  delete isolatedVault.syntheticBooking;
  delete isolatedVault.nonBindingSimulation;
  isolatedVault.status = 'fixture-verified-ready-for-login';
  if (reusableNonBinding) {
    isolatedVault.verificationMethod = 'isolated-staging-fixture';
  }
  nonEmptyString(vault.runId, 'runId');
  isolatedVault.runId = `role-booking-${randomBytes(8).toString('hex')}`;
  writeFileSync(isolatedVaultFile, `${JSON.stringify(isolatedVault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(isolatedVaultFile, 0o600);

  let result = null;
  let primaryFailure = null;
  let retirementFailure = null;
  try {
    result = await runner(isolatedVaultFile);
  } catch (error) {
    primaryFailure = error;
  } finally {
    let shouldRetire = primaryFailure === null;
    if (!shouldRetire) {
      try {
        const current = JSON.parse(readFileSync(isolatedVaultFile, 'utf8'));
        shouldRetire = current.syntheticBooking !== undefined;
      } catch {
        shouldRetire = false;
      }
    }
    if (shouldRetire) {
      try {
        const retirement = await retirementRunner({ vaultFile: isolatedVaultFile });
        if (retirement?.status !== 'synthetic-booking-retired'
            || retirement?.bookingCompleted !== true
            || retirement?.listingPaused !== true
            || retirement?.paymentEndpointCalled !== false
            || retirement?.stripeLivemode !== false) {
          fail('The isolated role-booking fixture was not retired safely.');
        }
      } catch (error) {
        retirementFailure = new Error(sanitizedLocalFailure(error));
      }
    }
    if (sha256(readFileSync(protectedVaultFile)) !== originalSha256) {
      primaryFailure = new Error(
        'The protected review vault changed during the isolated role-booking diagnostic.',
      );
    }
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  if (primaryFailure !== null) {
    if (retirementFailure !== null) {
      fail(`${sanitizedLocalFailure(primaryFailure)} Cleanup also failed safely: ${retirementFailure.message}`);
    }
    throw primaryFailure;
  }
  if (retirementFailure !== null) throw retirementFailure;
  if (result?.status !== exactExpectedStatus) {
    fail('The isolated Android role-booking diagnostic did not pass safely.');
  }
  return {
    ...result,
    isolation: {
      protectedReviewFixtureUnchanged: true,
      temporaryVaultRemovedAfterProbe: true,
      temporaryBookingCompleted: true,
      temporaryListingPaused: true,
      containsReviewCredentials: false,
    },
  };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const args = process.argv.slice(2);
  const vaultFile = argumentValue(args, '--vault-file') ?? fail('--vault-file is required.');
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const candidateDirectory = argumentValue(args, '--candidate-dir');
  const diagnosticPath = fileURLToPath(new URL('./diagnose_android_synthetic_role_booking.mjs', import.meta.url));
  const result = await runIsolatedAndroidRoleBookingDiagnostic({
    vaultFile,
    runner: async (isolatedVaultFile) => {
      const childArgs = [
        diagnosticPath,
        '--vault-file', isolatedVaultFile,
        '--adb', adbPath,
      ];
      if (candidateDirectory !== null) childArgs.push('--candidate-dir', candidateDirectory);
      let output;
      try {
        output = execFileSync(process.execPath, childArgs, {
          encoding: 'utf8',
          maxBuffer: 512 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        const detail = sanitizedChildFailure(error);
        fail(detail === null
          ? 'The isolated Android role-booking child diagnostic failed without exposing private state.'
          : `The isolated Android role-booking child diagnostic failed safely: ${detail}`);
      }
      return JSON.parse(output);
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (typeof process !== 'undefined' && process.argv?.[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
