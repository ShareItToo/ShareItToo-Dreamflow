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
  dismissAndroidSoftwareKeyboard,
  ensureAndroidGuestSession,
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
  readEmailVerifiedJourneyVault,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const applicationId = 'com.shareittoo.app';
const linuxUserAgent = 'SIT-WP41 Linux session-control diagnostic';

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

function ensurePrivateDirectory(path) {
  const absolute = outsideRepository(path, 'The session-control journal directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  const metadata = statSync(absolute);
  if (!metadata.isDirectory() || (metadata.mode & 0o077) !== 0) {
    fail('The session-control journal directory is not owner-only.');
  }
  return realpathSync(absolute);
}

function durablePrivateJson(path, value, { random = randomBytes } = {}) {
  const absolute = outsideRepository(path, 'The session-control journal');
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
  let descriptor;
  try {
    const canonical = realpathSync(path);
    outsideRepository(canonical, label);
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size === 0 || (metadata.mode & 0o077) !== 0) {
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

function sourceVaultMac(value, integrityKey) {
  return createHmac('sha256', Buffer.from(integrityKey, 'base64url'))
    .update(value)
    .digest('hex');
}

function sameDigest(left, right) {
  if (!/^[0-9a-f]{64}$/u.test(left) || !/^[0-9a-f]{64}$/u.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function validateCandidate(candidate) {
  if (candidate?.applicationId !== applicationId
      || candidate?.apiBaseUrl !== stagingApiBaseUrl
      || candidate?.versionName !== '1.0.0'
      || !/^\d{10}$/u.test(String(candidate?.buildNumber ?? ''))
      || !/^[0-9a-f]{40}$/u.test(candidate?.commit ?? '')
      || !/^[0-9a-f]{64}$/u.test(candidate?.apkSha256 ?? '')
      || !/^[0-9a-f]{64}$/u.test(candidate?.signingCertificateSha256 ?? '')) {
    fail('The session-control candidate binding is invalid.');
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
    fail('The installed candidate does not match the durable session-control binding.');
  }
}

function publicJournal(journal) {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-current-candidate-session-controls-journal',
    status: journal.status,
    candidateCommit: journal.candidate.commit,
    candidateBuildNumber: journal.candidate.buildNumber,
    accountRole: journal.accountRole,
    recoveryRequired: journal.recoveryRequired,
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
    containsSessionId: false,
    containsPrivateFilesystemPath: false,
  });
}

export function prepareSessionControlsJournal({
  sourceVaultFile,
  journalFile,
  candidate,
  accountRole = 'renter',
  now = new Date(),
  random = randomBytes,
  readVault = readEmailVerifiedJourneyVault,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof random !== 'function') {
    fail('The session-control journal dependencies are invalid.');
  }
  const exactCandidate = validateCandidate(candidate);
  const source = readVault(sourceVaultFile);
  const account = source?.vault?.accounts?.find((entry) => entry.role === accountRole);
  const owner = source?.vault?.accounts?.find((entry) => entry.role === 'owner');
  if (source?.vault?.apiBaseUrl !== stagingApiBaseUrl
      || source?.vault?.stripeLivemode !== false
      || account === undefined
      || owner === undefined
      || account.role === owner.role) {
    fail('The exact isolated Staging account pair is unavailable.');
  }
  const sourceBytes = readFileSync(source.canonical, 'utf8');
  const integrityKey = random(32).toString('base64url');
  const journal = {
    schemaVersion: 1,
    kind: 'android-current-candidate-session-controls-journal',
    status: 'prepared-before-session-mutation',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    candidate: structuredClone(exactCandidate),
    accountRole,
    sourceVaultFile: source.canonical,
    sourceVaultIntegrityKey: integrityKey,
    sourceVaultMac: sourceVaultMac(sourceBytes, integrityKey),
    recoveryRequired: false,
    events: [{
      event: 'isolated-session-recovery-durably-prepared',
      occurredAt: now.toISOString(),
    }],
  };
  durablePrivateJson(journalFile, journal, { random });
  return publicJournal(journal);
}

function readSessionControlsJournal(journalFile, { readVault = readEmailVerifiedJourneyVault } = {}) {
  const { canonical, value: journal } = readPrivateJson(
    journalFile,
    'The session-control journal',
  );
  if (journal?.schemaVersion !== 1
      || journal?.kind !== 'android-current-candidate-session-controls-journal'
      || !Array.isArray(journal.events)
      || !['prepared-before-session-mutation', 'executing-session-controls',
        'completed-session-controls', 'recovered-after-failure'].includes(journal.status)
      || typeof journal.recoveryRequired !== 'boolean'
      || !/^[A-Za-z0-9_-]{43}$/u.test(journal.sourceVaultIntegrityKey ?? '')
      || !/^[0-9a-f]{64}$/u.test(journal.sourceVaultMac ?? '')) {
    fail('The session-control journal is invalid.');
  }
  validateCandidate(journal.candidate);
  const source = readVault(journal.sourceVaultFile);
  const sourceBytes = readFileSync(source.canonical, 'utf8');
  const mac = sourceVaultMac(sourceBytes, journal.sourceVaultIntegrityKey);
  if (!sameDigest(mac, journal.sourceVaultMac)) {
    fail('The protected account source changed after session-control preparation.');
  }
  const account = source.vault.accounts.find((entry) => entry.role === journal.accountRole);
  const owner = source.vault.accounts.find((entry) => entry.role === 'owner');
  if (source.vault.apiBaseUrl !== stagingApiBaseUrl
      || source.vault.stripeLivemode !== false
      || account === undefined
      || owner === undefined
      || account.role === owner.role) {
    fail('The bound isolated Staging account pair is unavailable.');
  }
  return { canonical, journal, source, account, owner };
}

function transitionJournal({
  journalFile,
  expectedStatus,
  nextStatus,
  event,
  recoveryRequired,
  occurredAt = new Date(),
  random = randomBytes,
  readVault = readEmailVerifiedJourneyVault,
}) {
  const { journal } = readSessionControlsJournal(journalFile, { readVault });
  if (journal.status !== expectedStatus) fail('The session-control journal state is stale.');
  const next = {
    ...journal,
    status: nextStatus,
    updatedAt: occurredAt.toISOString(),
    recoveryRequired,
    events: [...journal.events, { event, occurredAt: occurredAt.toISOString() }],
  };
  durablePrivateJson(journalFile, next, { random });
  return publicJournal(next);
}

async function apiRequest(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
  expected = [200],
  userAgent = linuxUserAgent,
} = {}) {
  if (typeof fetchImpl !== 'function'
      || typeof path !== 'string'
      || !path.startsWith('/')
      || path.includes('://')) {
    fail('A bounded Staging session-control request is invalid.');
  }
  let response;
  try {
    response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'User-Agent': userAgent,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    fail('The bounded Staging session-control request had an unknown transport outcome.');
  }
  const raw = await response.text();
  let value = null;
  if (raw.trim() !== '') {
    try {
      value = JSON.parse(raw);
    } catch {
      fail('The bounded Staging session-control response was unstructured.');
    }
  }
  if (!expected.includes(response.status)) {
    return { status: response.status, value };
  }
  return { status: response.status, value };
}

async function loginSession(fetchImpl, account) {
  const result = await apiRequest(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
    expected: [200],
  });
  const session = result.value;
  if (result.status !== 200
      || typeof session?.accessToken !== 'string'
      || typeof session?.refreshToken !== 'string'
      || !/^[0-9a-f-]{36}$/u.test(session?.sessionId ?? '')
      || session?.user?.email?.toLowerCase() !== account.email.toLowerCase()) {
    fail('The isolated Staging session was not established for the exact principal.');
  }
  return session;
}

async function readSessions(fetchImpl, session) {
  const result = await apiRequest(fetchImpl, '/auth/sessions', {
    token: session.accessToken,
    expected: [200],
  });
  if (result.status !== 200 || !Array.isArray(result.value?.sessions)) {
    fail('The Staging session inventory was not server-confirmed.');
  }
  return result.value.sessions;
}

export function classifyTwoSessionInventory(sessions, expectedCurrentSessionId) {
  if (!Array.isArray(sessions) || sessions.length !== 2
      || !/^[0-9a-f-]{36}$/u.test(expectedCurrentSessionId ?? '')) {
    return 'session-inventory-ambiguous';
  }
  const ids = sessions.map((entry) => entry?.id);
  if (ids.some((id) => !/^[0-9a-f-]{36}$/u.test(id ?? ''))
      || new Set(ids).size !== 2) {
    return 'session-inventory-ambiguous';
  }
  const current = sessions.filter((entry) => entry.isThisDevice === true);
  const remote = sessions.filter((entry) => entry.isThisDevice === false);
  if (current.length !== 1
      || remote.length !== 1
      || current[0].id !== expectedCurrentSessionId
      || current[0].name !== 'Linux'
      || remote[0].name !== 'Android') {
    return 'session-inventory-ambiguous';
  }
  return 'exact-linux-current-and-android-remote';
}

export function summarizeTwoSessionInventory(sessions, expectedCurrentSessionId) {
  const values = Array.isArray(sessions) ? sessions : [];
  const current = values.filter((entry) => entry?.isThisDevice === true);
  const remote = values.filter((entry) => entry?.isThisDevice === false);
  return [
    `total=${values.length}`,
    `current=${current.length}`,
    `remote=${remote.length}`,
    `linux=${values.filter((entry) => entry?.name === 'Linux').length}`,
    `android=${values.filter((entry) => entry?.name === 'Android').length}`,
    `other=${values.filter((entry) => !['Linux', 'Android'].includes(entry?.name)).length}`,
    `currentMatch=${current.some((entry) => entry?.id === expectedCurrentSessionId)}`,
  ].join(',');
}

export async function waitForExactTwoSessionInventory({
  fetchImpl,
  session,
  wait,
  attempts = 12,
  intervalMs = 250,
  readInventory = readSessions,
  onObserved = () => {},
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sessions = await readInventory(fetchImpl, session);
    onObserved(sessions);
    if (classifyTwoSessionInventory(sessions, session.sessionId)
        === 'exact-linux-current-and-android-remote') {
      return true;
    }
    if (attempt + 1 < attempts) await wait(intervalMs);
  }
  return false;
}

export function classifyRevokedSessionProbe(result) {
  if (result?.status === 401 && result?.value?.error === 'account_not_active') {
    return 'session-definitely-revoked';
  }
  if (result?.status === 200 && Array.isArray(result?.value?.sessions)) {
    return 'session-definitely-active';
  }
  return 'session-state-unknown';
}

async function assertSessionRevoked(fetchImpl, session) {
  const result = await apiRequest(fetchImpl, '/auth/sessions', {
    token: session.accessToken,
    expected: [200, 401],
  });
  if (classifyRevokedSessionProbe(result) !== 'session-definitely-revoked') {
    fail('The targeted Staging session was not definitely revoked.');
  }
  return true;
}

async function logoutSession(fetchImpl, session) {
  const result = await apiRequest(fetchImpl, '/auth/logout', {
    method: 'POST',
    body: { refreshToken: session.refreshToken },
    expected: [204],
  });
  if (result.status !== 204) fail('The isolated verification session was not revoked.');
  return assertSessionRevoked(fetchImpl, session);
}

async function revokeEveryIsolatedAccountSession(fetchImpl, account) {
  const session = await loginSession(fetchImpl, account);
  const result = await apiRequest(fetchImpl, '/auth/logout-all', {
    method: 'POST',
    token: session.accessToken,
    expected: [204],
  });
  if (result.status !== 204) fail('The isolated Staging account cleanup was not confirmed.');
  await assertSessionRevoked(fetchImpl, session);
  return true;
}

function nodeBounds(node) {
  const value = currentHeadAndroidNodeAttribute(node, 'bounds');
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(value ?? '');
  if (match === null) return null;
  const [, left, top, right, bottom] = match.map(Number);
  return { left, top, right, bottom, x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
}

function enabledNodes(hierarchy, label) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true');
  return clickable.length > 0 ? clickable : enabled;
}

function selectNamedNode(hierarchy, label, { chooseLast = false } = {}) {
  const nodes = enabledNodes(hierarchy, label);
  if (nodes.length === 0) fail(`The sanitized ${label} action is unavailable.`);
  return chooseLast ? nodes.at(-1) : nodes[0];
}

export function selectRemoteSessionSignOutNode(hierarchy, remoteLabel = 'Linux') {
  const labels = currentHeadAndroidNamedNodes(hierarchy, remoteLabel)
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter((entry) => entry.bounds !== null);
  const actions = enabledNodes(hierarchy, 'Abmelden')
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter((entry) => entry.bounds !== null);
  if (labels.length !== 1 || actions.length === 0) {
    fail('The exact remote-session action is unavailable.');
  }
  const matches = actions
    .map((action) => ({
      ...action,
      distance: Math.abs(action.bounds.y - labels[0].bounds.y),
    }))
    .filter((action) => action.distance <= 180)
    .sort((left, right) => left.distance - right.distance);
  if (matches.length !== 1) fail('The exact remote-session action is ambiguous.');
  return matches[0].node;
}

export function isRemoteSessionConfirmation(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Gerät abmelden?').length >= 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Abbrechen').length >= 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Abmelden').length >= 1;
}

