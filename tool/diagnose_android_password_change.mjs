#!/usr/bin/env node

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
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
  readEmailVerifiedJourneyVault,
} from './run_staging_email_verified_two_role_journey.mjs';
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
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const applicationId = 'com.shareittoo.app';

function fail(message) {
  throw new Error(message);
}

function sourceVaultMac(value, integrityKey) {
  return createHmac('sha256', Buffer.from(integrityKey, 'base64url'))
    .update(value)
    .digest('hex');
}

function sameDigest(left, right) {
  if (!/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function outsideRepository(path, label) {
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail(`${label} must remain outside the repository.`);
  }
  return absolute;
}

function ensurePrivateDirectory(path) {
  const absolute = outsideRepository(path, 'The password-change journal directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  const stat = statSync(absolute);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) {
    fail('The password-change journal directory is not owner-only.');
  }
  return realpathSync(absolute);
}

function durablePrivateJson(path, value, { random = randomBytes } = {}) {
  const absolute = outsideRepository(path, 'The password-change journal');
  const directory = ensurePrivateDirectory(dirname(absolute));
  const finalPath = resolve(directory, basename(absolute));
  const temporary = `${finalPath}.${random(8).toString('hex')}.tmp`;
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
    renameSync(temporary, finalPath);
    const directoryDescriptor = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Continue with best-effort removal of the private temporary file.
      }
    }
    try {
      unlinkSync(temporary);
    } catch {
      // The atomic rename may already have consumed the temporary file.
    }
    throw error;
  }
  return finalPath;
}

function readPrivateJson(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be absolute.`);
  let canonical;
  let descriptor;
  try {
    canonical = realpathSync(path);
    outsideRepository(canonical, label);
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
      fail(`${label} must be a non-empty owner-only regular file.`);
    }
    return { canonical, value: JSON.parse(readFileSync(descriptor, 'utf8')) };
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${label} is not valid JSON.`);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateCandidate(candidate) {
  if (candidate?.applicationId !== applicationId
      || candidate?.apiBaseUrl !== stagingApiBaseUrl
      || candidate?.versionName !== '1.0.0'
      || !/^\d{10}$/u.test(String(candidate?.buildNumber ?? ''))
      || !/^[0-9a-f]{40}$/u.test(candidate?.commit ?? '')
      || !/^[0-9a-f]{64}$/u.test(candidate?.apkSha256 ?? '')
      || !/^[0-9a-f]{64}$/u.test(candidate?.signingCertificateSha256 ?? '')) {
    fail('The password-change journal candidate binding is invalid.');
  }
  return candidate;
}

function assertCandidateBinding(journalCandidate, requestedCandidate) {
  const journal = validateCandidate(journalCandidate);
  const requested = validateCandidate(requestedCandidate);
  const fields = [
    'applicationId',
    'versionName',
    'buildNumber',
    'commit',
    'apkSha256',
    'signingCertificateSha256',
    'apiBaseUrl',
  ];
  if (fields.some((field) => journal[field] !== requested[field])) {
    fail('The installed candidate does not match the durable password-change binding.');
  }
}

function replacementPassword(random) {
  const value = `S1tC${random(24).toString('base64url')}`;
  if (!/^S1tC[A-Za-z0-9_-]{32}$/u.test(value)) fail('The replacement-password source is invalid.');
  return value;
}

function journalPublicResult(journal) {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-password-change-journal',
    status: journal.status,
    candidateCommit: journal.candidate.commit,
    candidateBuildNumber: journal.candidate.buildNumber,
    accountRole: journal.accountRole,
    rollbackRequired: journal.rollbackRequired,
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
    containsPrivateFilesystemPath: false,
  });
}

export function preparePasswordChangeJournal({
  sourceVaultFile,
  journalFile,
  candidate,
  accountRole = 'renter',
  now = new Date(),
  random = randomBytes,
  readVault = readEmailVerifiedJourneyVault,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof random !== 'function') {
    fail('The password-change journal dependencies are invalid.');
  }
  const exactCandidate = validateCandidate(candidate);
  const source = readVault(sourceVaultFile);
  const account = source?.vault?.accounts?.find((entry) => entry.role === accountRole);
  if (source?.vault?.apiBaseUrl !== stagingApiBaseUrl
      || source?.vault?.stripeLivemode !== false
      || !['owner', 'renter'].includes(accountRole)
      || typeof account?.email !== 'string'
      || typeof account?.password !== 'string'
      || account.password.length < 10) {
    fail('The password-change source account is not an eligible Staging fixture.');
  }
  const canonicalSourceVault = realpathSync(source.canonical);
  outsideRepository(canonicalSourceVault, 'The password-change source vault');
  const sourceVaultIntegrityKey = random(32).toString('base64url');
  if (!/^[A-Za-z0-9_-]{43}$/u.test(sourceVaultIntegrityKey)) {
    fail('The password-change source-vault integrity key is invalid.');
  }
  const journal = {
    schemaVersion: 1,
    kind: 'sit-staging-current-candidate-password-change-journal',
    status: 'prepared-before-password-mutation',
    createdAt: now.toISOString(),
    apiBaseUrl: stagingApiBaseUrl,
    stripeLivemode: false,
    candidate: {
      applicationId: exactCandidate.applicationId,
      versionName: exactCandidate.versionName,
      buildNumber: exactCandidate.buildNumber,
      commit: exactCandidate.commit,
      apkSha256: exactCandidate.apkSha256,
      signingCertificateSha256: exactCandidate.signingCertificateSha256,
      apiBaseUrl: exactCandidate.apiBaseUrl,
    },
    sourceVaultFile: canonicalSourceVault,
    sourceVaultIntegrityKey,
    sourceVaultMac: sourceVaultMac(
      readFileSync(canonicalSourceVault),
      sourceVaultIntegrityKey,
    ),
    accountRole,
    replacementPassword: replacementPassword(random),
    rollbackRequired: false,
    events: [{ event: 'rollback-credential-durably-prepared', occurredAt: now.toISOString() }],
  };
  durablePrivateJson(journalFile, journal, { random });
  return journalPublicResult(journal);
}

