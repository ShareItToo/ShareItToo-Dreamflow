#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));

function fail(message) {
  throw new Error(message);
}

function defaultCommandRunner(file, args) {
  return execFileSync(file, args, {
    encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function privateSyntheticAccount(vaultFile, role) {
  if (typeof vaultFile !== 'string' || !isAbsolute(vaultFile)) fail('--vault-file must be absolute.');
  const canonical = realpathSync(vaultFile);
  const rel = relative(repositoryRoot, canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail('The synthetic account vault must be a private regular file outside the repository.');
  }
  let vault;
  let descriptor;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
      fail('The synthetic account vault must be a private regular file outside the repository.');
    }
    vault = JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch {
    fail('The synthetic account vault is invalid.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (vault?.schemaVersion !== 1 || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || vault?.stripeLivemode !== false || !['owner', 'renter'].includes(role)) {
    fail('The vault is not an isolated Staging account set.');
  }
  const account = vault.accounts?.find((entry) => entry?.role === role);
  if (!account || account.registrationStatus !== 'accepted'
      || !['fixture-verified', 'email-link-verified'].includes(account.verificationStatus)
      || typeof account.email !== 'string' || typeof account.password !== 'string') {
    fail('The requested verified synthetic role is unavailable.');
  }
  return account;
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export async function rebindSyntheticSession({
  commandRunner,
  adbPath,
  device,
  wait,
  account,
  ensureGuest = ensureAndroidGuestSession,
  restore = restoreSyntheticSession,
}) {
  const guestReady = await ensureGuest({ commandRunner, adbPath, device, wait });
  if (!guestReady) return false;
  return restore({ commandRunner, adbPath, device, wait, account });
}

async function run() {
  const args = process.argv.slice(2);
  const vaultFile = resolve(argumentValue(args, '--vault-file') ?? fail('--vault-file is required.'));
  const role = argumentValue(args, '--role') ?? 'owner';
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const account = privateSyntheticAccount(vaultFile, role);
  const devices = parseAdbDevices(defaultCommandRunner(adbPath, ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath, device });
  const restored = await rebindSyntheticSession({
    commandRunner: defaultCommandRunner,
    adbPath,
    device,
    wait: (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
    account,
  });
  if (!restored) fail('The verified synthetic Staging session could not be restored.');
  process.stdout.write(`${JSON.stringify({
    status: 'synthetic-session-restored', role, device: deviceSummary,
    boundaries: {
      stagingOnly: true, syntheticAccountOnly: true, credentialsPrinted: false,
      productionChanged: false, paymentEndpointCalled: false, stripeLivemode: false,
      lockCodeUsed: false, rawDeviceIdentifierPrinted: false,
    },
  }, null, 2)}\n`);
}

if (typeof process !== 'undefined' && process.argv?.[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
