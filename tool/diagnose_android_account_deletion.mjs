#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
import { validatePrivateAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const applicationId = 'com.shareittoo.app';
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(message);
}

function outsideRepository(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be absolute.`);
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail(`${label} must remain outside the repository.`);
  }
  return absolute;
}

function readPrivateJson(path, label) {
  const absolute = outsideRepository(path, label);
  let canonical;
  let descriptor;
  try {
    canonical = realpathSync(absolute);
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
      fail(`${label} must be a non-empty owner-only regular file.`);
    }
    const raw = readFileSync(descriptor);
    return { canonical, raw, value: JSON.parse(raw.toString('utf8')) };
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} is not valid JSON.`);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function durablePrivateJson(path, value, { random = randomBytes } = {}) {
  const absolute = outsideRepository(path, 'The account-deletion recovery journal');
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  chmodSync(dirname(absolute), 0o700);
  const directoryStat = statSync(dirname(absolute));
  if (!directoryStat.isDirectory() || (directoryStat.mode & 0o077) !== 0) {
    fail('The account-deletion recovery directory is not owner-only.');
  }
  const temporary = resolve(dirname(absolute), `${basename(absolute)}.${random(8).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o600);
    renameSync(temporary, absolute);
    const directoryDescriptor = openSync(dirname(absolute), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Best-effort descriptor cleanup. */ }
    }
    try { unlinkSync(temporary); } catch { /* The rename may already have completed. */ }
    throw error;
  }
  return absolute;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function validateCandidate(candidate) {
  if (candidate?.applicationId !== applicationId
      || candidate?.apiBaseUrl !== stagingApiBaseUrl
      || candidate?.versionName !== '1.0.0'
      || !/^\d{10}$/u.test(String(candidate?.buildNumber ?? ''))
      || !/^[0-9a-f]{40}$/u.test(candidate?.commit ?? '')
      || !/^[0-9a-f]{64}$/u.test(candidate?.apkSha256 ?? '')
      || !/^[0-9a-f]{64}$/u.test(candidate?.signingCertificateSha256 ?? '')) {
    fail('The account-deletion candidate binding is invalid.');
  }
  return candidate;
}

function targetVault(path) {
  const source = readPrivateJson(path, 'The disposable account vault');
  const vault = source.value;
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-ui-registration-vault'
      || vault?.status !== 'pixel-ui-registration-login-complete'
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || vault?.account?.role !== 'owner'
      || !/^[A-Za-z0-9]+$/u.test(vault?.account?.displayName ?? '')
      || !/^[A-Za-z0-9._+@-]+$/u.test(vault?.account?.email ?? '')
      || !/^[A-Za-z0-9_-]{24,}$/u.test(vault?.account?.password ?? '')) {
    fail('The deletion target is not an exact disposable verified Staging account.');
  }
  return source;
}

function protectedOwnerVault(path) {
  const source = readPrivateJson(path, 'The protected account vault');
  const vault = source.value;
  const allowedStatuses = new Set([
    'fixture-verified-ready-for-login',
    'email-link-verified-ready-for-login',
    'email-linked-product-journey-retired',
  ]);
  const owner = vault?.accounts?.find((entry) => entry?.role === 'owner');
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || !allowedStatuses.has(vault?.status)
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || !Array.isArray(vault?.accounts)
      || vault.accounts.length !== 2
      || owner?.registrationStatus !== 'accepted'
      || !['fixture-verified', 'email-link-verified'].includes(owner?.verificationStatus)
      || typeof owner?.displayName !== 'string'
      || typeof owner?.email !== 'string'
      || typeof owner?.password !== 'string') {
    fail('The protected owner source is not an exact login-ready Staging fixture.');
  }
  return { ...source, owner };
}

function exactDistinctTarget(target, protectedSource) {
  const targetAddress = target.value.account.email.trim().toLowerCase();
  const protectedAddresses = protectedSource.value.accounts
    .map((entry) => String(entry?.email ?? '').trim().toLowerCase());
  if (target.canonical === protectedSource.canonical
      || protectedAddresses.includes(targetAddress)) {
    fail('The disposable deletion target collides with a protected account.');
  }
  return true;
}

function publicJournal(journal) {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-account-deletion-journal',
    status: journal.status,
    candidateCommit: journal.candidate.commit,
    candidateBuildNumber: journal.candidate.buildNumber,
    recoveryRequired: journal.recoveryRequired,
    targetCredentialState: journal.targetCredentialState,
    protectedOwnerRestored: journal.protectedOwnerRestored,
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
    containsAccountIdentifier: false,
    containsPrivateFilesystemPath: false,
  });
}

export function prepareAccountDeletionJournal({
  targetVaultFile,
  protectedVaultFile,
  journalFile,
  candidate,
  occurredAt = new Date(),
  random = randomBytes,
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The account-deletion journal timestamp is invalid.');
  }
  const exactCandidate = validateCandidate(candidate);
  const target = targetVault(targetVaultFile);
  const protectedSource = protectedOwnerVault(protectedVaultFile);
  exactDistinctTarget(target, protectedSource);
  const journal = {
    schemaVersion: 1,
    kind: 'sit-staging-current-candidate-account-deletion-journal',
    status: 'prepared-before-deletion',
    createdAt: occurredAt.toISOString(),
    apiBaseUrl: stagingApiBaseUrl,
    stripeLivemode: false,
    targetVaultFile: target.canonical,
    targetVaultSha256: sha256(target.raw),
    protectedVaultFile: protectedSource.canonical,
    protectedVaultSha256: sha256(protectedSource.raw),
    candidate: {
      applicationId: exactCandidate.applicationId,
      versionName: exactCandidate.versionName,
      buildNumber: exactCandidate.buildNumber,
      commit: exactCandidate.commit,
      apkSha256: exactCandidate.apkSha256,
      signingCertificateSha256: exactCandidate.signingCertificateSha256,
      apiBaseUrl: exactCandidate.apiBaseUrl,
    },
    recoveryRequired: false,
    targetCredentialState: 'active',
    protectedOwnerRestored: true,
    events: [{ event: 'deletion-sources-durably-bound', occurredAt: occurredAt.toISOString() }],
  };
  durablePrivateJson(journalFile, journal, { random });
  return publicJournal(journal);
}

function validateJournal(value) {
  if (value?.schemaVersion !== 1
      || value?.kind !== 'sit-staging-current-candidate-account-deletion-journal'
      || value?.apiBaseUrl !== stagingApiBaseUrl
      || value?.stripeLivemode !== false
      || !['prepared-before-deletion', 'armed-before-deletion', 'completed-account-deletion',
        'recovered-target-active', 'recovered-target-deleted'].includes(value?.status)
      || typeof value?.targetVaultFile !== 'string'
      || typeof value?.protectedVaultFile !== 'string'
      || !/^[0-9a-f]{64}$/u.test(value?.targetVaultSha256 ?? '')
      || !/^[0-9a-f]{64}$/u.test(value?.protectedVaultSha256 ?? '')
      || typeof value?.recoveryRequired !== 'boolean'
      || typeof value?.protectedOwnerRestored !== 'boolean'
      || !['active', 'deleted', 'unknown'].includes(value?.targetCredentialState)
      || !Array.isArray(value?.events)) {
    fail('The account-deletion recovery journal is invalid.');
  }
  validateCandidate(value.candidate);
  return value;
}

export function readAccountDeletionJournal(journalFile) {
  const source = readPrivateJson(journalFile, 'The account-deletion recovery journal');
  const journal = validateJournal(source.value);
  const target = readPrivateJson(journal.targetVaultFile, 'The disposable account vault');
  const protectedSource = protectedOwnerVault(journal.protectedVaultFile);
  if (sha256(protectedSource.raw) !== journal.protectedVaultSha256) {
    fail('The protected account source changed after deletion preparation.');
  }
  if (journal.status !== 'completed-account-deletion'
      && journal.status !== 'recovered-target-deleted') {
    if (sha256(target.raw) !== journal.targetVaultSha256) {
      fail('The disposable account source changed after deletion preparation.');
    }
    targetVault(journal.targetVaultFile);
  }
  if (journal.status === 'completed-account-deletion'
      || journal.status === 'recovered-target-deleted') {
    if (target.canonical === protectedSource.canonical) {
      fail('The deleted target vault collides with the protected account source.');
    }
  } else {
    exactDistinctTarget(target, protectedSource);
  }
  return { canonical: source.canonical, journal, target, protectedSource };
}

function transitionJournal({
  journalFile,
  expectedStatus,
  nextStatus,
  event,
  recoveryRequired,
  targetCredentialState,
  protectedOwnerRestored,
  occurredAt = new Date(),
  random = randomBytes,
}) {
  const { canonical, journal } = readAccountDeletionJournal(journalFile);
  if (journal.status !== expectedStatus) fail('The account-deletion journal transition is out of order.');
  journal.status = nextStatus;
  journal.recoveryRequired = recoveryRequired;
  journal.targetCredentialState = targetCredentialState;
  journal.protectedOwnerRestored = protectedOwnerRestored;
  journal.events.push({ event, occurredAt: occurredAt.toISOString() });
  durablePrivateJson(canonical, journal, { random });
  return publicJournal(journal);
}

async function jsonResponse(response) {
  try { return await response.json(); } catch { return null; }
}

export async function probeDeletionCredential({ account, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') fail('The deletion-state fetch implementation is invalid.');
  if (!/^[A-Za-z0-9._+@-]+$/u.test(account?.email ?? '')
      || !/^[A-Za-z0-9_-]{24,}$/u.test(account?.password ?? '')) {
    fail('The deletion-state credential probe input is invalid.');
  }
  const loginUrl = new URL('/api/v1/auth/login', 'https://staging.shareittoo.com');
  if (loginUrl.origin !== 'https://staging.shareittoo.com'
      || loginUrl.pathname !== '/api/v1/auth/login'
      || loginUrl.username !== ''
      || loginUrl.password !== ''
      || loginUrl.search !== ''
      || loginUrl.hash !== '') {
    fail('The deletion-state credential probe destination is invalid.');
  }
  let login;
  try {
    // The owner-only disposable Staging credential is intentionally submitted only to the
    // exact compile-time HTTPS Staging login above; schema, origin, path and payload are bounded.
    login = await fetchImpl(loginUrl.href, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      // SIT-INTENTIONAL-EGRESS: owner-only disposable credentials to the fixed Staging login.
      body: JSON.stringify({ email: account.email, password: account.password }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Object.freeze({ state: 'unknown', acceptedSessionRevoked: false });
  }
  const value = await jsonResponse(login);
  if (login.status === 401 && value?.error === 'invalid_credentials') {
    return Object.freeze({ state: 'deleted', acceptedSessionRevoked: false });
  }
  if (login.status !== 200
      || typeof value?.accessToken !== 'string'
      || typeof value?.refreshToken !== 'string') {
    return Object.freeze({ state: 'unknown', acceptedSessionRevoked: false });
  }
  let exactPrincipal = false;
  let acceptedSessionRevoked = false;
  try {
    const me = await fetchImpl(`${stagingApiBaseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${value.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    const meValue = await jsonResponse(me);
    exactPrincipal = me.status === 200
      && String(meValue?.user?.email ?? '').trim().toLowerCase()
        === account.email.trim().toLowerCase();
  } catch {
    exactPrincipal = false;
  } finally {
    try {
      const logout = await fetchImpl(`${stagingApiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: value.refreshToken }),
        signal: AbortSignal.timeout(20_000),
      });
      acceptedSessionRevoked = logout.status === 204;
    } catch {
      acceptedSessionRevoked = false;
    }
  }
  return Object.freeze({
    state: exactPrincipal && acceptedSessionRevoked ? 'active' : 'unknown',
    acceptedSessionRevoked,
  });
}

async function deletionPreflight({ account, fetchImpl }) {
  const login = await fetchImpl(`${stagingApiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(20_000),
  });
  const session = await jsonResponse(login);
  if (login.status !== 200
      || typeof session?.accessToken !== 'string'
      || typeof session?.refreshToken !== 'string') {
    fail('The disposable account could not establish an exact preflight session.');
  }
  let clear = false;
  let sessionRevoked = false;
  try {
    const response = await fetchImpl(`${stagingApiBaseUrl}/account/deletion-preflight`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    const value = await jsonResponse(response);
    clear = response.status === 200
      && value?.canDelete === true
      && Array.isArray(value?.blockers)
      && value.blockers.length === 0
      && Array.isArray(value?.retainedRecords)
      && value.retainedRecords.length === 0;
  } finally {
    try {
      const logout = await fetchImpl(`${stagingApiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        signal: AbortSignal.timeout(20_000),
      });
      sessionRevoked = logout.status === 204;
    } catch {
      sessionRevoked = false;
    }
  }
  if (!clear || !sessionRevoked) fail('The disposable account deletion preflight is not exactly clear.');
  return true;
}

export async function verifyDeletionRecoveryPreconditions({
  account,
  protectedOwner,
  fetchImpl = globalThis.fetch,
  probeCredential = probeDeletionCredential,
  runDeletionPreflight = deletionPreflight,
} = {}) {
  if (typeof fetchImpl !== 'function'
      || typeof probeCredential !== 'function'
      || typeof runDeletionPreflight !== 'function') {
    fail('The account-deletion recovery preflight dependencies are invalid.');
  }
  if ((await probeCredential({ account, fetchImpl })).state !== 'active') {
    fail('The deletion target does not have exact active credential truth.');
  }
  if ((await probeCredential({ account: protectedOwner, fetchImpl })).state !== 'active') {
    fail('The protected recovery account does not have exact active credential truth.');
  }
  await runDeletionPreflight({ account, fetchImpl });
  return Object.freeze({
    targetCredentialActive: true,
    protectedRecoveryCredentialActive: true,
    deletionPreflightClear: true,
  });
}

function nodeBounds(node) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (match === null) return null;
  return { left: Number(match[1]), top: Number(match[2]), right: Number(match[3]), bottom: Number(match[4]) };
}

function pointForNode(node, label) {
  const bounds = nodeBounds(node);
  if (bounds === null) fail(`The sanitized ${label} control has invalid bounds.`);
  return { x: Math.floor((bounds.left + bounds.right) / 2), y: Math.floor((bounds.top + bounds.bottom) / 2) };
}

export function selectDeletionNode(hierarchy, label, { chooseLast = false } = {}) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled.filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const candidates = clickable.length > 0 ? clickable : enabled;
  if (candidates.length === 0) fail(`The sanitized ${label} action is unavailable.`);
  return chooseLast ? candidates.at(-1) : candidates[0];
}

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, options = {}) {
  const point = pointForNode(selectDeletionNode(hierarchy, label, options), label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

async function waitForHierarchy({
  commandRunner, adbPath, device, wait, predicate, label, attempts = 48,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

async function findByScrolling({ commandRunner, adbPath, device, wait, label }) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, label).length > 0) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '650', '450',
    ]);
    await wait(450);
  }
  fail(`The sanitized ${label} action is unavailable after bounded scrolling.`);
}

function editNodes(hierarchy) {
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
}

export function inputForHint(hierarchy, hint) {
  const matches = editNodes(hierarchy).filter((node) => [
    currentHeadAndroidNodeAttribute(node, 'hint'),
    currentHeadAndroidNodeAttribute(node, 'text'),
    currentHeadAndroidNodeAttribute(node, 'content-desc'),
  ].some((value) => String(value ?? '').includes(hint)));
  if (matches.length !== 1) fail(`The sanitized ${hint} input is ambiguous.`);
  return matches[0];
}

function replaceInput(commandRunner, adbPath, device, hierarchy, hint, value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 256
      || /[\r\n\0]/u.test(value)) {
    fail(`The private ${hint} input is invalid.`);
  }
  const point = pointForNode(inputForHint(hierarchy, hint), hint);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '--longpress', 'KEYCODE_DEL',
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'text', value]);
}

export function germanGboardDeletionConfirmationPoint({ width, height } = {}) {
  if (width !== 1440 || height !== 3120) {
    fail('The verified German Gboard geometry is unavailable for this display.');
  }
  return Object.freeze({ x: 1215, y: 2525 });
}

async function enterDeletionConfirmation(commandRunner, adbPath, device, hierarchy, wait) {
  const ime = currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'settings', 'get', 'secure', 'default_input_method',
  ]);
  if (ime !== 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME') {
    fail('The verified German Gboard input method is not active.');
  }
  const sizeOutput = currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'wm', 'size']);
  const size = /Physical size:\s*(\d+)x(\d+)/u.exec(sizeOutput);
  const point = germanGboardDeletionConfirmationPoint({
    width: Number(size?.[1]),
    height: Number(size?.[2]),
  });
  const fieldPoint = pointForNode(inputForHint(hierarchy, 'LÖSCHEN'), 'LÖSCHEN');
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(fieldPoint.x), String(fieldPoint.y),
  ]);
  await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'focused-deletion-confirmation', attempts: 20,
    predicate: (value) => editNodes(value).some((node) =>
      String(currentHeadAndroidNodeAttribute(node, 'hint') ?? '').includes('LÖSCHEN')
        && currentHeadAndroidNodeAttribute(node, 'focused') === 'true'),
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'text', 'L']);
  await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'initial-deletion-confirmation-text', attempts: 20,
    predicate: (value) => editNodes(value).some((node) =>
      currentHeadAndroidNodeAttribute(node, 'text') === 'L'),
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
  await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'german-umlaut-confirmation-text', attempts: 20,
    predicate: (value) => editNodes(value).some((node) =>
      currentHeadAndroidNodeAttribute(node, 'text') === 'Lö'),
  });
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'text', 'SCHEN']);
  return waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'exact-deletion-confirmation-text', attempts: 20,
    predicate: (value) => editNodes(value).filter((node) =>
      String(currentHeadAndroidNodeAttribute(node, 'text') ?? '').trim().toUpperCase() === 'LÖSCHEN')
      .length === 1,
  });
}

async function openTargetAccountSettings({ commandRunner, adbPath, device, wait, target, protectedOwner }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  let hierarchy = await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Mein SIT', { chooseLast: true });
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'target-profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, target.displayName).length === 1
      && currentHeadAndroidNamedNodes(value, protectedOwner.displayName).length === 0
      && currentHeadAndroidNamedNodes(value, 'Abmelden').length >= 1,
  });
  hierarchy = await findByScrolling({ commandRunner, adbPath, device, wait, label: 'Kontoeinstellungen' });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Kontoeinstellungen');
  await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'account-settings',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'DATENSCHUTZ').length >= 1,
  });
  return findByScrolling({ commandRunner, adbPath, device, wait, label: 'Konto löschen' });
}

export async function openDeletionConfirmation({ commandRunner, adbPath, device, wait, target, protectedOwner }) {
  let hierarchy = await openTargetAccountSettings({ commandRunner, adbPath, device, wait, target, protectedOwner });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Konto löschen');
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'first-deletion-confirmation',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Konto wirklich löschen?').length >= 1
      && currentHeadAndroidNamedNodes(value, 'Konto endgültig löschen').length >= 1,
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Konto endgültig löschen');
  return waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'second-deletion-confirmation',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Bist du sicher?').length >= 1
      && currentHeadAndroidNamedNodes(value, 'Ja, Konto endgültig löschen').length >= 1
      && editNodes(value).length === 2,
  });
}

async function submitDeletionPassword({
  commandRunner, adbPath, device, wait, target, protectedOwner, password,
}) {
  let hierarchy = await openDeletionConfirmation({ commandRunner, adbPath, device, wait, target, protectedOwner });
  hierarchy = await enterDeletionConfirmation(commandRunner, adbPath, device, hierarchy, wait);
  await wait(500);
  replaceInput(commandRunner, adbPath, device, hierarchy, 'Aktuelles Passwort', password);
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '4']);
  await wait(400);
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'enabled-final-deletion-action', attempts: 20,
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Ja, Konto endgültig löschen')
      .some((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false'),
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Ja, Konto endgültig löschen', { chooseLast: true });
}

async function restoreProtectedOwner({ commandRunner, adbPath, device, wait, account }) {
  if (await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait }) !== true
      || await restoreSyntheticSession({ commandRunner, adbPath, device, wait, account }) !== true) {
    fail('The protected owner session could not be restored.');
  }
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  let hierarchy = await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Mein SIT', { chooseLast: true });
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'protected-owner-restored',
    predicate: (value) => currentHeadAndroidNamedNodes(value, account.displayName).length === 1
      && currentHeadAndroidNamedNodes(value, 'Gast').length === 0,
  });
  return hierarchy.length > 0;
}

export function isExactGuestProfile(hierarchy, targetDisplayName, protectedDisplayName) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Konto erstellen').length >= 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Anmelden').length >= 1
    && currentHeadAndroidNamedNodes(hierarchy, targetDisplayName).length === 0
    && currentHeadAndroidNamedNodes(hierarchy, protectedDisplayName).length === 0;
}

async function verifyGuestColdStart({ commandRunner, adbPath, device, wait, target, protectedOwner }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  let hierarchy = await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Mein SIT', { chooseLast: true });
  hierarchy = await waitForHierarchy({
    commandRunner, adbPath, device, wait, label: 'post-deletion-guest-cold-start', attempts: 48,
    predicate: (value) => isExactGuestProfile(value, target.displayName, protectedOwner.displayName),
  });
  return hierarchy.length > 0;
}

function scrubDeletedTargetVault(target, occurredAt) {
  const vault = structuredClone(target.value);
  delete vault.account.email;
  delete vault.account.password;
  vault.account.registrationStatus = 'deleted';
  vault.account.verificationStatus = 'deleted';
  vault.account.deletionStatus = 'confirmed-erased';
  vault.account.deletedAt = occurredAt.toISOString();
  vault.status = 'pixel-account-deletion-complete';
  vault.deletedAt = occurredAt.toISOString();
  durablePrivateJson(target.canonical, vault);
  return true;
}

export async function executePixelAccountDeletion({
  journalFile,
  candidate,
  device,
  fetchImpl = globalThis.fetch,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  verifyInstalled = verifyCurrentHeadAndroidInstalledCandidate,
  occurredAt = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('The account-deletion fetch implementation is invalid.');
  const exactCandidate = validateCandidate(candidate);
  let { journal, target, protectedSource } = readAccountDeletionJournal(journalFile);
  if (journal.status !== 'prepared-before-deletion' || journal.recoveryRequired) {
    fail('The account-deletion journal is not in its safe prepared state.');
  }
  if (Object.entries(journal.candidate).some(([key, value]) => exactCandidate[key] !== value)) {
    fail('The installed candidate does not match the durable deletion binding.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalled(commandRunner, adbPath, device, exactCandidate);
  const account = target.value.account;
  const protectedOwner = protectedSource.owner;
  await verifyDeletionRecoveryPreconditions({ account, protectedOwner, fetchImpl });
  transitionJournal({
    journalFile,
    expectedStatus: 'prepared-before-deletion',
    nextStatus: 'armed-before-deletion',
    event: 'recovery-armed-before-first-deletion-attempt',
    recoveryRequired: true,
    targetCredentialState: 'active',
    protectedOwnerRestored: false,
  });

  try {
    if (await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait }) !== true
        || await restoreSyntheticSession({ commandRunner, adbPath, device, wait, account }) !== true) {
      fail('The disposable account could not be restored on the Pixel.');
    }
    const wrongPassword = [account.password, 'intentional', 'mismatch'].join('-');
    await submitDeletionPassword({
      commandRunner, adbPath, device, wait, target: account, protectedOwner, password: wrongPassword,
    });
    let hierarchy = await waitForHierarchy({
      commandRunner, adbPath, device, wait, label: 'definite-deletion-rejection', attempts: 60,
      predicate: (value) => currentHeadAndroidNamedNodes(value, 'Konto nicht gelöscht').length >= 1
        && value.includes('eindeutig abgelehnt'),
    });
    if ((await probeDeletionCredential({ account, fetchImpl })).state !== 'active') {
      fail('The definite wrong-password rejection did not preserve the target account.');
    }
    tapNamedNode(commandRunner, adbPath, device, hierarchy, 'OK');
    await wait(400);
    await submitDeletionPassword({
      commandRunner, adbPath, device, wait, target: account, protectedOwner, password: account.password,
    });
    await waitForHierarchy({
      commandRunner, adbPath, device, wait, label: 'confirmed-account-deletion', attempts: 72,
      predicate: (value) => currentHeadAndroidNamedNodes(value, 'Dein Konto wurde gelöscht').length === 1,
    });
    if ((await probeDeletionCredential({ account, fetchImpl })).state !== 'deleted') {
      fail('The deleted account was not independently rejected by Staging.');
    }
    await verifyGuestColdStart({
      commandRunner, adbPath, device, wait, target: account, protectedOwner,
    });
    await restoreProtectedOwner({ commandRunner, adbPath, device, wait, account: protectedOwner });
    const completedAt = new Date();
    scrubDeletedTargetVault(target, completedAt);
    // The target vault is now intentionally scrubbed, so finalize without rereading its prior hash.
    const journalSource = readPrivateJson(journalFile, 'The account-deletion recovery journal');
    journal = validateJournal(journalSource.value);
    journal.status = 'completed-account-deletion';
    journal.recoveryRequired = false;
    journal.targetCredentialState = 'deleted';
    journal.protectedOwnerRestored = true;
    journal.events.push({ event: 'account-deletion-and-owner-restoration-confirmed', occurredAt: completedAt.toISOString() });
    durablePrivateJson(journalSource.canonical, journal);
    return Object.freeze({
      ...publicJournal(journal),
      installedVersionName: installed.versionName,
      installedBuildNumber: installed.buildNumber,
      deletionPreflightClear: true,
      protectedOwnerRecoveryPreflightPassed: true,
      wrongPasswordDefinitelyRejected: true,
      rejectedAttemptPreservedAccount: true,
      accountDeletionUiConfirmed: true,
      deletedCredentialsRejected: true,
      terminatedProcessGuestStatePassed: true,
      protectedOwnerSessionRestored: true,
      privateTargetCredentialsScrubbed: true,
      containsRawDeviceIdentifier: false,
    });
  } catch (error) {
    const state = await probeDeletionCredential({ account, fetchImpl });
    let ownerRestored = false;
    try {
      ownerRestored = await restoreProtectedOwner({
        commandRunner, adbPath, device, wait, account: protectedOwner,
      });
    } catch {
      ownerRestored = false;
    }
    if (state.state !== 'unknown' && ownerRestored) {
      if (state.state === 'deleted') scrubDeletedTargetVault(target, new Date());
      const journalSource = readPrivateJson(journalFile, 'The account-deletion recovery journal');
      journal = validateJournal(journalSource.value);
      journal.status = state.state === 'deleted' ? 'recovered-target-deleted' : 'recovered-target-active';
      journal.recoveryRequired = false;
      journal.targetCredentialState = state.state;
      journal.protectedOwnerRestored = true;
      journal.events.push({
        event: state.state === 'deleted'
          ? 'failure-recovered-with-deleted-target-and-owner-restored'
          : 'failure-recovered-with-active-target-and-owner-restored',
        occurredAt: new Date().toISOString(),
      });
      durablePrivateJson(journalSource.canonical, journal);
      throw error;
    }
    fail(`${sanitizeAccountDeletionFailure(error)} Account-deletion recovery remains required.`);
  }
}

export function sanitizeAccountDeletionFailure(error) {
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (message.length > 0
      && message.length <= 220
      && !/@|\+\d|\b\d{6,}\b|[A-Za-z0-9_-]{32,}/u.test(message)
      && /^(The |A |Android |ADB |Pixel )/u.test(message)) {
    return message;
  }
  return 'The sanitized current-candidate account-deletion diagnostic failed.';
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? fail('The account-deletion phase is required.');
  const journalFile = resolve(
    argumentValue(args, '--journal-file') ?? fail('The account-deletion journal file is required.'),
  );
  if (!['prepare', 'execute'].includes(phase)) fail('The account-deletion phase is invalid.');
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('The candidate directory is required.'),
  );
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  if (phase === 'prepare') {
    const result = prepareAccountDeletionJournal({
      targetVaultFile: resolve(
        argumentValue(args, '--target-vault-file') ?? fail('The target account vault is required.'),
      ),
      protectedVaultFile: resolve(
        argumentValue(args, '--protected-vault-file') ?? fail('The protected account vault is required.'),
      ),
      journalFile,
      candidate,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const devices = parseAdbDevices(defaultCurrentHeadAndroidCommandRunner('adb', ['devices', '-l']));
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: 'adb', device });
  const result = await executePixelAccountDeletion({ journalFile, candidate, device });
  process.stdout.write(`${JSON.stringify({
    ...result,
    device: deviceSummary,
    boundaries: {
      stagingOnly: true,
      disposableSyntheticAccountDeleted: true,
      protectedOwnerDeleted: false,
      realMoneyUsed: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      productionChanged: false,
      googlePlayChanged: false,
      onePlusContacted: false,
      credentialsPrinted: false,
      accountIdentityPrinted: false,
      rawDeviceIdentifierPrinted: false,
    },
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch((error) => {
    process.stderr.write(`ERROR: ${sanitizeAccountDeletionFailure(error)}\n`);
    process.exitCode = 1;
  });
}