export function isLogoutAllConfirmation(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Alle Geräte abmelden?').length >= 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Alle abmelden').length >= 1;
}

function tapNode(commandRunner, adbPath, device, node, label) {
  const bounds = nodeBounds(node);
  if (bounds === null) fail(`The sanitized ${label} control has invalid bounds.`);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(bounds.x), String(bounds.y),
  ]);
}

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, options = {}) {
  tapNode(commandRunner, adbPath, device, selectNamedNode(hierarchy, label, options), label);
}

async function waitForHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  label,
  attempts = 32,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(600);
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

function hasMainNavigation(hierarchy) {
  return ['Entdecken', 'Mietkorb', 'Buchungen', 'Nachrichten', 'Mein SIT']
    .every((label) => currentHeadAndroidNamedNodes(hierarchy, label).length >= 1);
}

function hasGuestLogin(hierarchy) {
  return currentHeadAndroidNamedNodes(hierarchy, 'Anmelden').length >= 1
    && currentHeadAndroidNamedNodes(hierarchy, 'Erst mal umschauen').length >= 1;
}

async function ensureGuestRoot({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'main-navigation-or-login',
    predicate: (value) => hasMainNavigation(value) || hasGuestLogin(value),
  });
  if (hasGuestLogin(hierarchy)) {
    tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Erst mal umschauen');
    await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  }
  return ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
}

