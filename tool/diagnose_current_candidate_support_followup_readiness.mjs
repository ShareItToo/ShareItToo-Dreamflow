#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  currentHeadAndroidNodeAttribute,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  launchCurrentHeadAndroidCandidate,
  restoreCurrentHeadAndroidExplore,
  verifyCurrentHeadAndroidInstalledCandidate,
  waitForCurrentHeadAndroidMainNavigation,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import { readEmailVerifiedJourneyVault } from './run_staging_email_verified_two_role_journey.mjs';
import {
  assertCurrentCandidateNoPostCandidateMobileSourceDrift,
  collectCurrentCandidateDriftPaths,
  validateCurrentPrivateAndroidCandidate,
} from './run_n28_current_candidate_pixel_surface_matrix.mjs';
import { validatePrivateAndroidReleaseArchive } from './validate_current_head_android_release_archive.mjs';

const apiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const applicationId = 'com.shareittoo.app';
const expectedBuildNumber = '2026090610';
const expectedCandidateCommit = '2fd793bac970866aa94a2940f28d6bbc3e04e377';

function fail(message) {
  throw new Error(message);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(fetchImpl, path, {
  method = 'GET',
  accessToken = null,
  body = undefined,
} = {}) {
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { response, value: await readJson(response) };
}

async function login(fetchImpl, account) {
  const { response, value } = await requestJson(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (response.status !== 200
      || typeof value?.accessToken !== 'string'
      || value.accessToken.length < 20
      || typeof value?.refreshToken !== 'string'
      || value.refreshToken.length < 20) {
    fail('A protected synthetic Staging login is unavailable.');
  }
  return Object.freeze({
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
  });
}

async function logout(fetchImpl, session) {
  const { response } = await requestJson(fetchImpl, '/auth/logout', {
    method: 'POST',
    body: { refreshToken: session.refreshToken },
  });
  return response.status === 204;
}

function supportCaseShape(entry) {
  return entry?.caseType === 'general_help'
    && entry?.caseSubType === 'app_error_or_display'
    && entry?.operatingMode === 'simulation';
}

export async function inspectCurrentCandidateSupportApi({
  accounts,
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  const owner = accounts?.find((entry) => entry.role === 'owner');
  const renter = accounts?.find((entry) => entry.role === 'renter');
  if (!owner || !renter) fail('Protected synthetic owner and renter roles are required.');

  const sessions = [];
  let primaryError = null;
  let result = null;
  try {
    const ownerSession = await login(fetchImpl, owner);
    sessions.push(ownerSession);
    const ownerMe = await requestJson(fetchImpl, '/auth/me', {
      accessToken: ownerSession.accessToken,
    });
    const ownerCases = await requestJson(fetchImpl, '/support/cases', {
      accessToken: ownerSession.accessToken,
    });
    const ownerAdmin = await requestJson(fetchImpl, '/admin/support/cases', {
      accessToken: ownerSession.accessToken,
    });
    if (ownerMe.response.status !== 200
        || ownerMe.value?.user?.role !== 'user'
        || ownerCases.response.status !== 200
        || !Array.isArray(ownerCases.value?.supportCases)
        || ownerAdmin.response.status !== 403) {
      fail('The protected owner support authorization surface is not exact.');
    }
    const matches = ownerCases.value.supportCases.filter(supportCaseShape);
    if (matches.length !== 1 || typeof matches[0]?.id !== 'string') {
      fail('The retained synthetic support case is missing or ambiguous.');
    }
    const target = matches[0];
    const detail = await requestJson(
      fetchImpl,
      `/support/cases/${encodeURIComponent(target.id)}`,
      { accessToken: ownerSession.accessToken },
    );
    if (detail.response.status !== 200
        || detail.value?.supportCase?.id !== target.id
        || !supportCaseShape(detail.value.supportCase)
        || !Array.isArray(detail.value.events)
        || !Array.isArray(detail.value.messages)
        || detail.value.supportCase.status !== 'received'
        || typeof detail.value.supportCase.nextUpdateAt !== 'string') {
      fail('The retained owner support detail is unavailable or changed.');
    }

    const renterSession = await login(fetchImpl, renter);
    sessions.push(renterSession);
    const renterMe = await requestJson(fetchImpl, '/auth/me', {
      accessToken: renterSession.accessToken,
    });
    const renterCases = await requestJson(fetchImpl, '/support/cases', {
      accessToken: renterSession.accessToken,
    });
    const renterDetail = await requestJson(
      fetchImpl,
      `/support/cases/${encodeURIComponent(target.id)}`,
      { accessToken: renterSession.accessToken },
    );
    const renterAdmin = await requestJson(fetchImpl, '/admin/support/cases', {
      accessToken: renterSession.accessToken,
    });
    if (renterMe.response.status !== 200
        || renterMe.value?.user?.role !== 'user'
        || renterCases.response.status !== 200
        || !Array.isArray(renterCases.value?.supportCases)
        || renterCases.value.supportCases.length !== 0
        || renterDetail.response.status !== 404
        || renterDetail.value?.error !== 'support_case_not_found'
        || renterAdmin.response.status !== 403) {
      fail('The renter support isolation or staff denial is not exact.');
    }
    const nextUpdate = new Date(detail.value.supportCase.nextUpdateAt);
    if (Number.isNaN(nextUpdate.getTime())) fail('The retained support deadline is invalid.');
    result = Object.freeze({
      exactRetainedSimulationCaseCount: 1,
      status: 'received',
      eventCount: detail.value.events.length,
      publicMessageCount: detail.value.messages.length,
      nextUpdateOverdue: nextUpdate.getTime() < now.getTime(),
      ownerBackendRole: 'user',
      renterBackendRole: 'user',
      renterCaseCount: 0,
      renterDirectRead: '404-support_case_not_found',
      ownerAdminRead: '403-forbidden',
      renterAdminRead: '403-forbidden',
      authorizedStaffIdentityAvailable: false,
      staffMutationAttempted: false,
      diagnosticSessionsRevoked: true,
    });
  } catch (error) {
    primaryError = error;
  }

  // Clean up every session that was actually issued. A fail-closed check may
  // stop before the second login; that must preserve the primary error rather
  // than manufacture a cleanup failure for a session that never existed.
  let cleanupPassed = true;
  for (const session of sessions.reverse()) {
    try {
      cleanupPassed = await logout(fetchImpl, session) && cleanupPassed;
    } catch {
      cleanupPassed = false;
    }
  }
  if (!cleanupPassed) fail('Support-readiness diagnostic session cleanup failed.');
  if (primaryError !== null) throw primaryError;
  return result;
}

function center(node, label) {
  const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/u.exec(
    currentHeadAndroidNodeAttribute(node, 'bounds') ?? '',
  );
  if (bounds === null) fail(`The sanitized ${label} action has invalid bounds.`);
  return {
    x: Math.floor((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.floor((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

function tapNode(commandRunner, adbPath, device, node, label) {
  const point = center(node, label);
  currentHeadAndroidAdb(commandRunner, adbPath, device, [
    'shell', 'input', 'tap', String(point.x), String(point.y),
  ]);
}

function exactNamedNode(hierarchy, label) {
  const enabled = currentHeadAndroidNamedNodes(hierarchy, label)
    .filter((node) => currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false');
  const clickable = enabled.filter(
    (node) => currentHeadAndroidNodeAttribute(node, 'clickable') === 'true',
  );
  const nodes = clickable.length > 0 ? clickable : enabled;
  if (nodes.length !== 1) fail(`The sanitized ${label} action is missing or ambiguous.`);
  return nodes[0];
}

function supportCaseCardNodes(hierarchy) {
  return (String(hierarchy).match(/<node\b[^>]*>/gu) ?? []).filter((node) => {
    const label = currentHeadAndroidNodeAttribute(node, 'content-desc') ?? '';
    return /^Support-Fall SIT-[A-HJ-NP-Z2-9]{12}, Status /u.test(label)
      && currentHeadAndroidNodeAttribute(node, 'enabled') !== 'false';
  });
}

async function waitForUi(commandRunner, adbPath, device, predicate, label, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (predicate(hierarchy)) return hierarchy;
  }
  fail(`The sanitized ${label} surface did not appear.`);
}

async function findByScrolling(commandRunner, adbPath, device, label) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
    if (currentHeadAndroidNamedNodes(hierarchy, label).length === 1) return hierarchy;
    currentHeadAndroidAdb(commandRunner, adbPath, device, [
      'shell', 'input', 'swipe', '720', '2450', '720', '750', '450',
    ]);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 450));
  }
  fail(`The sanitized ${label} entry is not reachable.`);
}

async function openAuthenticatedProfile(commandRunner, adbPath, device) {
  launchCurrentHeadAndroidCandidate(commandRunner, adbPath, device);
  const main = await waitForCurrentHeadAndroidMainNavigation({
    commandRunner,
    adbPath,
    device,
    wait: (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
  });
  tapNode(commandRunner, adbPath, device, exactNamedNode(main, 'Mein SIT'), 'Mein SIT');
  return waitForUi(
    commandRunner,
    adbPath,
    device,
    (value) => ['Meine Anzeigen', 'Mietanfragen', 'Abmelden', 'Suchen']
      .every((label) => currentHeadAndroidNamedNodes(value, label).length > 0),
    'authenticated profile',
  );
}

export async function inspectCurrentCandidateSupportPixel({
  commandRunner,
  adbPath,
  device,
}) {
  await openAuthenticatedProfile(commandRunner, adbPath, device);
  let hierarchy = await findByScrolling(
    commandRunner,
    adbPath,
    device,
    'Hilfe-Center',
  );
  tapNode(
    commandRunner,
    adbPath,
    device,
    exactNamedNode(hierarchy, 'Hilfe-Center'),
    'Hilfe-Center',
  );
  hierarchy = await waitForUi(
    commandRunner,
    adbPath,
    device,
    (value) => currentHeadAndroidNamedNodes(value, 'Hilfe-Center').length > 0,
    'help center',
  );
  hierarchy = await findByScrolling(
    commandRunner,
    adbPath,
    device,
    'Meine Support-Fälle',
  );
  tapNode(
    commandRunner,
    adbPath,
    device,
    exactNamedNode(hierarchy, 'Meine Support-Fälle'),
    'Meine Support-Fälle',
  );
  hierarchy = await waitForUi(
    commandRunner,
    adbPath,
    device,
    (value) => currentHeadAndroidNamedNodes(value, 'Meine Support-Fälle').length > 0
      && supportCaseCardNodes(value).length > 0,
    'owned support list',
  );
  const cards = supportCaseCardNodes(hierarchy);
  if (cards.length !== 1) fail('The current-candidate support card is missing or ambiguous.');
  tapNode(commandRunner, adbPath, device, cards[0], 'owned support case');
  hierarchy = await waitForUi(
    commandRunner,
    adbPath,
    device,
    (value) => ['Aktueller Stand', 'Testmodus', 'Verlauf', 'Fall eingegangen']
      .every((label) => currentHeadAndroidNamedNodes(value, label).length > 0),
    'owned support detail',
    60,
  );
  if (currentHeadAndroidNamedNodes(hierarchy, 'Support-Fall nicht verfügbar').length > 0
      || currentHeadAndroidNamedNodes(hierarchy, 'Nachrichten').length > 0) {
    fail('The current-candidate support detail contradicts the expected retained state.');
  }
  return Object.freeze({
    supportListLoaded: true,
    exactOwnedCaseCardCount: 1,
    supportDetailLoaded: true,
    receivedStatusVisible: true,
    simulationDisclosureVisible: true,
    timelineVisible: true,
    publicMessageSectionAbsent: true,
    errorSurfaceAbsent: true,
  });
}

export function buildWp48SupportReadinessEvidence({
  candidate,
  device,
  sourceDrift,
  api,
  pixel,
  capturedAt = new Date().toISOString(),
}) {
  if (candidate?.applicationId !== applicationId
      || candidate?.buildNumber !== expectedBuildNumber
      || candidate?.commit !== expectedCandidateCommit
      || candidate?.releaseChannel !== 'internal'
      || candidate?.apiBaseUrl !== apiBaseUrl
      || sourceDrift?.mobileSourceChanged !== false
      || device?.physical !== true
      || device?.model !== 'Pixel 7 Pro'
      || api?.exactRetainedSimulationCaseCount !== 1
      || api?.status !== 'received'
      || api?.eventCount !== 1
      || api?.publicMessageCount !== 0
      || api?.nextUpdateOverdue !== true
      || api?.renterCaseCount !== 0
      || api?.renterDirectRead !== '404-support_case_not_found'
      || api?.ownerAdminRead !== '403-forbidden'
      || api?.renterAdminRead !== '403-forbidden'
      || api?.authorizedStaffIdentityAvailable !== false
      || api?.staffMutationAttempted !== false
      || api?.diagnosticSessionsRevoked !== true
      || pixel?.supportListLoaded !== true
      || pixel?.exactOwnedCaseCardCount !== 1
      || pixel?.supportDetailLoaded !== true
      || pixel?.receivedStatusVisible !== true
      || pixel?.simulationDisclosureVisible !== true
      || pixel?.timelineVisible !== true
      || pixel?.publicMessageSectionAbsent !== true
      || pixel?.errorSurfaceAbsent !== true) {
    fail('WP48 support-readiness evidence is incomplete or contradictory.');
  }
  const evidence = {
    schemaVersion: 1,
    kind: 'sit-wp48-current-candidate-support-followup-readiness',
    status: 'passed-current-candidate-read-staff-action-blocked-no-mutation',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      apkSha256: candidate.android.apkSha256,
      mobileSourceChangedAfterCandidate: false,
    },
    device,
    api,
    pixel,
    nextAction: {
      gate: 'authorized-elevated-staff-identity-required',
      existingCaseMustRemainTarget: true,
      createSecondCase: false,
      mutateExistingCaseWithoutStaff: false,
    },
    boundaries: {
      readOnly: true,
      supportCaseCreated: false,
      supportCaseChanged: false,
      staffMessageCreated: false,
      staffMessagePublished: false,
      existingOverdueCaseChanged: false,
      accountChanged: false,
      applicationRuntimeChanged: false,
      backendRuntimeChanged: false,
      deploymentChanged: false,
      productionChanged: false,
      googlePlayChanged: false,
      paymentChanged: false,
      onePlusContacted: false,
      containsAccountIdentity: false,
      containsCaseIdentity: false,
      containsCredential: false,
      containsToken: false,
      containsRawDeviceIdentifier: false,
      containsPrivateFilesystemPath: false,
    },
  };
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|SIT-[A-HJ-NP-Z2-9]{12})/iu.test(JSON.stringify(evidence))) {
    fail('WP48 evidence contains private or case-identifying material.');
  }
  return evidence;
}

export function parseWp48Arguments(values) {
  const result = { candidateDirectory: null, vaultFile: null, adbPath: 'adb' };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--candidate-dir') result.candidateDirectory = values[++index] ?? fail('--candidate-dir requires a path.');
    else if (value === '--vault') result.vaultFile = values[++index] ?? fail('--vault requires a path.');
    else if (value === '--adb') result.adbPath = values[++index] ?? fail('--adb requires a path.');
    else fail(`Unknown argument: ${value}`);
  }
  if (result.candidateDirectory === null || result.vaultFile === null) {
    fail('--candidate-dir and --vault are required.');
  }
  return result;
}

async function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const args = parseWp48Arguments(process.argv.slice(2));
  const archive = await validatePrivateAndroidReleaseArchive({
    root,
    candidateDirectory: resolve(args.candidateDirectory),
  });
  const candidate = validateCurrentPrivateAndroidCandidate(archive);
  const sourceDrift = assertCurrentCandidateNoPostCandidateMobileSourceDrift(
    collectCurrentCandidateDriftPaths({ root, candidateCommit: candidate.commit }),
  );
  const { vault } = readEmailVerifiedJourneyVault(resolve(args.vaultFile));
  const api = await inspectCurrentCandidateSupportApi({ accounts: vault.accounts });
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const deviceRef = selectSinglePhysicalDevice(parseAdbDevices(
    commandRunner(args.adbPath, ['devices', '-l']),
  ));
  const device = inspectPhysicalDevice({ adbPath: args.adbPath, device: deviceRef });
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, args.adbPath, deviceRef);
  verifyCurrentHeadAndroidInstalledCandidate(
    commandRunner,
    args.adbPath,
    deviceRef,
    candidate,
  );
  let pixel;
  try {
    pixel = await inspectCurrentCandidateSupportPixel({
      commandRunner,
      adbPath: args.adbPath,
      device: deviceRef,
    });
  } finally {
    restoreCurrentHeadAndroidExplore(commandRunner, args.adbPath, deviceRef);
  }
  process.stdout.write(`${JSON.stringify(buildWp48SupportReadinessEvidence({
    candidate,
    device,
    sourceDrift,
    api,
    pixel,
  }), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP48 support readiness failed.'}\n`);
    process.exitCode = 1;
  }
}
