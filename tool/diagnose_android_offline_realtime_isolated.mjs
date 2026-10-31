#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  activateStagingEmailVerifiedJourneyFixture,
  prepareStagingEmailVerifiedTwoRoleJourney,
  retireStagingEmailVerifiedTwoRoleJourney,
} from './run_staging_email_verified_two_role_journey.mjs';
import { runStagingNonBindingSimulation } from './run_staging_non_binding_simulation.mjs';

function fail(message) {
  throw new Error(message);
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${flag} requires a value.`);
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sanitizedOfflineChildFailure(error) {
  const raw = String(error?.stderr ?? '').trim();
  const detail = /^ERROR: (.{1,300})$/mu.exec(raw)?.[1]?.trim() ?? '';
  if (!/^(?:The|Android|Installed|ADB) [A-Za-z0-9_ .,:;()'-]+$/u.test(detail)
      || /(?:@|https?:|\/|\\|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)/iu
        .test(detail)) {
    return null;
  }
  return detail;
}

async function run() {
  const args = process.argv.slice(2);
  const sourceVaultFile = resolve(
    argumentValue(args, '--source-vault-file')
      ?? fail('--source-vault-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir')
      ?? fail('--candidate-dir is required.'),
  );
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const sourceSha256 = sha256(readFileSync(sourceVaultFile));
  const diagnosticFile = fileURLToPath(
    new URL('./diagnose_android_offline_realtime.mjs', import.meta.url),
  );
  const sessionBindingFile = fileURLToPath(
    new URL('./restore_android_synthetic_session.mjs', import.meta.url),
  );

  let prepared = null;
  let evidence = null;
  let primaryFailure = null;
  let retired = null;
  try {
    prepared = await prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile });
    await activateStagingEmailVerifiedJourneyFixture({ vaultFile: prepared.vaultFile });
    await runStagingNonBindingSimulation({ vaultFile: prepared.vaultFile });
    execFileSync(process.execPath, [
      sessionBindingFile,
      '--vault-file', prepared.vaultFile,
      '--role', 'owner',
      '--adb', adbPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = execFileSync(process.execPath, [
      diagnosticFile,
      '--vault-file', prepared.vaultFile,
      '--candidate-dir', candidateDirectory,
      '--adb', adbPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    evidence = JSON.parse(output);
  } catch (error) {
    const detail = sanitizedOfflineChildFailure(error);
    primaryFailure = new Error(
      detail === null
        ? 'The isolated non-binding offline/realtime diagnostic failed safely.'
        : `The isolated non-binding offline/realtime diagnostic failed safely: ${detail}`,
    );
  } finally {
    if (prepared !== null) {
      try {
        retired = await retireStagingEmailVerifiedTwoRoleJourney({
          vaultFile: prepared.vaultFile,
        });
      } catch {
        if (primaryFailure === null) {
          primaryFailure = new Error('The isolated offline/realtime fixture cleanup failed safely.');
        }
      }
    }
    if (sha256(readFileSync(sourceVaultFile)) !== sourceSha256) {
      primaryFailure = new Error('The protected review vault changed during the offline/realtime diagnostic.');
    }
  }
  if (primaryFailure !== null) throw primaryFailure;
  if (evidence?.status !== 'passed-bounded-offline-realtime-diagnostic'
      || retired?.bookingCancelled !== true
      || retired?.listingEnded !== true
      || retired?.publicCatalogEntryRemoved !== true) {
    fail('The isolated offline/realtime result or cleanup is incomplete.');
  }
  console.log(JSON.stringify({
    ...evidence,
    isolation: {
      mode: 'fresh-email-verified-non-binding-simulation',
      protectedReviewFixtureUnchanged: true,
      temporaryBookingCancelled: true,
      temporaryListingEnded: true,
      temporaryListingRemovedFromPublicCatalog: true,
      reservationCreated: false,
      contractCreated: false,
      paymentEndpointCalled: false,
      monetaryEffectMinor: 0,
      containsReviewCredentials: false,
      containsFixtureIdentifiers: false,
      containsPrivateFilesystemPaths: false,
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