async function restoreExactAccount({ commandRunner, adbPath, device, wait, account }) {
  if (await ensureGuestRoot({ commandRunner, adbPath, device, wait }) !== true) {
    fail('The Pixel guest state was not confirmed.');
  }
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT', { chooseLast: true });
  let hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'guest-profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Anmelden').length >= 1
      && currentHeadAndroidNamedNodes(value, 'Konto erstellen').length >= 1,
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Anmelden');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'login-form',
    predicate: (value) => editableNodeForHint(value, 'E-Mail') !== null
      && editableNodeForHint(value, 'Passwort') !== null,
  });
  replaceLoginInput(commandRunner, adbPath, device, hierarchy, 'E-Mail', account.email);
  hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  replaceLoginInput(commandRunner, adbPath, device, hierarchy, 'Passwort', account.password);
  if (!await dismissAndroidSoftwareKeyboard({
    commandRunner,
    adbPath,
    device,
    wait,
  })) {
    fail('The sanitized session-control keyboard did not close before login.');
  }
  hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Anmelden', { chooseLast: true });
  await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  if (await openExactProfile({
    commandRunner,
    adbPath,
    device,
    wait,
    expectedDisplayName: account.displayName,
    forbiddenDisplayName: null,
  }) !== true) {
    fail('The exact Pixel account session was not restored.');
  }
  return true;
}

