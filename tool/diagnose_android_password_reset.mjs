#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ensureAndroidGuestSession,
  restoreSyntheticSession,
} from './diagnose_android_logout_lifecycle.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import { validatePrivateAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const applicationId = 'com.shareittoo.app';
const apiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const remoteUiDump = '/sdcard/sit-password-reset.xml';

function fail(message) {
  throw new Error(message);
}

function outsideRepository(path, label) {
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail(`${label} must remain outside the repository.`);
  }
  return absolute;
}

function privateDirectory(path) {
  const absolute = outsideRepository(path, 'The private password-reset directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  return absolute;
}

function writePrivateJson(path, value) {
  privateDirectory(resolve(path, '..'));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(path, 0o600);
}

function privateInputFile(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be absolute.`);
  let canonical;
  let stat;
  try {
    canonical = realpathSync(path);
    stat = statSync(canonical);
  } catch {
    fail(`${label} is missing.`);
  }
  outsideRepository(canonical, label);
  if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be a non-empty owner-only regular file.`);
  }
  return canonical;
}

function readPrivateJson(path, label) {
  const canonical = privateInputFile(path, label);
  let descriptor;
  let value;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail(`${label} is not owner-only.`);
    value = JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch {
    fail(`${label} is invalid.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return { canonical, value };
}

function validateAccountVault(value) {
  if (value?.schemaVersion !== 1
      || value?.kind !== 'sit-staging-ui-registration-vault'
      || value?.apiBaseUrl !== apiBaseUrl
      || value?.stripeLivemode !== false
      || value?.containsProductionCredentials !== false
      || value?.status !== 'pixel-ui-registration-login-complete'
      || value?.account?.role !== 'owner'
      || !/^[A-Za-z0-9]+$/u.test(value?.account?.displayName ?? '')
      || !/^[A-Za-z0-9._+@-]+$/u.test(value?.account?.email ?? '')
      || !/^[A-Za-z0-9_-]{24,}$/u.test(value?.account?.password ?? '')) {
    fail('The source account vault is not an eligible N20 Staging fixture.');
  }
  return value;
}

function readAccountVault(path) {
  const { canonical, value } = readPrivateJson(path, 'The source account vault');
  return { canonical, vault: validateAccountVault(value) };
}

function safeRunId(now, random) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('The password-reset timestamp is invalid.');
  if (typeof random !== 'function') fail('The password-reset random source is invalid.');
  const date = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  return `${date}-${random(4).toString('hex')}`;
}

function pendingPassword(random) {
  return `S1tR${random(20).toString('base64url')}`;
}

export function preparePasswordResetVault({
  accountVaultFile,
  vaultRoot = resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'password-reset-accounts',
  ),
  now = new Date(),
  random = randomBytes,
} = {}) {
  const account = readAccountVault(accountVaultFile);
  const runId = safeRunId(now, random);
  const directory = privateDirectory(resolve(vaultRoot, runId));
  const vaultFile = resolve(directory, 'reset.json');
  const vault = {
    schemaVersion: 1,
    kind: 'sit-staging-pixel-password-reset-vault',
    runId,
    status: 'prepared-for-pixel-password-reset',
    createdAt: now.toISOString(),
    apiBaseUrl,
    stripeLivemode: false,
    containsProductionCredentials: false,
    accountVaultFile: account.canonical,
    pendingPassword: pendingPassword(random),
  };
  writePrivateJson(vaultFile, vault);
  return Object.freeze({
    status: vault.status,
    runId,
    vaultFile,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

function readResetVault(vaultFile) {
  const { canonical, value: vault } = readPrivateJson(vaultFile, 'The password-reset vault');
  const needsPendingPassword = [
    'prepared-for-pixel-password-reset',
    'pixel-password-reset-request-in-progress',
    'pixel-password-reset-request-outcome-unknown',
    'pixel-password-reset-request-accepted-pending-email',
  ].includes(vault?.status);
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-pixel-password-reset-vault'
      || vault?.apiBaseUrl !== apiBaseUrl
      || vault?.stripeLivemode !== false
      || vault?.containsProductionCredentials !== false
      || !/^[a-z0-9-]{8,48}$/u.test(vault?.runId ?? '')
      || typeof vault?.accountVaultFile !== 'string'
      || !isAbsolute(vault.accountVaultFile)
      || (needsPendingPassword && !/^S1tR[A-Za-z0-9_-]{24,}$/u.test(vault?.pendingPassword ?? ''))
      || (!needsPendingPassword && vault?.pendingPassword !== undefined)) {
    fail('The password-reset vault is not a bounded Staging fixture.');
  }
  const account = readAccountVault(vault.accountVaultFile);
  return { canonical, vault, account };
}

export function beginPasswordResetRequest({ vaultFile, occurredAt = new Date() }) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-reset request-start timestamp is invalid.');
  }
  const { canonical, vault } = readResetVault(vaultFile);
  if (vault.status !== 'prepared-for-pixel-password-reset') {
    fail('The password-reset request-start transition is out of order.');
  }
  vault.status = 'pixel-password-reset-request-in-progress';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'pixel-ui-password-reset-request-started',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function markPasswordResetRequestOutcomeUnknown({
  vaultFile,
  occurredAt = new Date(),
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-reset unknown-result timestamp is invalid.');
  }
  const { canonical, vault } = readResetVault(vaultFile);
  if (vault.status !== 'pixel-password-reset-request-in-progress') {
    fail('The password-reset unknown-result transition is out of order.');
  }
  vault.status = 'pixel-password-reset-request-outcome-unknown';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'pixel-ui-password-reset-request-outcome-unknown',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    freshRequestAllowed: false,
    reconciliationRequired: true,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function transitionPasswordResetRequest({ vaultFile, occurredAt = new Date() }) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-reset event timestamp is invalid.');
  }
  const { canonical, vault } = readResetVault(vaultFile);
  if (vault.status !== 'pixel-password-reset-request-in-progress') {
    fail('The password-reset request transition is out of order.');
  }
  vault.status = 'pixel-password-reset-request-accepted-pending-email';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'pixel-ui-password-reset-requested',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function reconcilePasswordResetEmailDelivery({
  vaultFile,
  occurredAt = new Date(),
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-reset delivery timestamp is invalid.');
  }
  const { canonical, vault } = readResetVault(vaultFile);
  if (vault.status !== 'pixel-password-reset-request-outcome-unknown') {
    fail('The password-reset delivery reconciliation is out of order.');
  }
  vault.status = 'pixel-password-reset-request-accepted-pending-email';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'password-reset-email-delivery-reconciled',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    deliveryReconciled: true,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

async function defaultAuthenticate(email, password) {
  // This owner-only local recovery diagnostic intentionally verifies the old
  // credential only against the fixed non-production ShareItToo endpoint.
  // SIT-INTENTIONAL-EGRESS: reviewed and regression-bound.
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status !== 401) return { status: response.status, error: null };
  let error = null;
  try {
    error = (await response.json())?.error ?? null;
  } catch {
    // An unstructured intermediary response is never safe proof that the old
    // credential was rejected by the application Backend.
  }
  return { status: response.status, error };
}

export async function verifyOldPasswordRejectedAndFinalize({
  vaultFile,
  authenticate = defaultAuthenticate,
  occurredAt = new Date(),
} = {}) {
  if (typeof authenticate !== 'function'
      || !(occurredAt instanceof Date)
      || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-reset finalization dependencies are invalid.');
  }
  const { canonical, vault, account } = readResetVault(vaultFile);
  if (vault.status !== 'pixel-password-reset-request-accepted-pending-email') {
    fail('The password-reset confirmation transition is out of order.');
  }
  let result;
  try {
    result = await authenticate(account.vault.account.email, account.vault.account.password);
  } catch {
    fail('Old-password verification transport failed without changing either private vault.');
  }
  if (result?.status !== 401 || result?.error !== 'invalid_credentials') {
    fail('The old password was not rejected by the exact structured Staging contract.');
  }

  account.vault.account.password = vault.pendingPassword;
  account.vault.passwordResetAppliedAt = occurredAt.toISOString();
  account.vault.events = [...(Array.isArray(account.vault.events) ? account.vault.events : []), {
    event: 'password-reset-server-confirmed-old-password-rejected',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(account.canonical, account.vault);

  vault.status = 'password-reset-confirmed-ready-for-pixel-login';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'reset-link-confirmed-and-old-password-rejected',
    occurredAt: occurredAt.toISOString(),
  }];
  delete vault.pendingPassword;
  vault.credentialStoredOnlyInSourceVault = true;
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    oldPasswordRejected: true,
    credentialStoredOnlyInSourceVault: true,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

export function transitionPasswordResetLogin({ vaultFile, occurredAt = new Date() }) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-reset login timestamp is invalid.');
  }
  const { canonical, vault } = readResetVault(vaultFile);
  if (vault.status !== 'password-reset-confirmed-ready-for-pixel-login') {
    fail('The password-reset login transition is out of order.');
  }
  vault.status = 'pixel-password-reset-login-complete';
  vault.events = [...(Array.isArray(vault.events) ? vault.events : []), {
    event: 'new-password-pixel-login-cold-start-passed',
    occurredAt: occurredAt.toISOString(),
  }];
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: vault.status,
    containsEmailAddress: false,
    containsCredential: false,
  });
}

function defaultCommandRunner(file, args, { binary = false } = {}) {
  return execFileSync(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function adb(commandRunner, adbPath, device, args, { binary = false } = {}) {
  try {
    const result = commandRunner(adbPath, ['-s', device.serial, ...args], { binary });
    return binary ? Buffer.from(result) : String(result).trim();
  } catch {
    fail('ADB password-reset command failed without exposing the device identifier.');
  }
}

function decodeXml(value) {
  return String(value)
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexadecimal) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)))
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attribute(tag, name) {
  const raw = new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  return raw === undefined ? null : decodeXml(raw);
}

function namedNodes(hierarchy, label) {
  const matchesLabel = (value) => value?.split('\n').some((line) => line === label
    || line.startsWith(`${label},`)
    || line.startsWith(`${label} `)) === true;
  return [...hierarchy.matchAll(/<node\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter((tag) => matchesLabel(attribute(tag, 'text'))
      || matchesLabel(attribute(tag, 'content-desc'))
      || matchesLabel(attribute(tag, 'hint')));
}

function nodeCenter(tag, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attribute(tag, 'bounds') ?? '');
  if (!bounds) fail(`The sanitized ${label} action has invalid bounds.`);
  const values = bounds.slice(1).map(Number);
  return {
    x: Math.round((values[0] + values[2]) / 2),
    y: Math.round((values[1] + values[3]) / 2),
  };
}

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, { chooseLast = false } = {}) {
  const enabled = namedNodes(hierarchy, label).filter((tag) => attribute(tag, 'enabled') !== 'false');
  const clickable = enabled.filter((tag) => attribute(tag, 'clickable') === 'true');
  const matches = clickable.length ? clickable : enabled;
  if (matches.length === 0) fail(`The sanitized ${label} action is missing.`);
  const center = nodeCenter(chooseLast ? matches.at(-1) : matches[0], label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'tap', String(center.x), String(center.y)]);
}

function inputText(commandRunner, adbPath, device, hierarchy, label, value) {
  if (!/^[A-Za-z0-9._+@-]+$/u.test(value)) fail(`The private ${label} fixture is not safe for bounded ADB input.`);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, label);
  adb(commandRunner, adbPath, device, ['shell', 'input', 'text', value]);
}

function dumpUi(commandRunner, adbPath, device) {
  adb(commandRunner, adbPath, device, ['shell', 'uiautomator', 'dump', remoteUiDump]);
  return adb(commandRunner, adbPath, device, ['exec-out', 'cat', remoteUiDump]);
}

async function waitForHierarchy({ commandRunner, adbPath, device, predicate, wait, attempts = 24 }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(650);
    const hierarchy = dumpUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail('The expected sanitized password-reset surface did not appear.');
}

function parseInstalledPackage(output) {
  const versionName = /^\s*versionName=([^\s]+)\s*$/m.exec(output)?.[1] ?? null;
  const buildNumber = /^\s*versionCode=(\d+)\b/m.exec(output)?.[1] ?? null;
  if (versionName === null || buildNumber === null) fail('Installed ShareItToo version could not be verified.');
  return { versionName, buildNumber };
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function verifyInstalledCandidate(commandRunner, adbPath, device, candidate) {
  const packagePaths = adb(commandRunner, adbPath, device, ['shell', 'pm', 'path', applicationId])
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, '').trim())
    .filter(Boolean);
  if (packagePaths.length !== 1 || !packagePaths[0].startsWith('/data/app/')) {
    fail('The password-reset diagnostic requires one exact direct-APK Pixel candidate.');
  }
  const installed = parseInstalledPackage(
    adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'package', applicationId]),
  );
  if (installed.versionName !== candidate.versionName || installed.buildNumber !== candidate.buildNumber) {
    fail('Installed ShareItToo version does not match the verified candidate.');
  }
  const installedSha256 = sha256Bytes(adb(
    commandRunner,
    adbPath,
    device,
    ['exec-out', 'cat', packagePaths[0]],
    { binary: true },
  ));
  if (installedSha256 !== candidate.apkSha256) fail('Installed ShareItToo APK does not match the verified candidate.');
  return { ...installed, apkSha256: installedSha256 };
}

function assertDeviceAlreadyUnlocked(commandRunner, adbPath, device) {
  const policy = adb(commandRunner, adbPath, device, ['shell', 'dumpsys', 'window', 'policy']);
  if (/keyguardShowing=true|isStatusBarKeyguard=true/u.test(policy)) {
    fail('The Android phone is locked. Unlock it manually; this diagnostic never enters a passcode.');
  }
}

export async function requestPixelPasswordReset({
  vaultFile,
  candidate,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  ensureGuest = ensureAndroidGuestSession,
} = {}) {
  const { vault, account } = readResetVault(vaultFile);
  if (vault.status !== 'prepared-for-pixel-password-reset') fail('The password-reset vault is not prepared.');
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate);
  if (await ensureGuest({ commandRunner, adbPath, device, wait }) !== true) {
    fail('The Pixel guest session could not be established.');
  }
  let hierarchy = dumpUi(commandRunner, adbPath, device);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Anmelden');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (value) => namedNodes(value, 'E-Mail').length >= 1
      && namedNodes(value, 'Passwort vergessen?').length >= 1,
    wait,
  });
  inputText(commandRunner, adbPath, device, hierarchy, 'E-Mail', account.vault.account.email);
  hierarchy = dumpUi(commandRunner, adbPath, device);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Passwort vergessen?');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (value) => namedNodes(value, 'Passwort zurücksetzen').length >= 1
      && namedNodes(value, 'Link senden').length >= 1,
    wait,
  });
  if (!hierarchy.includes(account.vault.account.email)) {
    inputText(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      'E-Mail für Passwortzurücksetzung',
      account.vault.account.email,
    );
    hierarchy = dumpUi(commandRunner, adbPath, device);
  }
  beginPasswordResetRequest({ vaultFile });
  try {
    tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Link senden');
    await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      predicate: (value) => value.includes('E-Mail gesendet')
        && value.includes('Wenn ein Konto existiert'),
      wait,
      attempts: 32,
    });
  } catch (error) {
    markPasswordResetRequestOutcomeUnknown({ vaultFile });
    throw error;
  }
  transitionPasswordResetRequest({ vaultFile });
  return Object.freeze({
    status: 'pixel-password-reset-request-accepted-pending-email',
    installedVersionName: installed.versionName,
    installedVersionCode: installed.buildNumber,
    accountExistenceDisclosure: false,
    containsEmailAddress: false,
    containsCredential: false,
    containsRawDeviceIdentifier: false,
  });
}

async function openProfile({ commandRunner, adbPath, device, wait }) {
  adb(commandRunner, adbPath, device, ['shell', 'am', 'force-stop', applicationId]);
  const launch = adb(commandRunner, adbPath, device, [
    'shell', 'monkey', '-p', applicationId, '-c', 'android.intent.category.LAUNCHER', '1',
  ]);
  if (!/Events injected:\s*1/u.test(launch)) fail('Android did not confirm the ShareItToo launch event.');
  const main = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => namedNodes(hierarchy, 'Mein SIT').length >= 1
      && namedNodes(hierarchy, 'Nachrichten').length >= 1,
    wait,
  });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT');
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    predicate: (hierarchy) => namedNodes(hierarchy, 'Abmelden').length >= 1,
    wait,
  });
}

export async function completePixelPasswordResetLogin({
  vaultFile,
  candidate,
  commandRunner = defaultCommandRunner,
  adbPath = 'adb',
  device,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  ensureGuest = ensureAndroidGuestSession,
  restoreSession = restoreSyntheticSession,
} = {}) {
  const { vault, account } = readResetVault(vaultFile);
  if (vault.status !== 'password-reset-confirmed-ready-for-pixel-login') {
    fail('The password-reset server result is not confirmed.');
  }
  assertDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalledCandidate(commandRunner, adbPath, device, candidate);
  if (await ensureGuest({ commandRunner, adbPath, device, wait }) !== true
      || await restoreSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account: account.vault.account,
      }) !== true) {
    fail('The reset password could not log in on the Pixel.');
  }
  let hierarchy = dumpUi(commandRunner, adbPath, device);
  if (namedNodes(hierarchy, account.vault.account.displayName).length !== 1
      || namedNodes(hierarchy, 'Gast').length !== 0) {
    fail('The Pixel profile did not bind to the exact recovered principal.');
  }
  hierarchy = await openProfile({ commandRunner, adbPath, device, wait });
  if (namedNodes(hierarchy, account.vault.account.displayName).length !== 1
      || namedNodes(hierarchy, 'Gast').length !== 0) {
    fail('The recovered principal did not survive a cold start.');
  }
  transitionPasswordResetLogin({ vaultFile });
  return Object.freeze({
    status: 'pixel-password-reset-login-complete',
    installedVersionName: installed.versionName,
    installedVersionCode: installed.buildNumber,
    exactPrincipalVisible: true,
    coldStartSessionPersisted: true,
    containsEmailAddress: false,
    containsCredential: false,
    containsRawDeviceIdentifier: false,
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? fail('--phase is required.');
  if (phase === 'prepare') {
    const accountVaultFile = resolve(
      argumentValue(args, '--account-vault-file') ?? fail('--account-vault-file is required.'),
    );
    const vaultRoot = argumentValue(args, '--vault-root');
    const result = preparePasswordResetVault({
      accountVaultFile,
      ...(vaultRoot ? { vaultRoot: resolve(vaultRoot) } : {}),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const vaultFile = resolve(argumentValue(args, '--vault-file') ?? fail('--vault-file is required.'));
  if (phase === 'record-server-confirmation') {
    const result = await verifyOldPasswordRejectedAndFinalize({ vaultFile });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (phase === 'record-delivered-email') {
    const result = reconcilePasswordResetEmailDelivery({ vaultFile });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (!['request', 'complete'].includes(phase)) fail('The requested password-reset phase is invalid.');
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('--candidate-dir is required.'),
  );
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const devices = parseAdbDevices(defaultCommandRunner('adb', ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: 'adb', device });
  const result = phase === 'request'
    ? await requestPixelPasswordReset({ vaultFile, candidate, device })
    : await completePixelPasswordResetLogin({ vaultFile, candidate, device });
  process.stdout.write(`${JSON.stringify({
    ...result,
    device: deviceSummary,
    boundaries: {
      stagingOnly: true,
      syntheticAccountOnly: true,
      realMoneyUsed: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
      credentialsPrinted: false,
      resetLinkPrinted: false,
      rawDeviceIdentifierPrinted: false,
    },
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'Pixel password-reset diagnostic failed.'}\n`);
    process.exitCode = 1;
  }
}
