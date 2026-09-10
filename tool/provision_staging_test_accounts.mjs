#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const roles = Object.freeze([
  Object.freeze({ role: 'owner', displayName: 'SIT Test Vermieter' }),
  Object.freeze({ role: 'renter', displayName: 'SIT Test Mieter' }),
]);

function fail(message) {
  throw new Error(message);
}

function normalizedMailbox(value) {
  if (typeof value !== 'string') fail('A Gmail mailbox is required.');
  const mailbox = value.trim().toLowerCase();
  const match = /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9.-]+\.[a-z]{2,})$/.exec(mailbox);
  if (!match || mailbox.length > 254) fail('The Gmail mailbox has an invalid format.');
  const localRoot = match[1].split('+', 1)[0];
  if (!localRoot) fail('The Gmail mailbox local part is invalid.');
  return { mailbox, localRoot, domain: match[2] };
}

export function buildSyntheticAlias(baseEmail, runId, role) {
  const mailbox = normalizedMailbox(baseEmail);
  if (!/^[a-z0-9-]{8,48}$/.test(runId)) fail('The staging test run ID is invalid.');
  if (!roles.some((entry) => entry.role === role)) fail('The staging test role is invalid.');
  return `${mailbox.localRoot}+sit-${runId}-${role}@${mailbox.domain}`;
}

function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}

function privateJson(path, value) {
  privateDirectory(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function outsideRepository(path, label) {
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail(`${label} must remain outside the repository.`);
  }
  return absolute;
}

function privateInputFile(path, label) {
  const absolute = outsideRepository(path, label);
  let link;
  try {
    link = lstatSync(absolute);
  } catch {
    fail(`${label} is missing.`);
  }
  if (!link.isFile() || link.isSymbolicLink() || link.size === 0 || (link.mode & 0o077) !== 0) {
    fail(`${label} must be a non-empty owner-only file.`);
  }
  return absolute;
}

function readPrivateText(path, label) {
  const absolute = privateInputFile(path, label);
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
      fail(`${label} must be a non-empty owner-only file.`);
    }
    return readFileSync(descriptor, 'utf8');
  } catch (error) {
    if (typeof error?.message === 'string' && error.message.startsWith(label)) throw error;
    fail(`${label} is invalid.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readPrivateJson(path, label) {
  try {
    return { path: privateInputFile(path, label), value: JSON.parse(readPrivateText(path, label)) };
  } catch (error) {
    if (typeof error?.message === 'string' && error.message.startsWith(label)) throw error;
    fail(`${label} is invalid.`);
  }
}

function safeRunId(now, random) {
  const date = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  const suffix = random(4).toString('hex');
  return `${date}-${suffix}`;
}

export function stagingRegistrationPayload(account) {
  return Object.freeze({
    email: account.email,
    password: account.password,
    displayName: account.displayName,
    termsAccepted: true,
    privacyAccepted: true,
    minimumAgeConfirmed: true,
    privateUseConfirmed: true,
  });
}

async function defaultRegister(account) {
  const response = await fetch(`${stagingApiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(stagingRegistrationPayload(account)),
    signal: AbortSignal.timeout(15_000),
  });
  return { accepted: response.status === 202, status: response.status };
}