function editableNodeForHint(hierarchy, hint) {
  const matches = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'hint') === hint);
  if (matches.length > 1) fail(`The sanitized ${hint} input is ambiguous.`);
  return matches[0] ?? null;
}

function replaceLoginInput(commandRunner, adbPath, device, hierarchy, hint, value) {
  if (!/^[A-Za-z0-9._+@-]{10,256}$/u.test(value)) {
    fail(`The private ${hint} fixture is not safe for bounded Android input.`);
  }
  const field = editableNodeForHint(hierarchy, hint);
  if (field === null) fail(`The sanitized ${hint} input is unavailable.`);
  tapNode(commandRunner, adbPath, device, field, hint);
  const previous = currentHeadAndroidNodeAttribute(field, 'text') ?? '';
  if (previous.length > 0) {
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'keyevent', '123',
    ]);
    const deletes = Array.from({ length: previous.length }, () => '67');
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'keyevent', ...deletes,
    ]);
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', value,
  ]);
  if (hint === 'E-Mail') {
    const updated = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const exact = editableNodeForHint(updated, hint);
    if (currentHeadAndroidNodeAttribute(exact, 'text') !== value) {
      fail('The exact login principal was not entered on the Pixel.');
    }
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
  const main = await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT', { chooseLast: true });
  const profile = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'exact-authenticated-profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Abmelden').length >= 1,
  });
  if (currentHeadAndroidNamedNodes(profile, expectedDisplayName).length !== 1
      || currentHeadAndroidNamedNodes(profile, 'Gast').length !== 0
      || (forbiddenDisplayName
        && currentHeadAndroidNamedNodes(profile, forbiddenDisplayName).length !== 0)) {
    fail('The Pixel profile is not bound to the exact expected principal.');
  }
  return true;
}

