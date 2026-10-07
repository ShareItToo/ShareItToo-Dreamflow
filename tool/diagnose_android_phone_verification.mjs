#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
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
const applicationId = 'com.shareittoo.app';
const apiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const frozenCandidateCompatiblePaths = Object.freeze([
  /^backend\//u,
  /^docs\//u,
  /^tool\//u,
  /^test\/tool\//u,
  /^store\/(?:privacy-disclosures|retention-deletion-readiness)\.json$/u,
]);

export function createPhoneVerificationCommandRunner(execute = execFileSync) {
  return (file, args, { binary = false } = {}) => execute(file, args, {
    encoding: binary ? null : 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
}

export function wakePhoneVerificationScreen(commandRunner, adbPath, device) {
  currentHeadAndroidAdb(
    commandRunner,
    adbPath,
    device,
    ['shell', 'input', 'keyevent', '224'],
  );
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
}

const phoneVerificationCommandRunner = createPhoneVerificationCommandRunner();

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function outsideRepository(path, label) {
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail(`${label} must remain outside the repository.`);
  }
  return absolute;
}

function ownerOnlyFile(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be absolute.`);
  const canonical = realpathSync(path);
  outsideRepository(canonical, label);
  const stat = statSync(canonical);
  if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be a non-empty owner-only file.`);
  }
  return canonical;
}

export function normalizePrivatePhoneInput(value) {
  const normalized = String(value)
    .trim()
    .replace(/[\s().-]/gu, '')
    .replace(/^00/u, '+');
  if (!/^\+49[1-9][0-9]{6,12}$/u.test(normalized)) {
    fail('The private phone input is not one valid German E.164 number.');
  }
  return normalized;
}

export function normalizePrivateSmsCode(value) {
  const normalized = String(value).trim();
  if (!/^[0-9]{6}$/u.test(normalized)) {
    fail('The private SMS confirmation input is not one six-digit code.');
  }
  return normalized;
}

function readPrivatePhone(path) {
  return normalizePrivatePhoneInput(
    readFileSync(ownerOnlyFile(path, 'Private phone input'), 'utf8'),
  );
}

function readPrivateSmsCode(path) {
  return normalizePrivateSmsCode(
    readFileSync(ownerOnlyFile(path, 'Private SMS confirmation input'), 'utf8'),
  );
}

export function sanitizePhoneVerificationFailure(error) {
  const message = typeof error?.message === 'string' ? error.message.trim() : '';
  if (message.length === 0
      || message.length > 240
      || /(?:@|https?:\/\/|\/Users\/|\+49|sms.?code|password|passcode|secret|token|credential|private.?key|api.?key|otp|pin|serial)/iu.test(message)
      || !/^[A-Za-z0-9_ .,:;()[\]'/-]+$/u.test(message)) {
    return 'safe diagnostic reason unavailable';
  }
  return message;
}

export function validateFrozenCandidateMobileCompatibility({
  candidateIsAncestor,
  changedPaths,
} = {}) {
  if (candidateIsAncestor !== true || !Array.isArray(changedPaths)) {
    fail('The frozen Android candidate is not an ancestor of the diagnostic source.');
  }
  const unsafe = changedPaths.filter((path) => (
    typeof path !== 'string'
      || path.length === 0
      || !frozenCandidateCompatiblePaths.some((pattern) => pattern.test(path))
  ));
  if (unsafe.length > 0) {
    fail('Mobile source changed after the frozen Android candidate was built.');
  }
  return Object.freeze({
    candidateIsAncestor: true,
    changedPathCount: changedPaths.length,
    mobileSourceChanged: false,
  });
}

function pointForNode(node, label) {
  const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

function nodeBounds(node) {
  const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) return null;
  return {
    left: Number(bounds[1]),
    top: Number(bounds[2]),
    right: Number(bounds[3]),
    bottom: Number(bounds[4]),
  };
}

function normalizedInputLabel(value) {
  return String(value ?? '').replaceAll('\u2011', '-');
}

function directlyLabelledEditableNodes(hierarchy, label) {
  const expected = normalizedInputLabel(label);
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? []).filter((node) => (
    currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText'
      && currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false'
      && nodeBounds(node) !== null
      && ['hint', 'text', 'content-desc'].some((attribute) => (
        normalizedInputLabel(currentHeadAndroidNodeAttribute(node, attribute)) === expected
      ))
  ));
}

export function hasPhoneVerificationSmsInput(hierarchy) {
  try {
    currentHeadAndroidEditableNodeForLabel(hierarchy, 'SMS-Code');
    return true;
  } catch {
    return false;
  }
}