function validateJournal(value) {
  const activeRollback = value?.status !== 'original-password-restored';
  if (value?.schemaVersion !== 1
      || value?.kind !== 'sit-staging-current-candidate-password-change-journal'
      || value?.apiBaseUrl !== stagingApiBaseUrl
      || value?.stripeLivemode !== false
      || !['prepared-before-password-mutation', 'armed-before-password-mutation',
        'replacement-password-confirmed', 'original-password-restored'].includes(value?.status)
      || !['owner', 'renter'].includes(value?.accountRole)
      || typeof value?.sourceVaultFile !== 'string'
      || !isAbsolute(value.sourceVaultFile)
      || !/^[A-Za-z0-9_-]{43}$/u.test(value?.sourceVaultIntegrityKey ?? '')
      || !/^[0-9a-f]{64}$/u.test(value?.sourceVaultMac ?? '')
      || (activeRollback && !/^S1tC[A-Za-z0-9_-]{32}$/u.test(value?.replacementPassword ?? ''))
      || (!activeRollback && value?.replacementPassword !== undefined)
      || (!activeRollback && value?.replacementCredentialRemoved !== true)
      || typeof value?.rollbackRequired !== 'boolean'
      || !Array.isArray(value?.events)) {
    fail('The password-change journal is invalid.');
  }
  validateCandidate(value.candidate);
  return value;
}

export function readPasswordChangeJournal(
  journalFile,
  { readVault = readEmailVerifiedJourneyVault } = {},
) {
  const { canonical, value } = readPrivateJson(journalFile, 'The password-change journal');
  const journal = validateJournal(value);
  const source = readVault(journal.sourceVaultFile);
  const actualSourceVaultMac = sourceVaultMac(
    readFileSync(source.canonical),
    journal.sourceVaultIntegrityKey,
  );
  if (!sameDigest(actualSourceVaultMac, journal.sourceVaultMac)) {
    fail('The password-change source vault changed after journal preparation.');
  }
  const account = source.vault.accounts.find((entry) => entry.role === journal.accountRole);
  if (account === undefined) fail('The journal account role is no longer available.');
  return { canonical, journal, source, account };
}