async function findActionByScrolling({
  commandRunner,
  adbPath,
  device,
  wait,
  label,
  attempts = 12,
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, label).length > 0) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '650', '450',
    ]);
    await wait(400);
  }
  fail(`The sanitized ${label} action is unavailable after bounded scrolling.`);
}

async function openSessionControls({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT', { chooseLast: true });
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated-profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Abmelden').length >= 1,
  });
  let hierarchy = await findActionByScrolling({
    commandRunner, adbPath, device, wait, label: 'Kontoeinstellungen',
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Kontoeinstellungen');
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'account-settings',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'SICHERHEIT').length >= 1,
  });
  hierarchy = await findActionByScrolling({
    commandRunner, adbPath, device, wait, label: 'Passwort ändern',
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Passwort ändern');
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'security-settings',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Angemeldete Geräte').length >= 1,
  });
  for (let attempt = 0; attempt < 16; attempt += 1) {
    hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, 'Erneut laden').length > 0) {
      fail('The server-confirmed session inventory reported a load failure.');
    }
    if (currentHeadAndroidNamedNodes(hierarchy, 'Android').length === 1
        && currentHeadAndroidNamedNodes(hierarchy, 'Linux').length === 1
        && currentHeadAndroidNamedNodes(hierarchy, 'Alle Geräte abmelden').length === 1) {
      return hierarchy;
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '650', '450',
    ]);
    await wait(450);
  }
  fail('The exact Android and Linux session controls did not become visible.');
}

async function revokeRemoteSessionThroughPixel({ commandRunner, adbPath, device, wait }) {
  let hierarchy = await openSessionControls({ commandRunner, adbPath, device, wait });
  tapNode(
    commandRunner,
    adbPath,
    device,
    selectRemoteSessionSignOutNode(hierarchy),
    'remote-session-sign-out',
  );
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'remote-session-confirmation',
    predicate: isRemoteSessionConfirmation,
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Abmelden', { chooseLast: true });
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 40,
    label: 'remote-session-revoked',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Linux').length === 0
      && currentHeadAndroidNamedNodes(value, 'Android').length === 1
      && currentHeadAndroidNamedNodes(value, 'Alle Geräte abmelden').length === 1,
  });
  return true;
}