export function createPhoneConfirmationResultObserver(previousHierarchy) {
  const errorLabels = [
    'SMS-Code prüfen',
    'Telefonprüfung nicht abgeschlossen',
    'Ergebnisstatus unklar',
  ];
  const errorLabel = (value) => errorLabels.find((label) => value.includes(label));
  const previousError = errorLabel(previousHierarchy);
  let previousErrorCleared = previousError === undefined;
  return (hierarchy) => {
    if (hierarchy.includes('Telefonnummer verifiziert')
        || inspectPhoneVerificationSurface(hierarchy).state === 'verified'
        || hierarchy.includes('Telefonnummer bestätigt')) return true;
    const currentError = errorLabel(hierarchy);
    if (currentError === undefined) {
      // Only an actual code sheet can establish the pending transition.
      // A missing/foreign surface must not manufacture a fresh outcome.
      if (hasPhoneVerificationSmsInput(hierarchy)) previousErrorCleared = true;
      return false;
    }
    return previousErrorCleared || currentError !== previousError;
  };
}

export function currentHeadAndroidEditableNodeForLabel(hierarchy, label) {
  const direct = directlyLabelledEditableNodes(hierarchy, label);
  if (direct.length === 1) return direct[0];
  if (direct.length > 1) fail(`The sanitized ${label} input field is ambiguous.`);
  const labels = currentHeadAndroidNamedNodes(hierarchy, label)
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter((entry) => entry.bounds !== null);
  const editable = (String(hierarchy).match(/<node\b[^>]*>/gu) ?? [])
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.EditText')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false')
    .map((node) => ({ node, bounds: nodeBounds(node) }))
    .filter((entry) => entry.bounds !== null);
  const candidates = [];
  for (const labelled of labels) {
    for (const field of editable) {
      const verticalGap = field.bounds.top - labelled.bounds.bottom;
      const horizontalOverlap = Math.min(field.bounds.right, labelled.bounds.right)
        - Math.max(field.bounds.left, labelled.bounds.left);
      if (verticalGap >= 0 && verticalGap <= 500 && horizontalOverlap > 0) {
        candidates.push({ ...field, verticalGap });
      }
    }
  }
  candidates.sort((left, right) => left.verticalGap - right.verticalGap);
  if (candidates.length === 0) {
    fail(`The sanitized ${label} input field is unavailable.`);
  }
  return candidates[0].node;
}

export function inspectPhoneVerificationSurface(hierarchy) {
  const unknown = Object.freeze({ state: 'unknown', phoneInputEmpty: false });
  if (hasPhoneVerificationSmsInput(hierarchy)) return unknown;
  const buttons = currentHeadAndroidNamedNodes(hierarchy, 'Telefonnummer verifizieren')
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'class') === 'android.widget.Button');
  if (buttons.length !== 1) return unknown;
  let input;
  try {
    input = currentHeadAndroidEditableNodeForLabel(hierarchy, 'Telefonnummer');
  } catch {
    return unknown;
  }
  const field = nodeBounds(input);
  const button = nodeBounds(buttons[0]);
  if (field === null || button === null || button.top < field.bottom) return unknown;
  const statusInPhoneSection = (label) => currentHeadAndroidNamedNodes(hierarchy, label)
    .some((node) => {
      const bounds = nodeBounds(node);
      return bounds !== null && bounds.top >= field.bottom && bounds.bottom <= button.top
        && Math.min(bounds.right, field.right) > Math.max(bounds.left, field.left);
    });
  const enabled = currentHeadAndroidNodeAttribute(buttons[0], 'enabled');
  const verified = statusInPhoneSection('Verifiziert');
  const unverified = statusInPhoneSection('Nicht verifiziert');
  const state = verified && !unverified && enabled === 'false'
    ? 'verified'
    : unverified && !verified && enabled === 'true' ? 'unverified' : 'unknown';
  return Object.freeze({
    state,
    phoneInputEmpty: (currentHeadAndroidNodeAttribute(input, 'text') ?? '').trim() === '',
  });
}

