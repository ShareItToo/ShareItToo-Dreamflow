#!/usr/bin/env node

import { chmodSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseEligibleVault } from './diagnose_store_review_accounts.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(message);
}

function privateExternalFile(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail(`${label} must be an absolute path.`);
  const canonical = realpathSync(value);
  const rel = relative(repositoryRoot, canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail(`${label} must remain outside the repository.`);
  }
  const stat = lstatSync(canonical);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be a private, regular file.`);
  }
  return canonical;
}

function disposableAccount(value, role) {
  const path = privateExternalFile(value, 'The disposable synthetic vault');
  let vault;
  try {
    vault = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('The disposable synthetic vault is invalid.');
  }
  const fixture = vault?.syntheticBooking;
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || !['fixture-verified-ready-for-login', 'email-link-verified-ready-for-login', 'synthetic-booking-completed'].includes(vault?.status)
      || (fixture && (fixture.workflowStatus !== 'completed'
        || fixture.paymentMode !== 'memory'
        || fixture.stripeLivemode !== false
        || fixture.paymentEndpointCalled !== false))
      || !Array.isArray(vault?.accounts)
      || vault.accounts.length !== 2) {
    fail('The deletion target is not an isolated disposable Staging account set.');
  }
  const account = vault.accounts.find((entry) => entry?.role === role);
  if (!account
      || account.registrationStatus !== 'accepted'
      || !['fixture-verified', 'email-link-verified'].includes(account.verificationStatus)
      || typeof account.email !== 'string'
      || typeof account.password !== 'string'
      || account.email.length < 3
      || account.password.length < 12) {
    fail('The disposable synthetic role is not eligible for a deletion diagnostic.');
  }
  return { path, vault, account };
}

async function request(fetchImpl, path, {
  method = 'GET', token = null, body = undefined, expected = [200],
} = {}) {
  let response;
  try {
    response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail(`Staging ${method} request transport failed.`);
  }
  const raw = await response.text();
  let value = null;
  if (raw) {
    try { value = JSON.parse(raw); } catch { fail(`Staging ${method} request did not return JSON.`); }
  }
  if (!expected.includes(response.status)) {
    fail(`Staging ${method} request failed with HTTP ${response.status}.`);
  }
  return { status: response.status, value };
}

async function login(fetchImpl, account, expected = [200]) {
  return request(fetchImpl, '/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password }, expected,
  });
}

export async function diagnoseStoreReviewDisposableDeletion({
  vaultFile,
  protectedVaultFile,
  role = 'renter',
  confirmSyntheticDeletion = false,
  fetchImpl = globalThis.fetch,
  capturedAt = new Date(),
} = {}) {
  if (confirmSyntheticDeletion !== true) {
    fail('Explicit confirmation is required for a disposable synthetic account deletion.');
  }
  if (!['owner', 'renter'].includes(role)) fail('The disposable deletion role is invalid.');
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  if (!(capturedAt instanceof Date) || !Number.isFinite(capturedAt.getTime())) {
    fail('The evidence timestamp is invalid.');
  }
  const protectedPath = privateExternalFile(protectedVaultFile, 'The protected reviewer vault');
  parseEligibleVault(protectedPath);
  const target = disposableAccount(vaultFile, role);
  if (target.path === protectedPath) fail('The active reviewer vault can never be a deletion target.');

  const session = await login(fetchImpl, target.account);
  const token = session.value?.accessToken;
  if (typeof token !== 'string' || token.length < 20) {
    fail('The disposable deletion login did not return a usable session.');
  }
  const preflight = await request(fetchImpl, '/account/deletion-preflight', { token });
  if (preflight.value?.canDelete !== true
      || !Array.isArray(preflight.value?.blockers)
      || preflight.value.blockers.length !== 0) {
    const blockers = Array.isArray(preflight.value?.blockers)
      ? preflight.value.blockers.map((entry) => String(entry?.id ?? 'unknown')).filter((value) => /^[a-z_]+$/.test(value))
      : [];
    fail(`The disposable account deletion preflight is blocked${blockers.length ? `: ${blockers.join(', ')}` : ''}.`);
  }
  const wrongPassword = [target.account.password, 'intentional', 'mismatch'].join('-');
  const rejected = await request(fetchImpl, '/account/deletion', {
    method: 'POST', token, body: { currentPassword: wrongPassword }, expected: [401],
  });
  if (rejected.value?.error !== 'invalid_credentials') {
    fail('Account deletion did not require the current password.');
  }
  const deletion = await request(fetchImpl, '/account/deletion', {
    method: 'POST', token, body: { currentPassword: target.account.password },
  });
  if (deletion.value?.deleted !== true) fail('The disposable synthetic account deletion was not accepted.');
  const relogin = await login(fetchImpl, target.account, [401]);
  if (relogin.value?.error !== 'invalid_credentials') {
    fail('The deleted synthetic credentials were not rejected.');
  }

  const account = target.vault.accounts.find((entry) => entry?.role === role);
  delete account.email;
  delete account.password;
  account.registrationStatus = 'deleted';
  account.verificationStatus = 'deleted';
  account.deletionStatus = 'confirmed-erased';
  account.deletedAt = capturedAt.toISOString();
  target.vault.status = 'synthetic-disposable-account-deleted';
  target.vault.deletedRole = role;
  target.vault.deletedAt = capturedAt.toISOString();
  writeFileSync(target.path, `${JSON.stringify(target.vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(target.path, 0o600);

  return Object.freeze({
    schemaVersion: 1,
    kind: 'store-review-disposable-deletion-diagnostic',
    status: 'passed-disposable-account-deletion',
    capturedAt: capturedAt.toISOString(),
    scenario: 'accountDeletion',
    checks: {
      deletionPreflightClear: true,
      currentPasswordRequired: true,
      accountDeletionAccepted: true,
      deletedCredentialsRejected: true,
      privateVaultCredentialsScrubbed: true,
    },
    environment: {
      apiBaseUrl: stagingApiBaseUrl,
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
    boundaries: {
      disposableSyntheticAccountDeleted: true,
      reviewerAccountsDeleted: false,
      syntheticAccountsOnly: true,
      containsSecrets: false,
      containsEmailAddresses: false,
      containsTokens: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
      publicStoreChanged: false,
      productionChanged: false,
    },
  });
}

function cliOptions(argv) {
  const options = { role: 'renter', confirmSyntheticDeletion: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--vault-file' && argv[index + 1]) options.vaultFile = resolve(argv[++index]);
    else if (argv[index] === '--protected-vault-file' && argv[index + 1]) options.protectedVaultFile = resolve(argv[++index]);
    else if (argv[index] === '--role' && argv[index + 1]) options.role = argv[++index];
    else if (argv[index] === '--confirm-synthetic-deletion') options.confirmSyntheticDeletion = true;
    else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  diagnoseStoreReviewDisposableDeletion(cliOptions(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