async function logoutAllThroughPixel({ commandRunner, adbPath, device, wait }) {
  let hierarchy = await openSessionControls({ commandRunner, adbPath, device, wait });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Alle Geräte abmelden');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'logout-all-confirmation',
    predicate: isLogoutAllConfirmation,
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Alle abmelden');
  await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    attempts: 48,
    label: 'post-logout-all-login',
    predicate: hasGuestLogin,
  });
  return true;
}

async function recoverIsolatedAndOwner({
  fetchImpl,
  commandRunner,
  adbPath,
  device,
  wait,
  account,
  owner,
}) {
  await revokeEveryIsolatedAccountSession(fetchImpl, account);
  await restoreExactAccount({ commandRunner, adbPath, device, wait, account: owner });
  await openExactProfile({
    commandRunner,
    adbPath,
    device,
    wait,
    expectedDisplayName: owner.displayName,
    forbiddenDisplayName: account.displayName,
    coldStart: true,
  });
  return true;
}

export async function executePixelSessionControls({
  journalFile,
  candidate,
  device,
  fetchImpl = fetch,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  readVault = readEmailVerifiedJourneyVault,
  verifyInstalled = verifyCurrentHeadAndroidInstalledCandidate,
  occurredAt = new Date(),
  random = randomBytes,
} = {}) {
  const exactCandidate = validateCandidate(candidate);
  const { journal, account, owner } = readSessionControlsJournal(journalFile, { readVault });
  assertCandidateBinding(journal.candidate, exactCandidate);
  if (journal.status !== 'prepared-before-session-mutation' || journal.recoveryRequired) {
    fail('The session-control journal is not in its safe pre-mutation state.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalled(commandRunner, adbPath, device, exactCandidate);
  transitionJournal({
    journalFile,
    expectedStatus: 'prepared-before-session-mutation',
    nextStatus: 'executing-session-controls',
    event: 'isolated-session-cleanup-armed-before-first-remote-session',
    recoveryRequired: true,
    occurredAt,
    random,
    readVault,
  });

  try {
    await restoreExactAccount({ commandRunner, adbPath, device, wait, account });
    const remote = await loginSession(fetchImpl, account);
    let initialSessions = [];
    if (!await waitForExactTwoSessionInventory({
      fetchImpl,
      session: remote,
      wait,
      onObserved: (sessions) => {
        initialSessions = sessions;
      },
    })) {
      fail(`The initial two-session Staging inventory is ambiguous (`
        + `${summarizeTwoSessionInventory(initialSessions, remote.sessionId)}).`);
    }
    await revokeRemoteSessionThroughPixel({ commandRunner, adbPath, device, wait });
    await assertSessionRevoked(fetchImpl, remote);

    const verifier = await loginSession(fetchImpl, account);
    let postRevocationSessions = [];
    if (!await waitForExactTwoSessionInventory({
      fetchImpl,
      session: verifier,
      wait,
      onObserved: (sessions) => {
        postRevocationSessions = sessions;
      },
    })) {
      fail(`The post-revocation Staging inventory did not preserve only the Pixel session (`
        + `${summarizeTwoSessionInventory(postRevocationSessions, verifier.sessionId)}).`);
    }
    await logoutAllThroughPixel({ commandRunner, adbPath, device, wait });
    await assertSessionRevoked(fetchImpl, verifier);

    const credentialVerification = await loginSession(fetchImpl, account);
    const verificationSessions = await readSessions(fetchImpl, credentialVerification);
    if (verificationSessions.length !== 1
        || verificationSessions[0]?.id !== credentialVerification.sessionId
        || verificationSessions[0]?.isThisDevice !== true
        || verificationSessions[0]?.name !== 'Linux') {
      fail('Logout-all did not leave an exact independently verified empty session truth.');
    }
    await logoutSession(fetchImpl, credentialVerification);

    await restoreExactAccount({ commandRunner, adbPath, device, wait, account });
    await openExactProfile({
      commandRunner,
      adbPath,
      device,
      wait,
      expectedDisplayName: account.displayName,
      forbiddenDisplayName: owner.displayName,
      coldStart: true,
    });
    await restoreExactAccount({ commandRunner, adbPath, device, wait, account: owner });
    await openExactProfile({
      commandRunner,
      adbPath,
      device,
      wait,
      expectedDisplayName: owner.displayName,
      forbiddenDisplayName: account.displayName,
      coldStart: true,
    });

    const completed = transitionJournal({
      journalFile,
      expectedStatus: 'executing-session-controls',
      nextStatus: 'completed-session-controls',
      event: 'session-controls-exactly-confirmed-and-owner-restored',
      recoveryRequired: false,
      occurredAt: new Date(),
      random,
      readVault,
    });
    return Object.freeze({
      ...completed,
      installedVersionName: installed.versionName,
      installedBuildNumber: installed.buildNumber,
      exactInitialTwoSessionInventory: true,
      remoteSessionRevokedThroughPixel: true,
      revokedRemoteTokenRejected: true,
      invokingPixelSessionPreserved: true,
      logoutAllThroughPixel: true,
      logoutAllRemoteTokenRejected: true,
      serverConfirmedEmptyBeforeIndependentRelogin: true,
      isolatedCredentialReloginPassed: true,
      isolatedColdStartPassed: true,
      accountAToBIsolationPassed: true,
      protectedOwnerSessionRestored: true,
      acceptedDiagnosticSessionsRevoked: true,
      containsEmailAddress: false,
      containsCredential: false,
      containsToken: false,
      containsSessionId: false,
      containsRawDeviceIdentifier: false,
    });
  } catch (error) {
    const primaryFailure = sanitizeSessionControlsFailure(error);
    let recovered = false;
    try {
      recovered = await recoverIsolatedAndOwner({
        fetchImpl, commandRunner, adbPath, device, wait, account, owner,
      });
    } catch {
      recovered = false;
    }
    if (recovered) {
      transitionJournal({
        journalFile,
        expectedStatus: 'executing-session-controls',
        nextStatus: 'recovered-after-failure',
        event: 'isolated-sessions-revoked-and-owner-restored-after-failure',
        recoveryRequired: false,
        occurredAt: new Date(),
        random,
        readVault,
      });
      throw error;
    }
    fail(`${primaryFailure} Session-control recovery remains required.`);
  }
}

export async function inspectPixelSessionControls({
  journalFile,
  candidate,
  device,
  fetchImpl = fetch,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  readVault = readEmailVerifiedJourneyVault,
  verifyInstalled = verifyCurrentHeadAndroidInstalledCandidate,
  occurredAt = new Date(),
  random = randomBytes,
} = {}) {
  const exactCandidate = validateCandidate(candidate);
  const { journal, account } = readSessionControlsJournal(journalFile, { readVault });
  assertCandidateBinding(journal.candidate, exactCandidate);
  if (journal.status !== 'prepared-before-session-mutation' || journal.recoveryRequired) {
    fail('The session-control journal is not in its safe pre-mutation state.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  const installed = verifyInstalled(commandRunner, adbPath, device, exactCandidate);
  transitionJournal({
    journalFile,
    expectedStatus: 'prepared-before-session-mutation',
    nextStatus: 'executing-session-controls',
    event: 'isolated-session-cleanup-armed-before-inspection-session',
    recoveryRequired: true,
    occurredAt,
    random,
    readVault,
  });
  await restoreExactAccount({ commandRunner, adbPath, device, wait, account });
  const remote = await loginSession(fetchImpl, account);
  if (!await waitForExactTwoSessionInventory({ fetchImpl, session: remote, wait })) {
    fail('The inspection two-session Staging inventory is ambiguous.');
  }
  const hierarchy = await openSessionControls({ commandRunner, adbPath, device, wait });
  const action = selectRemoteSessionSignOutNode(hierarchy);
  const actionBounds = nodeBounds(action);
  const linuxBounds = nodeBounds(currentHeadAndroidNamedNodes(hierarchy, 'Linux')[0]);
  if (actionBounds === null || linuxBounds === null) {
    fail('The inspection session-control geometry is unavailable.');
  }
  return Object.freeze({
    status: 'ready-for-bounded-session-control-inspection',
    installedVersionName: installed.versionName,
    installedBuildNumber: installed.buildNumber,
    exactTwoSessionInventory: true,
    remoteLabelCount: 1,
    remoteActionCount: 1,
    remoteActionVerticalDistance: Math.abs(actionBounds.y - linuxBounds.y),
    recoveryRequired: true,
    containsEmailAddress: false,
    containsCredential: false,
    containsToken: false,
    containsSessionId: false,
    containsRawDeviceIdentifier: false,
  });
}

export async function recoverPixelSessionControls({
  journalFile,
  device,
  fetchImpl = fetch,
  commandRunner = defaultCurrentHeadAndroidCommandRunner,
  adbPath = 'adb',
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  readVault = readEmailVerifiedJourneyVault,
  random = randomBytes,
} = {}) {
  const { journal, account, owner } = readSessionControlsJournal(journalFile, { readVault });
  if (!journal.recoveryRequired || journal.status !== 'executing-session-controls') {
    return publicJournal(journal);
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  await recoverIsolatedAndOwner({
    fetchImpl, commandRunner, adbPath, device, wait, account, owner,
  });
  return transitionJournal({
    journalFile,
    expectedStatus: 'executing-session-controls',
    nextStatus: 'recovered-after-failure',
    event: 'isolated-sessions-revoked-and-owner-restored-by-explicit-recovery',
    recoveryRequired: false,
    occurredAt: new Date(),
    random,
    readVault,
  });
}

export function sanitizeSessionControlsFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.length > 0
      && message.length <= 220
      && !/@|\+\d|\b\d{6,}\b|[A-Za-z0-9_-]{32,}/u.test(message)
      && /^(The |A |Logout-all |Session-control |ADB |Android |Pixel )/u.test(message)) {
    return message.replace(/\s+Session-control recovery remains required\.$/u, '')
      + (message.endsWith('Session-control recovery remains required.')
        ? ' Session-control recovery remains required.'
        : '');
  }
  return 'The sanitized current-candidate session-control diagnostic failed.';
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function run() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? fail('The session-control phase is required.');
  const journalFile = resolve(
    argumentValue(args, '--journal-file') ?? fail('The session-control journal file is required.'),
  );
  if (!['prepare', 'inspect', 'execute', 'recover'].includes(phase)) {
    fail('The session-control phase is invalid.');
  }
  if (phase === 'prepare') {
    const candidateDirectory = resolve(
      argumentValue(args, '--candidate-dir') ?? fail('The candidate directory is required.'),
    );
    const candidate = await validatePrivateAndroidReleaseArchive({
      root: repositoryRoot,
      candidateDirectory,
    });
    const sourceVaultFile = resolve(
      argumentValue(args, '--source-vault-file')
        ?? fail('The source account vault is required.'),
    );
    const result = prepareSessionControlsJournal({
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
  if (phase === 'recover') {
    const result = await recoverPixelSessionControls({ journalFile, device });
    process.stdout.write(`${JSON.stringify({ ...result, device: deviceSummary }, null, 2)}\n`);
    return;
  }
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('The candidate directory is required.'),
  );
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const result = phase === 'inspect'
    ? await inspectPixelSessionControls({ journalFile, candidate, device })
    : await executePixelSessionControls({ journalFile, candidate, device });
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
      tokensPrinted: false,
      rawDeviceIdentifierPrinted: false,
    },
  }, null, 2)}\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${sanitizeSessionControlsFailure(error)}\n`);
    process.exitCode = 1;
  }
}