function tapNamedNode(commandRunner, adbPath, device, hierarchy, label, { chooseLast = false } = {}) {
  const nodes = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  if (nodes.length === 0) fail(`The sanitized ${label} action is unavailable.`);
  const point = pointForNode(chooseLast ? nodes.at(-1) : nodes[0], label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

export async function waitForPhoneVerificationHierarchy({
  commandRunner,
  adbPath,
  device,
  wait,
  predicate,
  attempts = 32,
  label,
  timeoutMs = 120_000,
  now = Date.now,
}) {
  const deadline = now() + timeoutMs;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (now() >= deadline) break;
    wakePhoneVerificationScreen(commandRunner, adbPath, device);
    await wait(500);
    if (now() >= deadline) break;
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (now() >= deadline) break;
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

const waitForHierarchy = waitForPhoneVerificationHierarchy;

async function findOrScroll({ commandRunner, adbPath, device, wait, label }) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, label).length > 0) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '540', '1650', '540', '450', '350',
    ]);
    await wait(350);
  }
  fail(`The sanitized ${label} action is unavailable after bounded scrolling.`);
}

function replaceInput(commandRunner, adbPath, device, hierarchy, label, value, deleteCount) {
  if (!/^[+0-9]{1,16}$/u.test(value)) fail(`The private ${label} input is invalid.`);
  const adbSafeValue = encodeAdbNumericInput(value);
  const field = currentHeadAndroidEditableNodeForLabel(hierarchy, label);
  const point = pointForNode(field, label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
  currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '123']);
  for (let index = 0; index < deleteCount; index += 1) {
    currentHeadAndroidAdb(commandRunner, adbPath, device, ['shell', 'input', 'keyevent', '67']);
  }
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'text', adbSafeValue,
  ]);
}

export function encodeAdbNumericInput(value) {
  if (!/^[+0-9]{1,16}$/u.test(value)) {
    fail('The private numeric Android input is invalid.');
  }
  return value.startsWith('+') ? `00${value.slice(1)}` : value;
}

export async function inspectStagingPhoneBackendGate(fetchImpl, account) {
  const login = await fetchImpl(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(20_000),
  });
  let loginValue = null;
  try {
    loginValue = await login.json();
  } catch {
    loginValue = null;
  }
  if (login.status !== 200
      || typeof loginValue?.accessToken !== 'string'
      || loginValue.accessToken.length < 20
      || typeof loginValue?.refreshToken !== 'string'
      || loginValue.refreshToken.length < 20) {
    fail('The protected Staging owner login is unavailable.');
  }

  let result = null;
  let inspectionError = null;
  try {
    const statusResponse = await fetchImpl(`${apiBaseUrl}/auth/phone-verification/status`, {
      headers: { authorization: `Bearer ${loginValue.accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    let statusValue = null;
    try {
      statusValue = await statusResponse.json();
    } catch {
      statusValue = null;
    }
    const disabled = statusValue?.available === false && statusValue?.provider === null;
    const enabled = statusValue?.available === true && statusValue?.provider === 'firebase-phone';
    if (statusResponse.status !== 200 || (!disabled && !enabled)) {
      fail('The Staging phone-verification provider status is ambiguous.');
    }
    result = Object.freeze({
      enabled,
      advertisedProvider: enabled ? 'firebase-phone' : null,
      diagnosticSessionRevoked: true,
    });
  } catch (error) {
    inspectionError = error;
  }

  let cleanupPassed = false;
  try {
    const logout = await fetchImpl(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginValue.refreshToken }),
      signal: AbortSignal.timeout(20_000),
    });
    cleanupPassed = logout.status === 204;
  } catch {
    cleanupPassed = false;
  }
  if (!cleanupPassed) {
    fail('The protected Staging diagnostic session cleanup failed.');
  }
  if (inspectionError !== null) throw inspectionError;
  return result;
}

function exactVerifiedPhone(user, expectedPhone) {
  return user?.phone === expectedPhone && user?.phoneVerified === true;
}

function exactClearedPhone(user) {
  return user?.phone === null && user?.phoneVerified === false;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function clearVerifiedPhoneFromStagingTestAccount(
  fetchImpl,
  account,
  expectedPhone,
) {
  const login = await fetchImpl(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
    signal: AbortSignal.timeout(20_000),
  });
  const loginValue = await readJsonResponse(login);
  if (login.status !== 200
      || typeof loginValue?.accessToken !== 'string'
      || loginValue.accessToken.length < 20
      || typeof loginValue?.refreshToken !== 'string'
      || loginValue.refreshToken.length < 20) {
    fail('The protected Staging owner login is unavailable for phone cleanup.');
  }

  const authorized = { authorization: `Bearer ${loginValue.accessToken}` };
  let cleanupError = null;
  let result = null;
  try {
    const beforeResponse = await fetchImpl(`${apiBaseUrl}/auth/me`, {
      headers: authorized,
      signal: AbortSignal.timeout(20_000),
    });
    const before = await readJsonResponse(beforeResponse);
    if (beforeResponse.status !== 200 || !exactVerifiedPhone(before?.user, expectedPhone)) {
      fail('The protected Staging owner has no exact verified phone to clear.');
    }

    const clearResponse = await fetchImpl(`${apiBaseUrl}/profile`, {
      method: 'PATCH',
      headers: { ...authorized, 'content-type': 'application/json' },
      body: JSON.stringify({ profile: { phone: null } }),
      signal: AbortSignal.timeout(20_000),
    });
    const cleared = await readJsonResponse(clearResponse);
    if (clearResponse.status !== 200 || !exactClearedPhone(cleared?.user)) {
      fail('The verified Staging phone cleanup was not confirmed by its response.');
    }

    const afterResponse = await fetchImpl(`${apiBaseUrl}/auth/me`, {
      headers: authorized,
      signal: AbortSignal.timeout(20_000),
    });
    const after = await readJsonResponse(afterResponse);
    if (afterResponse.status !== 200 || !exactClearedPhone(after?.user)) {
      fail('The verified Staging phone cleanup did not persist on readback.');
    }
    result = Object.freeze({
      exactVerifiedStateObservedBeforeCleanup: true,
      exactClearedStateConfirmedByMutation: true,
      exactClearedStateConfirmedByReadback: true,
      diagnosticSessionRevoked: true,
    });
  } catch (error) {
    cleanupError = error;
  }

  let sessionRevoked = false;
  try {
    const logout = await fetchImpl(`${apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: loginValue.refreshToken }),
      signal: AbortSignal.timeout(20_000),
    });
    sessionRevoked = logout.status === 204;
  } catch {
    sessionRevoked = false;
  }
  if (!sessionRevoked) {
    fail('The protected Staging phone-cleanup session could not be revoked.');
  }
  if (cleanupError !== null) throw cleanupError;
  return result;
}