async function defaultVerifyEmailLinkedAccount(account, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') fail('The Staging verification transport is invalid.');
  let refreshToken = null;
  try {
    const login = await fetchImpl(`${stagingApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ email: account.email, password: account.password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (login.status !== 200) return { verified: false, status: login.status };
    const session = await login.json();
    if (typeof session?.accessToken !== 'string' || session.accessToken.length < 20
        || typeof session?.refreshToken !== 'string' || session.refreshToken.length < 20) {
      return { verified: false, status: login.status };
    }
    refreshToken = session.refreshToken;
    const me = await fetchImpl(`${stagingApiBaseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Cache-Control': 'no-store',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (me.status !== 200) return { verified: false, status: me.status };
    const identity = await me.json();
    return {
      verified: String(identity?.user?.email ?? '').toLowerCase() === account.email.toLowerCase(),
      status: me.status,
    };
  } finally {
    if (refreshToken !== null) {
      const logout = await fetchImpl(`${stagingApiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(15_000),
      });
      if (logout.status !== 204) fail('Staging verification-session cleanup failed.');
    }
  }
}

export async function provisionSyntheticAccounts({
  baseEmail,
  vaultRoot = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'staging-accounts',
  ),
  now = new Date(),
  random = randomBytes,
  register = defaultRegister,
} = {}) {
  normalizedMailbox(baseEmail);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('The staging test timestamp is invalid.');
  if (typeof random !== 'function' || typeof register !== 'function') fail('The staging test dependencies are invalid.');

  const safeVaultRoot = outsideRepository(vaultRoot, 'The staging account vault');
  privateDirectory(safeVaultRoot);
  const runId = safeRunId(now, random);
  const vaultPath = resolve(safeVaultRoot, runId, 'accounts.json');
  const accounts = roles.map(({ role, displayName }) => ({
    role,
    displayName,
    email: buildSyntheticAlias(baseEmail, runId, role),
    password: random(24).toString('base64url'),
    registrationStatus: 'pending',
    verificationStatus: 'pending',
  }));
  const vault = {
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    runId,
    status: 'registration-in-progress',
    createdAt: now.toISOString(),
    apiBaseUrl: stagingApiBaseUrl,
    stripeLivemode: false,
    containsProductionCredentials: false,
    accounts,
  };
  privateJson(vaultPath, vault);

  for (const account of accounts) {
    let result;
    try {
      result = await register(account);
    } catch {
      account.registrationStatus = 'transport-failed';
      vault.status = 'registration-partial';
      privateJson(vaultPath, vault);
      fail(`Staging registration transport failed for the ${account.role} role.`);
    }
    if (!result || result.accepted !== true || result.status !== 202) {
      account.registrationStatus = `rejected-http-${Number(result?.status) || 0}`;
      vault.status = 'registration-partial';
      privateJson(vaultPath, vault);
      fail(`Staging registration was not accepted for the ${account.role} role.`);
    }
    account.registrationStatus = 'accepted';
    account.registrationAcceptedAt = new Date().toISOString();
    privateJson(vaultPath, vault);
  }

  vault.status = 'registration-accepted-pending-verification';
  privateJson(vaultPath, vault);
  return Object.freeze({
    status: vault.status,
    runId,
    roles: accounts.map((account) => Object.freeze({
      role: account.role,
      registrationStatus: account.registrationStatus,
      verificationStatus: account.verificationStatus,
    })),
    vaultReady: true,
    containsSecrets: false,
    containsEmailAddresses: false,
  });
}

export function recordSyntheticAccountVerification({
  runId,
  vaultRoot = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'staging-accounts',
  ),
  verifiedAt = new Date(),
  method = 'isolated-staging-fixture',
} = {}) {
  if (!/^[a-z0-9-]{8,48}$/.test(runId ?? '')) fail('The staging test run ID is invalid.');
  if (!(verifiedAt instanceof Date) || !Number.isFinite(verifiedAt.getTime())) {
    fail('The staging verification timestamp is invalid.');
  }
  if (method !== 'isolated-staging-fixture' && method !== 'email-link') {
    fail('The staging verification method is invalid.');
  }
  const safeVaultRoot = outsideRepository(vaultRoot, 'The staging account vault');
  const { path: vaultPath, value: vault } = readPrivateJson(
    resolve(safeVaultRoot, runId, 'accounts.json'),
    'The staging account vault file',
  );
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.runId !== runId
      || !Array.isArray(vault?.accounts)
      || vault.accounts.length !== roles.length
      || !vault.accounts.every((account, index) => (
        account?.role === roles[index].role
        && account?.registrationStatus === 'accepted'
        && typeof account?.email === 'string'
        && typeof account?.password === 'string'
      ))) {
    fail('The staging account vault does not match the accepted synthetic account set.');
  }
  for (const account of vault.accounts) {
    account.verificationStatus = method === 'email-link' ? 'email-link-verified' : 'fixture-verified';
    account.verifiedAt = verifiedAt.toISOString();
  }
  vault.status = method === 'email-link'
    ? 'email-link-verified-ready-for-login'
    : 'fixture-verified-ready-for-login';
  vault.verificationMethod = method;
  privateJson(vaultPath, vault);
  return Object.freeze({
    status: vault.status,
    runId,
    roles: vault.accounts.map((account) => Object.freeze({
      role: account.role,
      registrationStatus: account.registrationStatus,
      verificationStatus: account.verificationStatus,
    })),
    vaultReady: true,
    containsSecrets: false,
    containsEmailAddresses: false,
  });
}

export async function verifyEmailLinkedSyntheticAccounts({
  runId,
  vaultRoot = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'staging-accounts',
  ),
  verifiedAt = new Date(),
  fetchImpl = globalThis.fetch,
  verify = null,
} = {}) {
  if (!/^[a-z0-9-]{8,48}$/.test(runId ?? '')) fail('The staging test run ID is invalid.');
  if (!(verifiedAt instanceof Date) || !Number.isFinite(verifiedAt.getTime())) {
    fail('The staging verification timestamp is invalid.');
  }
  if (typeof fetchImpl !== 'function') fail('The Staging verification transport is invalid.');
  if (verify !== null && typeof verify !== 'function') fail('The Staging verification function is invalid.');
  const verifier = verify ?? ((account) => defaultVerifyEmailLinkedAccount(account, { fetchImpl }));
  const safeVaultRoot = outsideRepository(vaultRoot, 'The staging account vault');
  const { path: vaultPath, value: vault } = readPrivateJson(
    resolve(safeVaultRoot, runId, 'accounts.json'),
    'The staging account vault file',
  );
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.runId !== runId
      || vault?.status !== 'registration-accepted-pending-verification'
      || !Array.isArray(vault?.accounts)
      || vault.accounts.length !== roles.length
      || !vault.accounts.every((account, index) => (
        account?.role === roles[index].role
          && account?.registrationStatus === 'accepted'
          && account?.verificationStatus === 'pending'
          && typeof account?.email === 'string'
          && typeof account?.password === 'string'
      ))) {
    fail('The staging account vault is not pending exact e-mail verification.');
  }
  for (const account of vault.accounts) {
    let result;
    try {
      result = await verifier(account);
    } catch {
      fail(`Staging e-mail verification could not be confirmed for the ${account.role} role.`);
    }
    if (result?.verified !== true || result.status !== 200) {
      fail(`Staging e-mail verification is not confirmed for the ${account.role} role.`);
    }
  }
  for (const account of vault.accounts) {
    account.verificationStatus = 'email-link-verified';
    account.verifiedAt = verifiedAt.toISOString();
  }
  vault.status = 'email-link-verified-ready-for-login';
  vault.verificationMethod = 'email-link';
  privateJson(vaultPath, vault);
  return Object.freeze({
    status: vault.status,
    runId,
    roles: vault.accounts.map((account) => Object.freeze({
      role: account.role,
      registrationStatus: account.registrationStatus,
      verificationStatus: account.verificationStatus,
    })),
    serverVerified: true,
    verificationSessionsCleaned: true,
    vaultReady: true,
    containsSecrets: false,
    containsEmailAddresses: false,
  });
}

function parseArguments(values) {
  let mailboxFile = null;
  let vaultRoot = null;
  let runId = null;
  let verifyEmailLinks = false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--mailbox-file') {
      mailboxFile = values[index + 1] ?? fail('--mailbox-file requires a path.');
      index += 1;
    } else if (values[index] === '--vault-root') {
      vaultRoot = values[index + 1] ?? fail('--vault-root requires a path.');
      index += 1;
    } else if (values[index] === '--run-id') {
      runId = values[index + 1] ?? fail('--run-id requires a value.');
      index += 1;
    } else if (values[index] === '--verify-email-links') {
      verifyEmailLinks = true;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (verifyEmailLinks) {
    if (mailboxFile !== null || !runId) {
      fail('--verify-email-links requires only --run-id and an optional --vault-root.');
    }
  } else if (!mailboxFile || runId !== null) {
    fail('--mailbox-file is required so the mailbox is not exposed in the process list.');
  }
  return { mailboxFile, vaultRoot, runId, verifyEmailLinks };
}

async function run() {
  const args = parseArguments(process.argv.slice(2));
  if (args.verifyEmailLinks) {
    const result = await verifyEmailLinkedSyntheticAccounts({
      runId: args.runId,
      ...(args.vaultRoot ? { vaultRoot: resolve(args.vaultRoot) } : {}),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const result = await provisionSyntheticAccounts({
    baseEmail: readPrivateText(args.mailboxFile, 'The mailbox input file'),
    ...(args.vaultRoot ? { vaultRoot: resolve(args.vaultRoot) } : {}),
  });
  console.log(JSON.stringify(result, null, 2));
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