export function classifyPasswordCredentialState({ original, replacement } = {}) {
  const accepted = (value) => value?.status === 200
    && value?.principalMatches === true
    && value?.sessionRevoked === true;
  const rejected = (value) => value?.status === 401
    && value?.error === 'invalid_credentials'
    && value?.sessionCreated !== true;
  if (accepted(original) && rejected(replacement)) return 'original-password-active';
  if (rejected(original) && accepted(replacement)) return 'replacement-password-active';
  return 'password-state-unknown';
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function probeCredential(fetchImpl, account, password) {
  let login;
  try {
    login = await fetchImpl(`${stagingApiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      body: JSON.stringify({ email: account.email, password }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { status: null, error: null, sessionCreated: false };
  }
  const value = await readJson(login);
  if (login.status === 401) {
    return {
      status: 401,
      error: value?.error === 'invalid_credentials' ? 'invalid_credentials' : null,
      sessionCreated: false,
    };
  }
  if (login.status !== 200
      || typeof value?.accessToken !== 'string'
      || value.accessToken.length < 20
      || typeof value?.refreshToken !== 'string'
      || value.refreshToken.length < 20) {
    return { status: login.status, error: null, sessionCreated: false };
  }

  let principalMatches = false;
  try {
    const me = await fetchImpl(`${stagingApiBaseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${value.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    const meValue = await readJson(me);
    principalMatches = me.status === 200
      && typeof meValue?.user?.id === 'string'
      && meValue.user.id.length > 0
      && String(meValue.user.email ?? '').trim().toLowerCase()
        === account.email.trim().toLowerCase();
  } catch {
    principalMatches = false;
  }

  let sessionRevoked = false;
  try {
    const logout = await fetchImpl(`${stagingApiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: value.refreshToken }),
      signal: AbortSignal.timeout(20_000),
    });
    sessionRevoked = logout.status === 204;
  } catch {
    sessionRevoked = false;
  }
  return {
    status: login.status,
    principalMatches,
    sessionRevoked,
    sessionCreated: true,
  };
}

export async function probePasswordChangeJournal({
  journalFile,
  fetchImpl = globalThis.fetch,
  readVault = readEmailVerifiedJourneyVault,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A password-state fetch implementation is required.');
  const { journal, account } = readPasswordChangeJournal(journalFile, { readVault });
  if (journal.replacementPassword === undefined
      || journal.status === 'prepared-before-password-mutation') {
    const original = await probeCredential(fetchImpl, account, account.password);
    const originalAccepted = original.status === 200
      && original.principalMatches === true
      && original.sessionRevoked === true;
    return Object.freeze({
      state: ['prepared-before-password-mutation', 'original-password-restored']
        .includes(journal.status) && originalAccepted
        ? 'original-password-active'
        : 'password-state-unknown',
      originalAccepted,
      replacementAccepted: false,
      acceptedSessionRevoked: originalAccepted,
      exactStructuredRejectionObserved: false,
      containsEmailAddress: false,
      containsCredential: false,
      containsToken: false,
    });
  }
  const replacement = await probeCredential(
    fetchImpl,
    account,
    journal.replacementPassword,
  );
  const original = await probeCredential(fetchImpl, account, account.password);
  const state = classifyPasswordCredentialState({ original, replacement });
  return Object.freeze({
    state,
    originalAccepted: state === 'original-password-active',
    replacementAccepted: state === 'replacement-password-active',
    acceptedSessionRevoked: state !== 'password-state-unknown',
    exactStructuredRejectionObserved: state !== 'password-state-unknown',
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
  });
}

export async function probePasswordChangeJournalUntilKnown({
  journalFile,
  fetchImpl,
  readVault,
  probe = probePasswordChangeJournal,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  attempts = 3,
} = {}) {
  if (typeof probe !== 'function' || typeof wait !== 'function'
      || !Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    fail('The bounded password-state probe configuration is invalid.');
  }
  let observed = { state: 'password-state-unknown' };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    observed = await probe({ journalFile, fetchImpl, readVault });
    if (observed?.state !== 'password-state-unknown') return observed;
    if (attempt + 1 < attempts) await wait(attempt === 0 ? 1_000 : 3_000);
  }
  return observed;
}

export function transitionPasswordChangeJournal({
  journalFile,
  expectedStatus,
  nextStatus,
  observedCredentialState,
  occurredAt = new Date(),
  random = randomBytes,
  readVault = readEmailVerifiedJourneyVault,
} = {}) {
  if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    fail('The password-change journal transition timestamp is invalid.');
  }
  const { canonical, journal } = readPasswordChangeJournal(journalFile, { readVault });
  const transitions = new Map([
    ['prepared-before-password-mutation:armed-before-password-mutation', {
      requiredState: 'original-password-active',
      rollbackRequired: true,
      event: 'rollback-armed-before-first-password-mutation',
    }],
    ['armed-before-password-mutation:replacement-password-confirmed', {
      requiredState: 'replacement-password-active',
      rollbackRequired: true,
      event: 'replacement-password-exactly-confirmed',
    }],
    ['replacement-password-confirmed:original-password-restored', {
      requiredState: 'original-password-active',
      rollbackRequired: false,
      event: 'original-password-exactly-restored',
    }],
    ['armed-before-password-mutation:original-password-restored', {
      requiredState: 'original-password-active',
      rollbackRequired: false,
      event: 'original-password-retained-after-armed-attempt',
    }],
  ]);
  const transition = transitions.get(`${expectedStatus}:${nextStatus}`);
  if (journal.status !== expectedStatus
      || transition === undefined
      || observedCredentialState !== transition.requiredState) {
    fail('The password-change journal transition is not safely proven.');
  }
  journal.status = nextStatus;
  journal.rollbackRequired = transition.rollbackRequired;
  journal.events.push({ event: transition.event, occurredAt: occurredAt.toISOString() });
  if (nextStatus === 'original-password-restored') {
    delete journal.replacementPassword;
    journal.replacementCredentialRemoved = true;
  }
  durablePrivateJson(canonical, journal, { random });
  return journalPublicResult(journal);
}

async function authenticatedPasswordMutation({
  fetchImpl,
  account,
  currentPassword,
  newPassword,
}) {
  const login = await fetchImpl(`${stagingApiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify({ email: account.email, password: currentPassword }),
    signal: AbortSignal.timeout(20_000),
  });
  const session = await readJson(login);
  if (login.status !== 200
      || typeof session?.accessToken !== 'string'
      || session.accessToken.length < 20
      || typeof session?.refreshToken !== 'string'
      || session.refreshToken.length < 20) {
    fail('The replacement credential could not establish a rollback session.');
  }
  const authorized = { authorization: `Bearer ${session.accessToken}` };
  let mutationSubmitted = false;
  let mutationSessionInvalidated = false;
  let fallbackSessionRevoked = false;
  try {
    const me = await fetchImpl(`${stagingApiBaseUrl}/auth/me`, {
      headers: authorized,
      signal: AbortSignal.timeout(20_000),
    });
    const meValue = await readJson(me);
    if (me.status !== 200
        || typeof meValue?.user?.id !== 'string'
        || meValue.user.id.length === 0
        || String(meValue.user.email ?? '').trim().toLowerCase()
          !== account.email.trim().toLowerCase()) {
      fail('The rollback session did not bind to the expected principal.');
    }
    const changed = await fetchImpl(`${stagingApiBaseUrl}/auth/password/change`, {
      method: 'POST',
      headers: { ...authorized, 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
      signal: AbortSignal.timeout(20_000),
    });
    mutationSubmitted = changed.status === 204;
    const after = await fetchImpl(`${stagingApiBaseUrl}/auth/me`, {
      headers: authorized,
      signal: AbortSignal.timeout(20_000),
    });
    mutationSessionInvalidated = after.status === 401;
  } finally {
    try {
      const logout = await fetchImpl(`${stagingApiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        signal: AbortSignal.timeout(20_000),
      });
      fallbackSessionRevoked = logout.status === 204 || logout.status === 401;
    } catch {
      fallbackSessionRevoked = false;
    }
  }
  return { mutationSubmitted, mutationSessionInvalidated, fallbackSessionRevoked };
}

export async function restoreOriginalPassword({
  journalFile,
  fetchImpl = globalThis.fetch,
  readVault = readEmailVerifiedJourneyVault,
  probe = probePasswordChangeJournal,
  mutate = authenticatedPasswordMutation,
  occurredAt = new Date(),
  random = randomBytes,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof probe !== 'function' || typeof mutate !== 'function') {
    fail('The password rollback dependencies are invalid.');
  }
  let { journal, account } = readPasswordChangeJournal(journalFile, { readVault });
  let observed = await probePasswordChangeJournalUntilKnown({
    journalFile,
    fetchImpl,
    readVault,
    probe,
    wait,
  });
  if (journal.status === 'original-password-restored') {
    if (observed.state !== 'original-password-active') {
      fail('The completed password rollback no longer has exact credential truth.');
    }
    return Object.freeze({
      status: journal.status,
      originalPasswordRestored: true,
      remoteRollbackSubmitted: false,
      acceptedSessionRevoked: true,
      containsCredential: false,
      containsToken: false,
    });
  }
  if (!journal.rollbackRequired
      || !['armed-before-password-mutation', 'replacement-password-confirmed'].includes(journal.status)) {
    fail('The password-change journal is not armed for rollback.');
  }
  if (observed.state === 'original-password-active') {
    const result = transitionPasswordChangeJournal({
      journalFile,
      expectedStatus: journal.status,
      nextStatus: 'original-password-restored',
      observedCredentialState: observed.state,
      occurredAt,
      random,
      readVault,
    });
    return Object.freeze({
      ...result,
      originalPasswordRestored: true,
      remoteRollbackSubmitted: false,
      acceptedSessionRevoked: true,
    });
  }
  if (observed.state !== 'replacement-password-active') {
    fail('Password truth is unknown; rollback mutation was not attempted.');
  }
  if (journal.status === 'armed-before-password-mutation') {
    transitionPasswordChangeJournal({
      journalFile,
      expectedStatus: journal.status,
      nextStatus: 'replacement-password-confirmed',
      observedCredentialState: observed.state,
      occurredAt,
      random,
      readVault,
    });
    ({ journal, account } = readPasswordChangeJournal(journalFile, { readVault }));
  }
  let mutation = { mutationSubmitted: false, mutationSessionInvalidated: false };
  try {
    mutation = await mutate({
      fetchImpl,
      account,
      currentPassword: journal.replacementPassword,
      newPassword: account.password,
    });
  } catch {
    // A lost response is resolved only by the independent credential probe.
  }
  observed = await probePasswordChangeJournalUntilKnown({
    journalFile,
    fetchImpl,
    readVault,
    probe,
    wait,
  });
  if (observed.state !== 'original-password-active') {
    fail('The original password was not independently confirmed after rollback.');
  }
  const result = transitionPasswordChangeJournal({
    journalFile,
    expectedStatus: 'replacement-password-confirmed',
    nextStatus: 'original-password-restored',
    observedCredentialState: observed.state,
    occurredAt,
    random,
    readVault,
  });
  return Object.freeze({
    ...result,
    originalPasswordRestored: true,
    remoteRollbackSubmitted: mutation.mutationSubmitted === true,
    mutationSessionInvalidated: mutation.mutationSessionInvalidated === true,
    acceptedSessionRevoked: true,
  });
}

function nodeBounds(node) {
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (match === null) return null;
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
}

function pointForNode(node, label) {
  const bounds = nodeBounds(node);
  if (bounds === null) fail(`The sanitized ${label} control has invalid bounds.`);
  return {
    x: Math.floor((bounds.left + bounds.right) / 2),
    y: Math.floor((bounds.top + bounds.bottom) / 2),
  };
}

export function selectNamedPasswordActionNode(
  hierarchy,
  label,
  { chooseLast = false } = {},
) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  const nodes = clickable.length > 0 ? clickable : enabled;
  if (nodes.length === 0) fail(`The sanitized ${label} action is unavailable.`);
  return chooseLast ? nodes.at(-1) : nodes[0];
}

export function passwordSuccessResultRequiresExplicitDismissal(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'OK')
    .some((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
}

export function isPasswordChangeLoginSurface(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Anmelden').length > 0
    && editableNodesForLabel(hierarchy, 'E-Mail').length > 0;
}

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, { chooseLast = false } = {}) {
  const node = selectNamedPasswordActionNode(hierarchy, label, { chooseLast });
  const point = pointForNode(node, label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

function editableNodesForLabel(hierarchy, label) {
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .filter((node) => [
      currentHeadAndroidNodeAttribute(node, 'hint'),
      currentHeadAndroidNodeAttribute(node, 'text'),
      currentHeadAndroidNodeAttribute(node, 'content-desc'),
    ].includes(label));
}

function editableNodeForLabel(hierarchy, label) {
  const labels = currentHeadAndroidNamedNodes(hierarchy, label)
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter((entry) => entry.bounds !== null);
  const editable = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter((entry) => entry.bounds !== null);
  const directNodes = new Set(editableNodesForLabel(hierarchy, label));
  const direct = editable.filter(({ node }) => directNodes.has(node));
  if (direct.length === 1) return direct[0].node;
  const candidates = [];
  for (const labelled of labels) {
    for (const field of editable) {
      const verticalGap = field.bounds.top - labelled.bounds.bottom;
      const horizontalOverlap = Math.min(field.bounds.right, labelled.bounds.right)
        - Math.max(field.bounds.left, labelled.bounds.left);
      if (verticalGap >= 0 && verticalGap <= 420 && horizontalOverlap > 0) {
        candidates.push({ ...field, verticalGap });
      }
    }
  }
  candidates.sort((left, right) => left.verticalGap - right.verticalGap);
  if (candidates.length === 0) fail(`The sanitized ${label} input is unavailable.`);
  return candidates[0].node;
}

function replaceSecretInput(commandRunner, adbPath, device, hierarchy, label, value) {
  if (!/^[A-Za-z0-9._+@-]{10,256}$/u.test(value)) {
    fail(`The private ${label} fixture is not safe for bounded Android input.`);
  }
  const field = editableNodeForLabel(hierarchy, label);
  if ((currentHeadAndroidNodeAttribute(field, 'text') ?? '').length !== 0) {
    fail(`The private ${label} field is not initially empty.`);
  }
  const point = pointForNode(field, label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'text', value]);
}

function wakePasswordChangeScreen(commandRunner, adbPath, device) {
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'keyevent', '224',
  ]);
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
}

async function waitForPasswordSurface({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  label,
  attempts = 60,
  classify,
}) {
  let lastClassification = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    wakePasswordChangeScreen(commandRunner, adbPath, device);
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
    if (typeof classify === 'function') lastClassification = classify(hierarchy);
  }
  fail(lastClassification === null
    ? `The sanitized ${label} surface did not appear.`
    : `The sanitized ${label} surface did not appear; last classification: ${lastClassification}.`);
}

export function classifyPasswordChangeSurface(hierarchy) {
  const value = String(hierarchy);
  if (currentHeadAndroidNamedNodes(value, 'Passwort geändert').length > 0) {
    return 'definite-password-change-success';
  }
  if (currentHeadAndroidNamedNodes(value, 'Passwort nicht geändert').length > 0) {
    return 'definite-password-change-rejection';
  }
  if (currentHeadAndroidNamedNodes(value, 'Passwort serverseitig geändert').length > 0) {
    return 'confirmed-password-change-local-finalization-failed';
  }
  if (currentHeadAndroidNamedNodes(value, 'Ergebnis der Passwortänderung unklar').length > 0) {
    return 'password-change-outcome-unknown';
  }
  if (['Aktuelles Passwort', 'Neues Passwort', 'Neues Passwort bestätigen']
    .every((entry) => editableNodesForLabel(value, entry).length > 0)) {
    return 'password-form';
  }
  if (currentHeadAndroidNamedNodes(value, 'Passwort ändern').length > 0) {
    return 'security-settings';
  }
  if (currentHeadAndroidNamedNodes(value, 'Kontoeinstellungen').length > 0) {
    return 'account-settings-entry';
  }
  if (currentHeadAndroidNamedNodes(value, 'Abmelden').length > 0) {
    return 'authenticated-profile';
  }
  if (currentHeadAndroidNamedNodes(value, 'Anmelden').length > 0) {
    return 'login';
  }
  return 'unclassified';
}

export function isPasswordInteractionOwnerReadySurface(hierarchy) {
  const currentDeviceNodes = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => [
      currentHeadAndroidNodeAttribute(node, 'text'),
      currentHeadAndroidNodeAttribute(node, 'content-desc'),
    ].some((value) => value?.includes('(Dieses Gerät)') === true));
  return currentDeviceNodes.length === 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Alle Geräte abmelden').length > 0;
}

async function waitForPasswordInteractionOwnerReady({
  commandRunner,
  adbPath,
  device,
  wait,
}) {
  let lastClassification = 'unclassified';
  for (let attempt = 0; attempt < 24; attempt += 1) {
    wakePasswordChangeScreen(commandRunner, adbPath, device);
    await wait(500);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (isPasswordInteractionOwnerReadySurface(hierarchy)) break;
    lastClassification = classifyPasswordChangeSurface(hierarchy);
    if (currentHeadAndroidNamedNodes(hierarchy, 'Erneut laden').length > 0) {
      fail('The sanitized account-security session inventory reported a load failure.');
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '700', '450',
    ]);
    if (attempt === 23) {
      fail('The sanitized account-security interaction owner did not become ready; '
        + `last classification: ${lastClassification}.`);
    }
  }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (['Aktuelles Passwort', 'Neues Passwort', 'Neues Passwort bestätigen']
      .every((entry) => editableNodesForLabel(hierarchy, entry).length > 0)) {
      return hierarchy;
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '700', '720', '2450', '450',
    ]);
    await wait(400);
  }
  fail('The sanitized password form did not return after owner readiness was confirmed.');
}

async function findPasswordAction({ commandRunner, adbPath, device, wait, label }) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, label).length > 0) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '700', '450',
    ]);
    await wait(400);
  }
  fail(`The sanitized ${label} action is unavailable after bounded scrolling.`);
}

async function openPasswordChangeSurface({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT', { chooseLast: true });
  let hierarchy = await waitForPasswordSurface({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Abmelden').length > 0,
  });
  hierarchy = await findPasswordAction({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Kontoeinstellungen',
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Kontoeinstellungen');
  hierarchy = await waitForPasswordSurface({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'account settings',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'SICHERHEIT').length > 0,
  });
  hierarchy = await findPasswordAction({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Passwort ändern',
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Passwort ändern', { chooseLast: true });
  return waitForPasswordSurface({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'password change',
    predicate: (value) => ['Aktuelles Passwort', 'Neues Passwort', 'Neues Passwort bestätigen']
      .every((entry) => editableNodesForLabel(value, entry).length > 0),
    classify: classifyPasswordChangeSurface,
  });
}

export async function preflightPixelPasswordChange({
  journalFile,
  candidate,
  device,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  readVault = readEmailVerifiedJourneyVault,
  probe = probePasswordChangeJournal,
  openSurface = openPasswordChangeSurface,
  ensureGuest = ensureAndroidGuestSession,
  restoreSession = restoreSyntheticSession,
  restoreOwner = restoreProtectedOwner,
  verifyInstalled = verifyCurrentHeadAndroidInstalledCandidate,
} = {}) {
  const exactCandidate = validateCandidate(candidate);
  const { journal, source, account: renter } = readPasswordChangeJournal(
    journalFile,
    { readVault },
  );
  assertCandidateBinding(journal.candidate, exactCandidate);
  if (journal.status !== 'prepared-before-password-mutation' || journal.rollbackRequired) {
    fail('The password-change journal is not in its safe pre-mutation state.');
  }
  const owner = source.vault.accounts.find((entry) => entry.role === 'owner');
  if (owner === undefined || owner.role === renter.role) {
    fail('The distinct protected owner fixture is unavailable.');
  }
  wakePasswordChangeScreen(commandRunner, adbPath, device);
  const installed = verifyInstalled(commandRunner, adbPath, device, exactCandidate);
  const before = await probePasswordChangeJournalUntilKnown({
    journalFile,
    readVault,
    probe,
    wait,
  });
  if (before.state !== 'original-password-active') {
    fail('The original password is not the exact pre-mutation truth.');
  }

  let formReached = false;
  let preflightError;
  try {
    let guestReady;
    try {
      guestReady = await ensureGuest({ commandRunner, adbPath, device, wait });
    } catch {
      fail('The sanitized password-change preflight guest transition failed.');
    }
    if (guestReady !== true) {
      fail('The sanitized password-change preflight guest transition was not confirmed.');
    }
    let renterRestored;
    try {
      renterRestored = await restoreSession({
          commandRunner,
          adbPath,
          device,
          wait,
          account: renter,
        });
    } catch {
      fail('The sanitized password-change preflight renter-session restoration failed.');
    }
    if (renterRestored !== true) {
      fail('The sanitized password-change preflight renter session was not confirmed.');
    }
    let hierarchy;
    try {
      hierarchy = await openSurface({ commandRunner, adbPath, device, wait });
    } catch (error) {
      const sanitized = sanitizePasswordChangeFailure(error);
      fail(sanitized === 'The sanitized current-candidate password diagnostic failed.'
        ? 'The sanitized password-change preflight form navigation failed.'
        : sanitized);
    }
    for (const label of ['Aktuelles Passwort', 'Neues Passwort', 'Neues Passwort bestätigen']) {
      const field = editableNodeForLabel(hierarchy, label);
      if ((currentHeadAndroidNodeAttribute(field, 'text') ?? '').length !== 0) {
        fail('The password-change preflight found a nonempty private input.');
      }
    }
    formReached = true;
  } catch (error) {
    preflightError = error;
  }

  let ownerRestored = false;
  try {
    ownerRestored = await restoreOwner({
      commandRunner,
      adbPath,
      device,
      wait,
      owner,
      renter,
    }) === true;
  } catch {
    ownerRestored = false;
  }
  if (!ownerRestored) {
    fail('The password-change preflight could not restore the protected owner session.');
  }
  if (preflightError !== undefined) throw preflightError;
  if (!formReached) fail('The password-change preflight did not prove the empty form.');
  return Object.freeze({
    status: 'passed-current-candidate-password-change-preflight',
    candidateCommit: exactCandidate.commit,
    candidateBuildNumber: exactCandidate.buildNumber,
    installedVersionName: installed.versionName,
    installedBuildNumber: installed.buildNumber,
    originalPasswordActive: true,
    acceptedSessionRevoked: true,
    emptyPasswordFormReached: true,
    protectedOwnerSessionRestored: true,
    passwordMutationAttempted: false,
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
    containsRawDeviceIdentifier: false,
  });
}

async function performPixelPasswordChangeUi({
  commandRunner,
  adbPath,
  device,
  wait,
  account,
  replacementPassword: replacement,
}) {
  let guestReady;
  try {
    guestReady = await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
  } catch {
    fail('The sanitized password-change guest transition failed.');
  }
  if (guestReady !== true) {
    fail('The sanitized password-change guest transition was not confirmed.');
  }
  let renterRestored;
  try {
    renterRestored = await restoreSyntheticSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account,
      });
  } catch {
    fail('The sanitized password-change renter-session restoration failed.');
  }
  if (renterRestored !== true) {
    fail('The sanitized password-change renter session was not confirmed.');
  }
  try {
    await openPasswordChangeSurface({ commandRunner, adbPath, device, wait });
  } catch {
    fail('The sanitized password-change form navigation failed.');
  }
  let hierarchy;
  try {
    hierarchy = await waitForPasswordInteractionOwnerReady({
      commandRunner,
      adbPath,
      device,
      wait,
    });
  } catch (error) {
    throw new Error(sanitizePasswordChangeFailure(error));
  }
  replaceSecretInput(commandRunner, adbPath, device, hierarchy, 'Aktuelles Passwort', account.password);
  hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  replaceSecretInput(commandRunner, adbPath, device, hierarchy, 'Neues Passwort', replacement);
  hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  replaceSecretInput(
    commandRunner,
    adbPath,
    device,
    hierarchy,
    'Neues Passwort bestätigen',
    replacement,
  );
  hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Passwort ändern', { chooseLast: true });
  hierarchy = await waitForPasswordSurface({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 120,
    label: 'password result',
    predicate: (value) => ['Passwort geändert', 'Passwort nicht geändert',
      'Passwort serverseitig geändert', 'Ergebnis der Passwortänderung unklar']
      .some((entry) => currentHeadAndroidNamedNodes(value, entry).length > 0),
    classify: classifyPasswordChangeSurface,
  });
  const succeeded = currentHeadAndroidNamedNodes(hierarchy, 'Passwort geändert').length > 0;
  if (!succeeded) fail('The Pixel did not present the definite password-changed result.');
  if (passwordSuccessResultRequiresExplicitDismissal(hierarchy)) {
    tapNamedNode(commandRunner, adbPath, device, hierarchy, 'OK');
  }
  await waitForPasswordSurface({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'post-password-change login',
    predicate: isPasswordChangeLoginSurface,
  });
  return { definiteSuccessPresented: true, localSessionCleared: true };
}

export async function executePixelPasswordChange({
  journalFile,
  candidate,
  device,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  readVault = readEmailVerifiedJourneyVault,
  probe = probePasswordChangeJournal,
  performUi = performPixelPasswordChangeUi,
  rollback = restoreOriginalPassword,
  restoreOwner = restoreProtectedOwner,
  verifyInstalled = verifyCurrentHeadAndroidInstalledCandidate,
  occurredAt = new Date(),
  random = randomBytes,
} = {}) {
  const exactCandidate = validateCandidate(candidate);
  const { journal: boundJournal, source, account: renter } = readPasswordChangeJournal(
    journalFile,
    { readVault },
  );
  assertCandidateBinding(boundJournal.candidate, exactCandidate);
  const owner = source.vault.accounts.find((entry) => entry.role === 'owner');
  if (owner === undefined || owner.role === renter.role) {
    fail('The distinct protected owner fixture is unavailable.');
  }
  wakePasswordChangeScreen(commandRunner, adbPath, device);
  const installed = verifyInstalled(
    commandRunner,
    adbPath,
    device,
    exactCandidate,
  );
  const before = await probe({ journalFile, readVault });
  if (before.state !== 'original-password-active') {
    fail('The original password is not the exact pre-mutation truth.');
  }
  transitionPasswordChangeJournal({
    journalFile,
    expectedStatus: 'prepared-before-password-mutation',
    nextStatus: 'armed-before-password-mutation',
    observedCredentialState: before.state,
    occurredAt,
    random,
    readVault,
  });
  try {
    const { journal, account } = readPasswordChangeJournal(journalFile, { readVault });
    const ui = await performUi({
      commandRunner,
      adbPath,
      device,
      wait,
      account,
      replacementPassword: journal.replacementPassword,
    });
    const after = await probePasswordChangeJournalUntilKnown({
      journalFile,
      readVault,
      probe,
      wait,
    });
    if (after.state !== 'replacement-password-active') {
      fail('The replacement password was not independently confirmed.');
    }
    const journalResult = transitionPasswordChangeJournal({
      journalFile,
      expectedStatus: 'armed-before-password-mutation',
      nextStatus: 'replacement-password-confirmed',
      observedCredentialState: after.state,
      occurredAt,
      random,
      readVault,
    });
    return Object.freeze({
      ...journalResult,
      installedVersionName: installed.versionName,
      installedBuildNumber: installed.buildNumber,
      definiteSuccessPresented: ui.definiteSuccessPresented === true,
      localSessionCleared: ui.localSessionCleared === true,
      exactOldCredentialRejected: true,
      exactReplacementCredentialAccepted: true,
      acceptedSessionRevoked: true,
    });
  } catch (error) {
    let rollbackError = null;
    try {
      await rollback({ journalFile, readVault, wait });
    } catch (currentRollbackError) {
      rollbackError = currentRollbackError;
    }
    let ownerRestored = false;
    try {
      ownerRestored = await restoreOwner({
        commandRunner,
        adbPath,
        device,
        wait,
        owner,
        renter,
      }) === true;
    } catch {
      ownerRestored = false;
    }
    if (!ownerRestored) {
      fail('Password-change execution rolled back, but the protected owner session is not restored.');
    }
    if (rollbackError !== null) {
      fail('Password-change execution failed and the durable rollback remains required; the protected owner session was restored.');
    }
    throw error;
  }
}

async function openExactProfile({
  commandRunner,
  adbPath,
  device,
  wait,
  expectedDisplayName,
  forbiddenDisplayName,
  coldStart = false,
}) {
  if (coldStart) {
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'am', 'force-stop', applicationId,
    ]);
  }
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT', { chooseLast: true });
  const profile = await waitForPasswordSurface({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'exact authenticated profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Abmelden').length > 0,
  });
  if (currentHeadAndroidNamedNodes(profile, expectedDisplayName).length !== 1
      || currentHeadAndroidNamedNodes(profile, 'Gast').length !== 0
      || (forbiddenDisplayName
        && currentHeadAndroidNamedNodes(profile, forbiddenDisplayName).length !== 0)) {
    fail('The Pixel profile did not bind to the exact expected password-change principal.');
  }
  return true;
}

async function performReplacementColdAndOwnerSwitch({
  commandRunner,
  adbPath,
  device,
  wait,
  renter,
  owner,
  replacementPassword: replacement,
}) {
  const replacementAccount = { ...renter, password: replacement };
  if (await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait }) !== true
      || await restoreSyntheticSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account: replacementAccount,
      }) !== true) {
    fail('The replacement password could not establish the Pixel renter session.');
  }
  await openExactProfile({
    commandRunner,
    adbPath,
    device,
    wait,
    expectedDisplayName: renter.displayName,
    forbiddenDisplayName: owner.displayName,
  });
  await openExactProfile({
    commandRunner,
    adbPath,
    device,
    wait,
    expectedDisplayName: renter.displayName,
    forbiddenDisplayName: owner.displayName,
    coldStart: true,
  });
  if (await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait }) !== true
      || await restoreSyntheticSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account: owner,
      }) !== true) {
    fail('The protected owner could not replace the renter session on the Pixel.');
  }
  await openExactProfile({
    commandRunner,
    adbPath,
    device,
    wait,
    expectedDisplayName: owner.displayName,
    forbiddenDisplayName: renter.displayName,
  });
  return {
    replacementLoginPassed: true,
    coldStartPassed: true,
    accountAToBIsolationPassed: true,
  };
}

async function restoreProtectedOwner({
  commandRunner,
  adbPath,
  device,
  wait,
  owner,
  renter,
}) {
  if (await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait }) !== true
      || await restoreSyntheticSession({
        commandRunner,
        adbPath,
        device,
        wait,
        account: owner,
      }) !== true) {
    fail('The protected owner session could not be restored after password cleanup.');
  }
  return openExactProfile({
    commandRunner,
    adbPath,
    device,
    wait,
    expectedDisplayName: owner.displayName,
    forbiddenDisplayName: renter.displayName,
  });
}

export async function completePixelPasswordChange({
  journalFile,
  candidate,
  device,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  readVault = readEmailVerifiedJourneyVault,
  performVerification = performReplacementColdAndOwnerSwitch,
  rollback = restoreOriginalPassword,
  restoreOwner = restoreProtectedOwner,
  verifyInstalled = verifyCurrentHeadAndroidInstalledCandidate,
} = {}) {
  const exactCandidate = validateCandidate(candidate);
  const { journal, source, account: renter } = readPasswordChangeJournal(
    journalFile,
    { readVault },
  );
  assertCandidateBinding(journal.candidate, exactCandidate);
  wakePasswordChangeScreen(commandRunner, adbPath, device);
  const installed = verifyInstalled(commandRunner, adbPath, device, exactCandidate);
  if (journal.status !== 'replacement-password-confirmed' || !journal.rollbackRequired) {
    fail('The replacement password is not ready for current-candidate completion.');
  }
  const owner = source.vault.accounts.find((entry) => entry.role === 'owner');
  if (owner === undefined || owner.role === renter.role) {
    fail('The distinct protected owner fixture is unavailable.');
  }
  let verification;
  let verificationError;
  try {
    verification = await performVerification({
      commandRunner,
      adbPath,
      device,
      wait,
      renter,
      owner,
      replacementPassword: journal.replacementPassword,
    });
  } catch (error) {
    verificationError = error;
  }
  let rollbackResult;
  try {
    rollbackResult = await rollback({ journalFile, readVault });
  } catch {
    fail('The Pixel verification ended while the durable password rollback remains required.');
  }
  let ownerRestored = false;
  try {
    ownerRestored = await restoreOwner({
      commandRunner,
      adbPath,
      device,
      wait,
      owner,
      renter,
    }) === true;
  } catch {
    ownerRestored = false;
  }
  if (verificationError !== undefined) throw verificationError;
  if (!ownerRestored) fail('The original password is restored, but the protected owner UI session is not.');
  if (verification?.replacementLoginPassed !== true
      || verification?.coldStartPassed !== true
      || verification?.accountAToBIsolationPassed !== true
      || rollbackResult?.originalPasswordRestored !== true) {
    fail('The current-candidate password completion proof is incomplete.');
  }
  return Object.freeze({
    status: 'passed-current-candidate-password-change-cold-isolation-and-cleanup',
    candidateCommit: exactCandidate.commit,
    candidateBuildNumber: exactCandidate.buildNumber,
    installedVersionName: installed.versionName,
    installedBuildNumber: installed.buildNumber,
    directPasswordChange: true,
    definiteSuccessPresented: true,
    oldCredentialRejected: true,
    replacementLoginPassed: true,
    coldStartPassed: true,
    accountAToBIsolationPassed: true,
    originalPasswordRestored: true,
    protectedOwnerSessionRestored: true,
    acceptedSessionsRevoked: true,
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
    containsRawDeviceIdentifier: false,
  });
}

export function sanitizePasswordChangeFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.length > 0
      && message.length <= 220
      && !/@|\+\d|\b\d{6,}\b|[A-Za-z0-9_-]{32,}/u.test(message)
      && /^(The |A |Password(?: |-)|Pixel |Staging |Android |Current-|Original |Replacement )/u.test(message)) {
    return message;
  }
  return 'The sanitized current-candidate password diagnostic failed.';
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? fail('The password-change phase is required.');
  const journalFile = resolve(
    argumentValue(args, '--journal-file') ?? fail('The password-change journal file is required.'),
  );
  if (phase === 'probe') {
    process.stdout.write(`${JSON.stringify(await probePasswordChangeJournal({ journalFile }), null, 2)}\n`);
    return;
  }
  if (phase === 'rollback') {
    process.stdout.write(`${JSON.stringify(await restoreOriginalPassword({ journalFile }), null, 2)}\n`);
    return;
  }
  if (!['prepare', 'preflight', 'execute', 'complete'].includes(phase)) {
    fail('The password-change phase is invalid.');
  }
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('The candidate directory is required.'),
  );
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  if (phase === 'prepare') {
    const sourceVaultFile = resolve(
      argumentValue(args, '--source-vault-file')
        ?? fail('The source account vault is required.'),
    );
    const result = preparePasswordChangeJournal({
      sourceVaultFile,
      journalFile,
      candidate,
      accountRole: argumentValue(args, '--account-role') ?? 'renter',
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner('adb', ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: 'adb', device });
  const result = phase === 'preflight'
    ? await preflightPixelPasswordChange({ journalFile, candidate, device })
    : phase === 'execute'
      ? await executePixelPasswordChange({ journalFile, candidate, device })
      : await completePixelPasswordChange({ journalFile, candidate, device });
  process.stdout.write(`${JSON.stringify({
    ...result,
    device: deviceSummary,
    boundaries: {
      stagingOnly: true,
      syntheticAccountOnly: true,
      productionChanged: false,
      googlePlayChanged: false,
      firebaseChanged: false,
      paymentCalled: false,
      realMoneyUsed: false,
      onePlusContacted: false,
      credentialsPrinted: false,
      rawDeviceIdentifierPrinted: false,
    },
  }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${sanitizePasswordChangeFailure(error)}\n`);
    process.exitCode = 1;
  }
}
