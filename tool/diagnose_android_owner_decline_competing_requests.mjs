#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
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
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertCurrentHeadAndroidDeviceAlreadyUnlocked,
  currentHeadAndroidAdb,
  currentHeadAndroidNamedNodes,
  defaultCurrentHeadAndroidCommandRunner,
  dumpCurrentHeadAndroidUi,
  verifyCurrentHeadAndroidInstalledCandidate,
} from './diagnose_current_head_android_main_navigation.mjs';
import {
  bindExactRole,
  containsAllLabels,
  restoreExactRoleWithBoundedRetries,
  tapLabel,
  waitForHierarchy,
} from './diagnose_android_email_verified_two_role_product_journey.mjs';
import {
  inspectPhysicalDevice,
  parseAdbDevices,
  selectSinglePhysicalDevice,
} from './prepare_android_device_test.mjs';
import {
  activateStagingEmailVerifiedJourneyFixture,
  prepareStagingEmailVerifiedTwoRoleJourney,
  readEmailVerifiedJourneyVault,
  retireStagingEmailVerifiedTwoRoleJourney,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  validatePrivateAndroidReleaseArchive,
} from './validate_current_head_android_release_archive.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

function fail(message) {
  throw new Error(message);
}

function sanitizedFailure(error) {
  const detail = typeof error?.message === 'string' ? error.message.trim() : '';
  if (detail.length === 0 || detail.length > 240
      || /(?:@|https?:\/\/|\/Users\/|password|secret|token|credential|private.?key|api.?key|otp|pin)/iu.test(detail)
      || !/^[A-Za-z0-9_ .,:;()[\]'-]+$/u.test(detail)) {
    return 'safe diagnostic reason unavailable';
  }
  return detail;
}

function privateInputFile(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    fail(`${label} must be an absolute path.`);
  }
  const canonical = realpathSync(value);
  const rel = relative(repositoryRoot, canonical);
  const stat = statSync(canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
      || !stat.isFile() || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be an owner-only regular file outside the repository.`);
  }
  return canonical;
}

function privateDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    fail('The private diagnostic directory must be absolute.');
  }
  const absolute = resolve(value);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail('The private diagnostic directory must remain outside the repository.');
  }
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  const canonical = realpathSync(absolute);
  const rel = relative(repositoryRoot, canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail('The private diagnostic directory must remain outside the repository.');
  }
  if ((statSync(canonical).mode & 0o077) !== 0) {
    fail('The private diagnostic directory is not owner-only.');
  }
  return canonical;
}

function readPrivateJson(value, label) {
  const canonical = privateInputFile(value, label);
  let descriptor;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail(`${label} is not owner-only.`);
    return { canonical, value: JSON.parse(readFileSync(descriptor, 'utf8')) };
  } catch (error) {
    if (String(error?.message ?? '').startsWith(label)) throw error;
    fail(`${label} is invalid.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writePrivateJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function validCompetingAccount(account) {
  return account?.role === 'renter'
    && typeof account.displayName === 'string'
    && account.displayName.trim().length >= 2
    && typeof account.email === 'string'
    && account.email.includes('@')
    && typeof account.password === 'string'
    && account.password.length >= 12
    && account.registrationStatus === 'accepted'
    && account.verificationStatus === 'fixture-verified';
}

function readCompetingAccount(vaultFile) {
  const { canonical, value: vault } = readPrivateJson(
    vaultFile,
    'The private competing-role vault',
  );
  if (vault?.schemaVersion !== 1
      || vault.kind !== 'sit-staging-synthetic-account-vault'
      || vault.apiBaseUrl !== stagingApiBaseUrl
      || vault.stripeLivemode !== false
      || vault.containsProductionCredentials !== false
      || vault.verificationMethod !== 'isolated-staging-fixture'
      || vault.status !== 'non-binding-simulation-retired'
      || vault.nonBindingSimulation?.status !== 'retired'
      || vault.nonBindingSimulation?.workflowStatus !== 'cancelled'
      || vault.nonBindingSimulation?.paymentEndpointCalled !== false
      || vault.nonBindingSimulation?.stripeLivemode !== false
      || !Array.isArray(vault.accounts)
      || vault.accounts.filter(validCompetingAccount).length !== 1) {
    fail('The private competing-role vault is not an exact retired Staging fixture.');
  }
  return { canonical, account: vault.accounts.find(validCompetingAccount) };
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value)
    ? value
    : null;
}

async function apiRequest(fetchImpl, path, {
  method = 'GET', token = null, body = undefined, headers = {}, expected = [200],
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging request path is invalid.');
  }
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  if (!expected.includes(response.status)) {
    const code = safeError(value?.error);
    fail(`Staging request failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return value;
}

async function login(fetchImpl, account) {
  const value = await apiRequest(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (typeof value?.accessToken !== 'string' || value.accessToken.length < 20) {
    fail('A private Staging role did not receive a usable session.');
  }
  const me = await apiRequest(fetchImpl, '/auth/me', { token: value.accessToken });
  if (typeof me?.user?.id !== 'string' || me.user.id.length === 0
      || String(me.user.email ?? '').toLowerCase() !== account.email.toLowerCase()) {
    fail('A private Staging session did not bind to the expected principal.');
  }
  return { token: value.accessToken, userId: me.user.id };
}

function dateOnly(now, daysFromNow) {
  return new Date(now.getTime() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function exactSimulation(booking, status) {
  return booking?.workflowStatus === status
    && booking.simulationOnly === true
    && booking.platformContract == null
    && booking.bindingExpiresAt == null
    && booking.contractCreated === false
    && booking.paymentCreated === false
    && booking.reservationCreated === false
    && booking.monetaryEffectMinor === 0;
}

function exactRequest(value, bookingId) {
  return Array.isArray(value?.requests)
    ? value.requests.find((entry) => entry?.id === bookingId)
    : null;
}

async function notificationVisible(fetchImpl, token, bookingId, wait) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = await apiRequest(fetchImpl, '/notifications?limit=100', { token });
    if (Array.isArray(value?.notifications) && value.notifications.some((entry) => (
      entry?.entityId === bookingId
      && entry?.kind === 'booking_declined'
      && entry?.payload?.simulationOnly === true
    ))) return true;
    await wait(250);
  }
  return false;
}

async function createCompetingRequests({
  vaultFile,
  competingVaultFile,
  fetchImpl,
  now,
  random,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  const primaryAccounts = new Map(vault.accounts.map((account) => [account.role, account]));
  const competing = readCompetingAccount(competingVaultFile).account;
  const identities = [
    ...vault.accounts.map((account) => account.email.toLowerCase()),
    competing.email.toLowerCase(),
  ];
  if (new Set(identities).size !== 3) {
    fail('The three Staging roles are not safely distinct.');
  }
  const [owner, primaryRenter, competingRenter] = await Promise.all([
    login(fetchImpl, primaryAccounts.get('owner')),
    login(fetchImpl, primaryAccounts.get('renter')),
    login(fetchImpl, competing),
  ]);
  if (new Set([owner.userId, primaryRenter.userId, competingRenter.userId]).size !== 3) {
    fail('The three Staging roles do not resolve to distinct principals.');
  }
  const listingId = vault.realTwoRoleJourney?.listingId;
  if (typeof listingId !== 'string' || vault.realTwoRoleJourney?.listingStatus !== 'active') {
    fail('The isolated listing is not active for competing requests.');
  }
  const dateRanges = [
    { startDate: dateOnly(now, 75), endDate: dateOnly(now, 77) },
    { startDate: dateOnly(now, 76), endDate: dateOnly(now, 78) },
  ];
  const bookingIds = [
    `sit-${vault.runId}-${random(4).toString('hex')}-decline-a`,
    `sit-${vault.runId}-${random(4).toString('hex')}-decline-b`,
  ];
  const renters = [primaryRenter, competingRenter];
  let createdCount = 0;
  try {
    for (let index = 0; index < bookingIds.length; index += 1) {
      const id = bookingIds[index];
      const { startDate, endDate } = dateRanges[index];
      const value = await apiRequest(fetchImpl, '/bookings', {
        method: 'POST',
        token: renters[index].token,
        headers: { 'Idempotency-Key': `${id}-create` },
        body: {
          id,
          itemId: listingId,
          startDate,
          endDate,
          privateStatusConfirmed: true,
          simulationOnly: true,
          simulationAcknowledged: true,
          clientBuild: 'internal-stage-a-competing-decline-v1',
        },
        expected: [201],
      });
      if (!exactSimulation(value?.booking, 'requested')) {
        fail('A competing request was not stored as a safe non-binding simulation.');
      }
      createdCount += 1;
    }
    const ownerTruth = await apiRequest(fetchImpl, '/rental-requests', { token: owner.token });
    const primaryTruth = await apiRequest(fetchImpl, '/rental-requests', {
      token: primaryRenter.token,
    });
    const competingTruth = await apiRequest(fetchImpl, '/rental-requests', {
      token: competingRenter.token,
    });
    if (!bookingIds.every((id) => exactSimulation(exactRequest(ownerTruth, id), 'requested'))
        || !exactSimulation(exactRequest(primaryTruth, bookingIds[0]), 'requested')
        || exactRequest(primaryTruth, bookingIds[1]) !== undefined
        || !exactSimulation(exactRequest(competingTruth, bookingIds[1]), 'requested')
        || exactRequest(competingTruth, bookingIds[0]) !== undefined) {
      fail('The competing requests are not exactly role-isolated.');
    }
  } catch (error) {
    for (let index = 0; index < createdCount; index += 1) {
      try {
        await apiRequest(
          fetchImpl,
          `/bookings/${encodeURIComponent(bookingIds[index])}/transitions`,
          {
            method: 'POST',
            token: renters[index].token,
            headers: { 'Idempotency-Key': `${bookingIds[index]}-partial-cleanup` },
            body: { status: 'cancelled' },
          },
        );
      } catch {
        // The outer journey will still retire the isolated listing safely.
      }
    }
    throw error;
  }
  return {
    owner,
    primaryRenter,
    competingRenter,
    listingId,
    bookingIds,
    dateRanges,
  };
}

async function declinePrimaryThroughPixel({
  vaultFile,
  state,
  commandRunner,
  adbPath,
  device,
  wait,
  privateArtifactDirectory,
}) {
  const { vault } = readEmailVerifiedJourneyVault(vaultFile);
  let phase = 'bind-owner';
  try {
    const owner = await bindExactRole({
      vault,
      role: 'owner',
      commandRunner,
      adbPath,
      device,
      wait,
    });
    phase = 'open-owner-requests';
    tapLabel(commandRunner, adbPath, device, owner.hierarchy, 'Mietanfragen');
    phase = 'wait-visible-request';
    let hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'owner competing requests',
      predicate: (value) => (
        currentHeadAndroidNamedNodes(value, vault.realTwoRoleJourney.title).length >= 2
      ),
    });
    phase = 'open-request-detail';
    tapLabel(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      vault.realTwoRoleJourney.title,
    );
    phase = 'wait-request-detail';
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'owner request detail',
      predicate: (value) => containsAllLabels(value, [
        vault.realTwoRoleJourney.title,
        'Ablehnen',
        'Akzeptieren',
      ]),
    });
    phase = 'open-decline-confirmation';
    tapLabel(commandRunner, adbPath, device, hierarchy, 'Ablehnen');
    phase = 'wait-decline-confirmation';
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'owner decline confirmation',
      predicate: (value) => containsAllLabels(value, ['Anfrage ablehnen?', 'Ablehnen']),
    });
    phase = 'submit-decline';
    tapLabel(commandRunner, adbPath, device, hierarchy, 'Ablehnen', { chooseLast: true });
    phase = 'wait-decline-success';
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'owner decline success',
      predicate: (value) => containsAllLabels(value, [
        'Du hast die Anfrage abgelehnt.',
        'Zu Abgeschlossene Vermietungen',
      ]),
    });
    phase = 'open-completed-from-success';
    tapLabel(
      commandRunner,
      adbPath,
      device,
      hierarchy,
      'Zu Abgeschlossene Vermietungen',
    );
    phase = 'wait-completed-request';
    hierarchy = await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'declined request completed surface',
      predicate: (value) => containsAllLabels(value, [
        vault.realTwoRoleJourney.title,
        'Pilot-Simulation',
      ]),
    });
    phase = 'open-remaining-requests-tab';
    tapLabel(commandRunner, adbPath, device, hierarchy, 'Mietanfragen');
    phase = 'wait-remaining-request';
    await waitForHierarchy({
      commandRunner,
      adbPath,
      device,
      wait,
      label: 'remaining competing request',
      predicate: (value) => (
        currentHeadAndroidNamedNodes(value, vault.realTwoRoleJourney.title).length === 1
      ),
    });
  } catch {
    try {
      const hierarchy = dumpCurrentHeadAndroidUi(commandRunner, adbPath, device);
      const screenshot = currentHeadAndroidAdb(
        commandRunner,
        adbPath,
        device,
        ['exec-out', 'screencap', '-p'],
        { binary: true },
      );
      writeFileSync(resolve(privateArtifactDirectory, 'ui-failure.xml'), hierarchy, {
        encoding: 'utf8',
        mode: 0o600,
      });
      writeFileSync(
        resolve(privateArtifactDirectory, 'ui-failure.png'),
        Buffer.from(screenshot),
        { mode: 0o600 },
      );
      writePrivateJson(resolve(privateArtifactDirectory, 'ui-failure-phase.json'), {
        schemaVersion: 1,
        phase,
        containsSecrets: false,
        repositoryEvidence: false,
      });
    } catch {
      // Private diagnostics are supplemental; cleanup remains mandatory.
    }
    fail(`The owner decline UI phase ${phase} failed safely.`);
  }
  return Object.freeze({
    status: 'pixel-owner-declined-one-competing-request',
    exactOwnerPrincipal: true,
    declineConfirmationObserved: true,
    remainingRequestStayedPendingInUi: true,
    declinedRequestMovedToCompletedInUi: true,
    containsAccountIdentity: false,
    containsFixtureIdentifiers: false,
  });
}

async function verifyCompetingOutcome({ state, fetchImpl, wait }) {
  const ownerTruth = await apiRequest(fetchImpl, '/rental-requests', { token: state.owner.token });
  const primaryTruth = await apiRequest(fetchImpl, '/rental-requests', {
    token: state.primaryRenter.token,
  });
  const competingTruth = await apiRequest(fetchImpl, '/rental-requests', {
    token: state.competingRenter.token,
  });
  const ownerBookings = state.bookingIds.map((id) => exactRequest(ownerTruth, id));
  const declinedIndex = ownerBookings.findIndex((entry) => exactSimulation(entry, 'declined'));
  const requestedIndex = ownerBookings.findIndex((entry) => exactSimulation(entry, 'requested'));
  const roleTruths = [primaryTruth, competingTruth];
  if (declinedIndex < 0 || requestedIndex < 0 || declinedIndex === requestedIndex
      || ownerBookings.filter((entry) => exactSimulation(entry, 'declined')).length !== 1
      || ownerBookings.filter((entry) => exactSimulation(entry, 'requested')).length !== 1
      || !state.bookingIds.every((id, index) => (
        exactSimulation(exactRequest(roleTruths[index], id), index === declinedIndex ? 'declined' : 'requested')
        && exactRequest(roleTruths[index], state.bookingIds[1 - index]) === undefined
      ))) {
    fail('The owner decline did not preserve exact three-principal server truth.');
  }
  const declinedRenter = declinedIndex === 0 ? state.primaryRenter : state.competingRenter;
  if (!await notificationVisible(
    fetchImpl,
    declinedRenter.token,
    state.bookingIds[declinedIndex],
    wait,
  )) {
    fail('The declined renter notification was not durably visible.');
  }
  return Object.freeze({
    status: 'competing-decline-server-truth-passed',
    declinedRequest: 'declined',
    untouchedCompetingRequest: 'requested',
    threePrincipalIsolation: true,
    renterNotification: 'passed',
    containsAccountIdentity: false,
    containsFixtureIdentifiers: false,
  });
}

async function cleanupCompetingFixture({ vaultFile, state, fetchImpl }) {
  if (state !== null) {
    for (let index = 0; index < state.bookingIds.length; index += 1) {
      const renter = index === 0 ? state.primaryRenter : state.competingRenter;
      const truth = await apiRequest(fetchImpl, '/rental-requests', { token: renter.token });
      const booking = exactRequest(truth, state.bookingIds[index]);
      if (booking?.workflowStatus === 'requested') {
        const declined = await apiRequest(
          fetchImpl,
          `/bookings/${encodeURIComponent(state.bookingIds[index])}/transitions`,
          {
            method: 'POST',
            token: state.owner.token,
            headers: { 'Idempotency-Key': `${state.bookingIds[index]}-cleanup-decline` },
            body: { status: 'declined' },
          },
        );
        if (!exactSimulation(declined?.booking, 'declined')) {
          fail('A remaining competing request did not retire safely.');
        }
      } else if (!exactSimulation(booking, 'declined')
          && !exactSimulation(booking, 'cancelled')) {
        fail('A competing request has an unsafe cleanup state.');
      }
    }
  }
  const retired = await retireStagingEmailVerifiedTwoRoleJourney({ vaultFile, fetchImpl });
  if (retired.status !== 'email-verified-two-role-product-journey-retired'
      || retired.listingEnded !== true
      || retired.publicCatalogEntryRemoved !== true) {
    fail('The competing-request listing did not retire safely.');
  }
  return Object.freeze({
    status: 'competing-decline-fixture-retired',
    bothRequestsTerminal: true,
    listingEnded: true,
    publicCatalogEntryRemoved: true,
  });
}

export async function runAndroidOwnerDeclineCompetingRequests({
  candidate,
  deviceSummary,
  operations,
  capturedAt = new Date().toISOString(),
} = {}) {
  const required = ['prepare', 'createRequests', 'declineThroughUi', 'verifyOutcome', 'cleanup', 'restoreOwner'];
  if (operations === null || typeof operations !== 'object'
      || required.some((key) => typeof operations[key] !== 'function')) {
    fail('The competing-request journey operations are incomplete.');
  }
  let prepared = null;
  let state = null;
  let ui = null;
  let outcome = null;
  let cleanup = null;
  let restored = false;
  let primaryFailure = null;
  let primaryPhase = null;
  let cleanupFailure = null;
  let activePhase = 'prepare';
  try {
    prepared = await operations.prepare();
    activePhase = 'create-requests';
    state = await operations.createRequests(prepared);
    activePhase = 'decline-ui';
    ui = await operations.declineThroughUi(prepared, state);
    activePhase = 'verify-outcome';
    outcome = await operations.verifyOutcome(prepared, state);
  } catch (error) {
    primaryFailure = error;
    primaryPhase = activePhase;
  } finally {
    if (prepared !== null) {
      try {
        cleanup = await operations.cleanup(prepared, state);
      } catch (error) {
        cleanupFailure = error;
      }
    }
    try {
      restored = await operations.restoreOwner(prepared) === true;
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (primaryFailure !== null) {
    fail(
      `Competing-request phase ${primaryPhase} failed safely: ${sanitizedFailure(primaryFailure)}.`
      + (cleanupFailure === null
        ? ''
        : ` Cleanup also failed safely: ${sanitizedFailure(cleanupFailure)}.`),
    );
  }
  if (cleanupFailure !== null) {
    fail(`Competing-request cleanup failed safely: ${sanitizedFailure(cleanupFailure)}.`);
  }
  if (prepared?.status !== 'isolated-product-journey-fixture-active'
      || ui?.status !== 'pixel-owner-declined-one-competing-request'
      || outcome?.status !== 'competing-decline-server-truth-passed'
      || cleanup?.status !== 'competing-decline-fixture-retired'
      || restored !== true) {
    fail('The competing-request journey did not close exactly.');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'android-pixel-owner-decline-competing-requests',
    status: 'passed-pixel-owner-decline-competing-requests',
    capturedAt,
    candidate: {
      applicationId: candidate.applicationId,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      commit: candidate.commit,
      releaseChannel: candidate.releaseChannel,
      apiBaseUrl: candidate.apiBaseUrl,
      firebaseConfigured: candidate.firebaseConfigured,
      apkSha256: candidate.apkSha256,
    },
    device: deviceSummary,
    tests: {
      exactThreePrincipals: 'passed',
      twoOverlappingNonBindingRequests: 'passed-requested',
      ownerDeclineThroughPixelUi: 'passed',
      declineConfirmation: 'passed',
      untouchedCompetingRequest: 'passed-still-requested',
      declinedRequestCompletedSurface: 'passed',
      roleIsolation: 'passed',
      renterNotification: 'passed',
      cleanup: 'passed-both-terminal-listing-ended',
      protectedOwnerSessionRestored: true,
    },
    boundaries: {
      physicalPixelOnly: true,
      onePlusContacted: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      monetaryEffectMinor: 0,
      contractCreated: false,
      reservationCreated: false,
      listingLeftActive: false,
      testBookingLeftActive: false,
      productionChanged: false,
      googlePlayChanged: false,
      publicRegistrationChanged: false,
      realMoneyUsed: false,
      containsAccountIdentity: false,
      containsSecrets: false,
      containsTokens: false,
      containsFixtureIdentifiers: false,
      containsRawDeviceIdentifiers: false,
      containsPrivateFilesystemPaths: false,
    },
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceVaultFile = resolve(
    argumentValue(args, '--source-vault-file') ?? fail('--source-vault-file is required.'),
  );
  const competingVaultFile = resolve(
    argumentValue(args, '--competing-vault-file') ?? fail('--competing-vault-file is required.'),
  );
  const candidateDirectory = resolve(
    argumentValue(args, '--candidate-dir') ?? fail('--candidate-dir is required.'),
  );
  const privateArtifactDirectory = privateDirectory(resolve(
    argumentValue(args, '--private-artifact-dir')
      ?? fail('--private-artifact-dir is required.'),
  ));
  const adbPath = argumentValue(args, '--adb') ?? 'adb';
  const candidate = await validatePrivateAndroidReleaseArchive({
    root: repositoryRoot,
    candidateDirectory,
  });
  const commandRunner = defaultCurrentHeadAndroidCommandRunner;
  const device = selectSinglePhysicalDevice(parseAdbDevices(commandRunner(adbPath, ['devices', '-l'])));
  const deviceSummary = inspectPhysicalDevice({ commandRunner, adbPath, device });
  if (deviceSummary.physical !== true
      || deviceSummary.model !== 'Pixel 7 Pro'
      || !/^google$/iu.test(String(deviceSummary.manufacturer ?? ''))) {
    fail('The competing-request journey requires the exact physical Pixel 7 Pro.');
  }
  assertCurrentHeadAndroidDeviceAlreadyUnlocked(commandRunner, adbPath, device);
  verifyCurrentHeadAndroidInstalledCandidate(commandRunner, adbPath, device, candidate);
  const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
  let preparedVaultFile = null;
  const journalFile = resolve(privateArtifactDirectory, 'journal.json');
  const operations = {
    prepare: async () => {
      const prepared = await prepareStagingEmailVerifiedTwoRoleJourney({ sourceVaultFile });
      preparedVaultFile = prepared.vaultFile;
      try {
        const active = await activateStagingEmailVerifiedJourneyFixture({
          vaultFile: preparedVaultFile,
        });
        writePrivateJson(journalFile, {
          schemaVersion: 1,
          status: 'fixture-active',
          preparedVaultFile,
          competingVaultFile: readCompetingAccount(competingVaultFile).canonical,
          containsSecrets: false,
          tokensPersisted: false,
        });
        return active;
      } catch (error) {
        try {
          await retireStagingEmailVerifiedTwoRoleJourney({ vaultFile: preparedVaultFile });
        } catch {
          fail('The competing-request preparation and its safe retirement both failed.');
        }
        throw error;
      }
    },
    createRequests: async () => {
      const state = await createCompetingRequests({
        vaultFile: preparedVaultFile,
        competingVaultFile,
        fetchImpl: globalThis.fetch,
        now: new Date(),
        random: randomBytes,
      });
      try {
        writePrivateJson(journalFile, {
          schemaVersion: 1,
          status: 'requests-created',
          preparedVaultFile,
          competingVaultFile: readCompetingAccount(competingVaultFile).canonical,
          listingId: state.listingId,
          bookingIds: state.bookingIds,
          containsSecrets: false,
          tokensPersisted: false,
        });
      } catch {
        // The private journal is recoverability metadata, not a runtime gate.
      }
      return state;
    },
    declineThroughUi: (_prepared, state) => declinePrimaryThroughPixel({
      vaultFile: preparedVaultFile,
      state,
      commandRunner,
      adbPath,
      device,
      wait,
      privateArtifactDirectory,
    }),
    verifyOutcome: (_prepared, state) => verifyCompetingOutcome({
      state,
      fetchImpl: globalThis.fetch,
      wait,
    }),
    cleanup: async (_prepared, state) => {
      const result = await cleanupCompetingFixture({
        vaultFile: preparedVaultFile,
        state,
        fetchImpl: globalThis.fetch,
      });
      writePrivateJson(journalFile, {
        schemaVersion: 1,
        status: 'retired',
        bothRequestsTerminal: true,
        listingEnded: true,
        containsSecrets: false,
        tokensPersisted: false,
      });
      return result;
    },
    restoreOwner: () => restoreExactRoleWithBoundedRetries({
      wait,
      operation: async () => {
        const source = readEmailVerifiedJourneyVault(sourceVaultFile).vault;
        const bound = await bindExactRole({
          vault: source,
          role: 'owner',
          commandRunner,
          adbPath,
          device,
          wait,
        });
        return currentHeadAndroidNamedNodes(bound.hierarchy, bound.account.displayName).length === 1
          && currentHeadAndroidNamedNodes(bound.hierarchy, bound.other.displayName).length === 0;
      },
    }),
  };
  const evidence = await runAndroidOwnerDeclineCompetingRequests({
    candidate,
    deviceSummary,
    operations,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${sanitizedFailure(error)}\n`);
    process.exitCode = 1;
  });
}