async function openContactInformation({ commandRunner, adbPath, device, wait }) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait,
  });
  tapNamedNode(commandRunner, adbPath, device, main, 'Mein SIT', { chooseLast: true });
  let hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'authenticated profile',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Abmelden').length > 0,
  });
  hierarchy = await findOrScroll({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'Kontoeinstellungen',
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Kontoeinstellungen');
  hierarchy = await waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'account settings',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Kontaktinformationen').length > 0,
  });
  tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Kontaktinformationen');
  return waitForHierarchy({
    commandRunner,
    adbPath,
    device,
    wait,
    label: 'contact information',
    predicate: (value) => currentHeadAndroidNamedNodes(value, 'Telefonnummer verifizieren').length > 0
      || (value.includes('Telefonnummer') && value.includes('Verifiziert')),
  });
}

function writePrivateState(directory, state) {
  const absolute = outsideRepository(directory, 'Private phone evidence directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  const path = resolve(absolute, 'state.json');
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return sha256(JSON.stringify(state));
}

export function classifyPhoneVerificationObservation(surfaceState) {
  if (!['verified', 'unverified', 'unknown'].includes(surfaceState)) {
    fail('The sanitized phone-verification observation state is invalid.');
  }
  if (surfaceState === 'verified') {
    return Object.freeze({
      status: 'phone-verification-confirmed',
      freshSmsRequestRequired: false,
      reconciliationRequired: false,
    });
  }
  if (surfaceState === 'unverified') {
    return Object.freeze({
      status: 'phone-verification-not-confirmed-fresh-request-required',
      freshSmsRequestRequired: true,
      reconciliationRequired: false,
    });
  }
  return Object.freeze({
    status: 'phone-verification-result-unproven-reconciliation-required',
    freshSmsRequestRequired: false,
    reconciliationRequired: true,
  });
}

export async function diagnoseAndroidPhoneVerification({
  phase,
  protectedOwnerVaultFile,
  phoneFile,
  smsCodeFile,
  privateEvidenceDirectory,
  commandRunner = phoneVerificationCommandRunner,
  adbPath = 'adb',
  device,
  deviceSummary,
  candidate,
  fetchImpl = globalThis.fetch,
  capturedAt = new Date().toISOString(),
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  if (!['preflight', 'request', 'confirm', 'observe', 'cleanup'].includes(phase)) {
    fail('Phone diagnostic phase must be preflight, request, confirm, observe or cleanup.');
  }
  wakePhoneVerificationScreen(commandRunner, adbPath, device);
  const installed = verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    adbPath,
    device,
    candidate,
  );
  const { vault } = readEmailVerifiedJourneyVault(protectedOwnerVaultFile);
  const owner = vault.accounts.find((entry) => entry.role === 'owner');
  if (!owner) fail('The protected synthetic owner role is unavailable.');
  const backendGate = await inspectStagingPhoneBackendGate(fetchImpl, owner);

  if (phase === 'preflight') {
    const status = backendGate.enabled
      ? 'staging-phone-backend-gate-enabled-current-candidate'
      : 'staging-phone-backend-gate-disabled-current-candidate';
    const stateSha256 = writePrivateState(privateEvidenceDirectory, {
      schemaVersion: 1,
      kind: 'n29-private-phone-verification-state',
      status,
      capturedAt,
      candidateCommit: candidate.commit,
      candidateBuildNumber: candidate.buildNumber,
      backendGateEnabled: backendGate.enabled,
      diagnosticSessionRevoked: backendGate.diagnosticSessionRevoked,
      containsPhoneNumber: false,
      containsSmsCode: false,
    });
    return {
      schemaVersion: 1,
      kind: 'android-current-candidate-phone-verification-diagnostic',
      status,
      capturedAt,
      candidate: {
        applicationId: candidate.applicationId,
        versionName: candidate.versionName,
        buildNumber: candidate.buildNumber,
        commit: candidate.commit,
        apkSha256: candidate.apkSha256,
        signingCertificateSha256: candidate.signingCertificateSha256,
        apiBaseUrl: candidate.apiBaseUrl,
        repositoryHeadAtObservation: candidate.repositoryHeadAtObservation,
        postCandidateChangedPathCount: candidate.postCandidateChangedPathCount,
        mobileSourceChangedAfterCandidate: false,
      },
      installed: {
        physicalDevice: true,
        exactCandidateHashMatched: true,
        versionName: installed.versionName,
        buildNumber: installed.buildNumber,
        delivery: installed.delivery,
      },
      device: deviceSummary,
      results: {
        stagingBackendGateEnabled: backendGate.enabled,
        advertisedProvider: backendGate.advertisedProvider,
        firebaseConsolePhoneProviderVerified: false,
        smsRegionPolicyVerified: false,
        diagnosticSessionRevoked: backendGate.diagnosticSessionRevoked,
        smsRequested: false,
        ownerActionRequired: true,
        privateStateSha256: stateSha256,
        protectedSyntheticOwnerRetained: true,
      },
      boundaries: {
        stagingOnly: true,
        productionChanged: false,
        googlePlayChanged: false,
        firebaseConfigurationChanged: false,
        smsSent: false,
        paymentCalled: false,
        realMoneyUsed: false,
        kycCalled: false,
        containsPhoneNumber: false,
        containsSmsCode: false,
        containsCredential: false,
        containsToken: false,
        containsRawDeviceIdentifiers: false,
        containsPrivateFilesystemPaths: false,
      },
    };
  }

  if (!backendGate.enabled) {
    fail('The Staging phone-verification provider is unavailable.');
  }
  const phoneNumber = readPrivatePhone(phoneFile);

  if (phase === 'confirm') {
    const smsConfirmationInput = readPrivateSmsCode(smsCodeFile);
    let hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (!hasPhoneVerificationSmsInput(hierarchy)) {
      fail('The current candidate is not awaiting one SMS confirmation input.');
    }
    replaceInput(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      'SMS-Code',
      smsConfirmationInput,
      8,
    );
    hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    const currentConfirmationResult = createPhoneConfirmationResultObserver(hierarchy);
    writePrivateState(privateEvidenceDirectory, {
      schemaVersion: 1,
      kind: 'n29-private-phone-verification-state',
      status: 'sms-confirmation-attempt-in-progress-result-unproven',
      capturedAt,
      candidateCommit: candidate.commit,
      candidateBuildNumber: candidate.buildNumber,
      confirmationInputSubmitted: false,
      reconciliationRequired: true,
      ownerActionRequired: false,
      containsPhoneNumber: false,
      containsSmsCode: false,
    });
    tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Bestätigen');
    writePrivateState(privateEvidenceDirectory, {
      schemaVersion: 1,
      kind: 'n29-private-phone-verification-state',
      status: 'sms-confirmation-submitted-result-unproven',
      capturedAt,
      candidateCommit: candidate.commit,
      candidateBuildNumber: candidate.buildNumber,
      confirmationInputSubmitted: true,
      reconciliationRequired: true,
      ownerActionRequired: false,
      containsPhoneNumber: false,
      containsSmsCode: false,
    });
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      attempts: 90,
      label: 'SMS confirmation result',
      predicate: currentConfirmationResult,
    });
    if (!hierarchy.includes('Telefonnummer verifiziert')
        && inspectPhoneVerificationSurface(hierarchy).state !== 'verified') {
      writePrivateState(privateEvidenceDirectory, {
        schemaVersion: 1,
        kind: 'n29-private-phone-verification-state',
        status: 'sms-confirmation-rejected-fresh-request-required',
        capturedAt,
        candidateCommit: candidate.commit,
        candidateBuildNumber: candidate.buildNumber,
        confirmationInputSubmitted: true,
        freshSmsRequestRequired: true,
        reconciliationRequired: false,
        ownerActionRequired: false,
        containsPhoneNumber: false,
        containsSmsCode: false,
      });
      fail('The private SMS confirmation input was not safely accepted.');
    }
    const status = 'valid-code-accepted-awaiting-cold-restart';
    const stateSha256 = writePrivateState(privateEvidenceDirectory, {
      schemaVersion: 1,
      kind: 'n29-private-phone-verification-state',
      status,
      capturedAt,
      candidateCommit: candidate.commit,
      candidateBuildNumber: candidate.buildNumber,
      containsPhoneNumber: false,
      containsSmsCode: false,
    });
    return {
      schemaVersion: 1,
      kind: 'android-current-candidate-phone-verification-diagnostic',
      status,
      capturedAt,
      candidate: {
        applicationId: candidate.applicationId,
        versionName: candidate.versionName,
        buildNumber: candidate.buildNumber,
        commit: candidate.commit,
        apkSha256: candidate.apkSha256,
        signingCertificateSha256: candidate.signingCertificateSha256,
        apiBaseUrl: candidate.apiBaseUrl,
      },
      installed: {
        physicalDevice: true,
        exactCandidateHashMatched: true,
        versionName: installed.versionName,
        buildNumber: installed.buildNumber,
        delivery: installed.delivery,
      },
      device: deviceSummary,
      results: {
        stagingBackendGateEnabled: true,
        advertisedProvider: 'firebase-phone',
        privateSmsInputAccepted: true,
        validCodeAccepted: true,
        verifiedStatePersistedAfterColdRestart: false,
        ownerActionRequired: false,
        diagnosticSessionRevoked: backendGate.diagnosticSessionRevoked,
        privateStateSha256: stateSha256,
        protectedSyntheticOwnerRetained: true,
      },
      boundaries: {
        stagingOnly: true,
        productionChanged: false,
        googlePlayChanged: false,
        firebaseConfigurationChanged: false,
        paymentCalled: false,
        realMoneyUsed: false,
        kycCalled: false,
        containsPhoneNumber: false,
        containsSmsCode: false,
        containsCredential: false,
        containsToken: false,
        containsRawDeviceIdentifiers: false,
        containsPrivateFilesystemPaths: false,
      },
    };
  }

  if (phase === 'cleanup') {
    const backendCleanup = await clearVerifiedPhoneFromStagingTestAccount(
      fetchImpl,
      owner,
      phoneNumber,
    );
    await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
    const restoredAfterCleanup = await restoreSyntheticSession({
      commandRunner,
      adbPath,
      device,
      wait,
      account: owner,
    });
    if (!restoredAfterCleanup) {
      fail('The protected synthetic owner session could not be restored after cleanup.');
    }
    const cleanupHierarchy = await openContactInformation({
      commandRunner,
      adbPath,
      device,
      wait,
    });
    const clearedSurface = inspectPhoneVerificationSurface(cleanupHierarchy);
    if (clearedSurface.state !== 'unverified' || !clearedSurface.phoneInputEmpty) {
      fail('The current candidate did not read back the cleared phone state.');
    }
    const status = 'passed-verified-phone-cleanup-current-candidate';
    const stateSha256 = writePrivateState(privateEvidenceDirectory, {
      schemaVersion: 1,
      kind: 'n29-private-phone-verification-state',
      status,
      capturedAt,
      candidateCommit: candidate.commit,
      candidateBuildNumber: candidate.buildNumber,
      containsPhoneNumber: false,
      containsSmsCode: false,
    });
    return {
      schemaVersion: 1,
      kind: 'android-current-candidate-phone-verification-diagnostic',
      status,
      capturedAt,
      candidate: {
        applicationId: candidate.applicationId,
        versionName: candidate.versionName,
        buildNumber: candidate.buildNumber,
        commit: candidate.commit,
        apkSha256: candidate.apkSha256,
        signingCertificateSha256: candidate.signingCertificateSha256,
        apiBaseUrl: candidate.apiBaseUrl,
      },
      installed: {
        physicalDevice: true,
        exactCandidateHashMatched: true,
        versionName: installed.versionName,
        buildNumber: installed.buildNumber,
        delivery: installed.delivery,
      },
      device: deviceSummary,
      results: {
        ...backendCleanup,
        currentCandidateClearedStateReadBack: true,
        ownerActionRequired: false,
        privateStateSha256: stateSha256,
        protectedSyntheticOwnerRetained: true,
      },
      boundaries: {
        stagingOnly: true,
        productionChanged: false,
        googlePlayChanged: false,
        firebaseConfigurationChanged: false,
        paymentCalled: false,
        realMoneyUsed: false,
        kycCalled: false,
        containsPhoneNumber: false,
        containsSmsCode: false,
        containsCredential: false,
        containsToken: false,
        containsRawDeviceIdentifiers: false,
        containsPrivateFilesystemPaths: false,
      },
    };
  }

  await ensureAndroidGuestSession({ commandRunner, adbPath, device, wait });
  const restored = await restoreSyntheticSession({
    commandRunner,
    adbPath,
    device,
    wait,
    account: owner,
  });
  if (!restored) fail('The protected synthetic owner session could not be restored.');
  let hierarchy = await openContactInformation({ commandRunner, adbPath, device, wait });
  let status;
  let invalidCodeRejected = false;

  if (phase === 'request') {
    if (inspectPhoneVerificationSurface(hierarchy).state === 'verified') {
      status = 'already-verified-current-candidate';
    } else {
      replaceInput(
        commandRunner,
        adbPath,
        device,
        hierarchy,
        'Telefonnummer',
        phoneNumber,
        24,
      );
      hierarchy = await findOrScroll({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'Telefonnummer verifizieren',
      });
      tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Telefonnummer verifizieren');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        label: 'SMS consent',
        predicate: (value) => value.includes('SMS-Code anfordern?')
          && currentHeadAndroidNamedNodes(value, 'Code senden').length > 0,
      });
      tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Code senden');
      hierarchy = await waitForHierarchy({
        commandRunner,
        adbPath,
        device,
        wait,
        attempts: 150,
        label: 'phone verification result',
        predicate: (value) => value.includes('Telefonnummer verifiziert')
          || hasPhoneVerificationSmsInput(value)
          || value.includes('Telefonprüfung nicht')
          || value.includes('Ergebnisstatus unklar'),
      });
      if (hierarchy.includes('Telefonnummer verifiziert')) {
        status = 'automatically-verified-current-candidate';
      } else if (hasPhoneVerificationSmsInput(hierarchy)) {
        replaceInput(
          commandRunner,
          adbPath,
          device,
          hierarchy,
          'SMS-Code',
          '000000',
          8,
        );
        hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
        tapNamedNode(commandRunner, adbPath, device, hierarchy, 'Bestätigen');
        hierarchy = await waitForHierarchy({
          commandRunner,
          adbPath,
          device,
          wait,
          attempts: 60,
          label: 'invalid SMS rejection',
          predicate: (value) => value.includes('SMS-Code prüfen'),
        });
        invalidCodeRejected = true;
        status = 'awaiting-owner-sms-code';
      } else {
        fail('The current candidate did not reach a safe phone-verification state.');
      }
    }
  } else {
    const observedSurfaceState = inspectPhoneVerificationSurface(hierarchy).state;
    const observation = classifyPhoneVerificationObservation(observedSurfaceState);
    if (observedSurfaceState !== 'verified') {
      writePrivateState(privateEvidenceDirectory, {
        schemaVersion: 1,
        kind: 'n29-private-phone-verification-state',
        status: observation.status,
        capturedAt,
        candidateCommit: candidate.commit,
        candidateBuildNumber: candidate.buildNumber,
        observedPhoneSurfaceState: observedSurfaceState,
        freshSmsRequestRequired: observation.freshSmsRequestRequired,
        reconciliationRequired: observation.reconciliationRequired,
        ownerActionRequired: false,
        containsPhoneNumber: false,
        containsSmsCode: false,
      });
      fail('Current-candidate phone verification is not yet confirmed.');
    }
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'am', 'force-stop', applicationId,
    ]);
    const coldHierarchy = await openContactInformation({ commandRunner, adbPath, device, wait });
    if (inspectPhoneVerificationSurface(coldHierarchy).state !== 'verified') {
      fail('Verified phone state did not persist across a cold restart.');
    }
    status = 'passed-valid-code-and-cold-restart';
  }

  const stateSha256 = writePrivateState(privateEvidenceDirectory, {
    schemaVersion: 1,
    kind: 'n29-private-phone-verification-state',
    status,
    capturedAt,
    candidateCommit: candidate.commit,
    candidateBuildNumber: candidate.buildNumber,
    invalidCodeRejected,
    containsPhoneNumber: false,
    containsSmsCode: false,
  });

  return {
    schemaVersion: 1,
    kind: 'android-current-candidate-phone-verification-diagnostic',
    status,
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      apkSha256: candidate.apkSha256,
      signingCertificateSha256: candidate.signingCertificateSha256,
      apiBaseUrl: candidate.apiBaseUrl,
    },
    installed: {
      physicalDevice: true,
      exactCandidateHashMatched: true,
      versionName: installed.versionName,
      buildNumber: installed.buildNumber,
      delivery: installed.delivery,
    },
    device: deviceSummary,
    results: {
      stagingBackendGateEnabled: true,
      advertisedProvider: 'firebase-phone',
      germanyOnlyInput: true,
      smsConsentPresented: phase === 'request',
      invalidCodeRejected,
      validCodeAccepted: status === 'passed-valid-code-and-cold-restart'
        || status === 'automatically-verified-current-candidate'
        || status === 'already-verified-current-candidate',
      verifiedStatePersistedAfterColdRestart: status === 'passed-valid-code-and-cold-restart',
      ownerActionRequired: status === 'awaiting-owner-sms-code',
      diagnosticSessionRevoked: backendGate.diagnosticSessionRevoked,
      privateStateSha256: stateSha256,
      protectedSyntheticOwnerRetained: true,
    },
    boundaries: {
      stagingOnly: true,
      productionChanged: false,
      googlePlayChanged: false,
      firebaseConfigurationChanged: false,
      paymentCalled: false,
      realMoneyUsed: false,
      kycCalled: false,
      containsPhoneNumber: false,
      containsSmsCode: false,
      containsCredential: false,
      containsToken: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  };
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

async function run() {
  const phase = process.env.SIT_N29_PHASE?.trim() || 'request';
  const protectedOwnerVaultFile = requiredEnvironment('SIT_N29_PROTECTED_OWNER_VAULT_FILE');
  const candidateDirectory = requiredEnvironment('SIT_N29_CANDIDATE_DIRECTORY');
  const phoneFile = phase === 'preflight'
    ? undefined
    : requiredEnvironment('SIT_N29_PHONE_FILE');
  const smsCodeFile = phase === 'confirm'
    ? requiredEnvironment('SIT_N29_SMS_CODE_FILE')
    : undefined;
  const privateEvidenceDirectory = process.env.SIT_N29_PRIVATE_EVIDENCE_DIR?.trim()
    || resolve(homedir(), 'Library', 'Application Support', 'ShareItToo', 'qa', 'n29-phone-verification');
  const archive = await validatePrivateAndroidReleaseArchive({ candidateDirectory });
  const repositoryHeadAtObservation = String(execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })).trim();
  let candidateIsAncestor = true;
  try {
    execFileSync('git', [
      'merge-base', '--is-ancestor', archive.commit, repositoryHeadAtObservation,
    ], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    candidateIsAncestor = false;
  }
  const changedPaths = String(execFileSync('git', [
    'diff', '--name-only', `${archive.commit}..${repositoryHeadAtObservation}`,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })).trim().split(/\r?\n/u).filter(Boolean);
  const compatibility = validateFrozenCandidateMobileCompatibility({
    candidateIsAncestor,
    changedPaths,
  });
  const candidate = Object.freeze({
    ...archive,
    repositoryHeadAtObservation,
    postCandidateChangedPathCount: compatibility.changedPathCount,
  });
  const devices = parseAdbDevices(
    defaultCurrentHeadAndroidCommandRunner('adb', ['devices', '-l']),
  );
  const device = selectSinglePhysicalDevice(devices);
  const deviceSummary = inspectPhysicalDevice({ adbPath: 'adb', device });
  try {
    const result = await diagnoseAndroidPhoneVerification({
      phase,
      protectedOwnerVaultFile,
      phoneFile,
      smsCodeFile,
      privateEvidenceDirectory,
      candidate,
      device,
      deviceSummary,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${sanitizePhoneVerificationFailure(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
