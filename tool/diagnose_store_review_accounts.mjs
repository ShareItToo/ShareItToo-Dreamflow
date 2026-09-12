#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const defaultVaultRoot = join(
  homedir(),
  'Library',
  'Application Support',
  'ShareItToo',
  'qa',
  'staging-accounts',
);

function fail(message) {
  throw new Error(message);
}

function safeFixtureIdentifier(value, label) {
  if (typeof value !== 'string'
      || value.length < 1
      || value.length > 120
      || !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    fail(`The ${label} is not a safe fixture identifier.`);
  }
  return value;
}

function assertPrivateExternalFile(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    fail('The review account vault must be an absolute path.');
  }
  const canonical = realpathSync(value);
  const repositoryRelative = relative(repositoryRoot, canonical);
  if (repositoryRelative === ''
      || (!repositoryRelative.startsWith('..') && !isAbsolute(repositoryRelative))) {
    fail('The review account vault must remain outside the repository.');
  }
  const stat = lstatSync(canonical);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail('The review account vault must be a private, regular file.');
  }
  return canonical;
}

export function parseEligibleVault(value) {
  let vault;
  try {
    vault = JSON.parse(readFileSync(assertPrivateExternalFile(value), 'utf8'));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The review account vault')) throw error;
    fail('The review account vault is invalid.');
  }
  const bindingFixture = vault?.syntheticBooking;
  const simulationFixture = vault?.nonBindingSimulation;
  const fixtureKind = vault?.status === 'synthetic-booking-active'
    && bindingFixture
    && ['accepted', 'active'].includes(bindingFixture.workflowStatus)
    && bindingFixture.paymentMode === 'memory'
    && bindingFixture.stripeLivemode === false
    && bindingFixture.paymentEndpointCalled === false
    ? 'binding-staging-fixture'
    : vault?.status === 'non-binding-simulation-active'
      && simulationFixture?.status === 'accepted-chat-ready'
      && simulationFixture.availabilityUnaffected === true
      && simulationFixture.paymentReadRejected === true
      && simulationFixture.inAppNotificationsVerified === true
      && simulationFixture.stripeLivemode === false
      && simulationFixture.paymentEndpointCalled === false
      ? 'non-binding-staging-simulation'
      : null;
  const fixture = fixtureKind === 'binding-staging-fixture'
    ? bindingFixture
    : simulationFixture;
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || fixtureKind === null
      || !Array.isArray(vault.accounts)
      || vault.accounts.length !== 2) {
    fail('The vault is not an eligible isolated Staging review fixture.');
  }
  const accounts = new Map();
  for (const account of vault.accounts) {
    if (!['owner', 'renter'].includes(account?.role)
        || accounts.has(account.role)
        || account.registrationStatus !== 'accepted'
        || !['fixture-verified', 'email-link-verified'].includes(account.verificationStatus)
        || typeof account.email !== 'string'
        || typeof account.password !== 'string'
        || account.email.length < 3
        || account.password.length < 12) {
      fail('The vault does not contain exactly two verified synthetic review roles.');
    }
    accounts.set(account.role, account);
  }
  if (accounts.size !== 2) fail('The vault does not contain both synthetic review roles.');
  return {
    vault,
    accounts,
    fixtureKind,
    fixture: {
      listingId: safeFixtureIdentifier(fixture.listingId, 'listing fixture'),
      bookingId: safeFixtureIdentifier(fixture.bookingId, 'booking fixture'),
      threadId: safeFixtureIdentifier(fixture.threadId, 'thread fixture'),
      workflowStatus: fixtureKind === 'binding-staging-fixture'
        ? fixture.workflowStatus
        : 'accepted',
    },
  };
}

function regularFilesBelow(root, depth = 0) {
  if (depth > 2) return [];
  const canonicalRoot = realpathSync(root);
  const output = [];
  for (const entry of readdirSync(canonicalRoot, { withFileTypes: true })) {
    const entryPath = join(canonicalRoot, entry.name);
    const entryStat = lstatSync(entryPath);
    if (entryStat.isSymbolicLink()) continue;
    if (entry.isDirectory()) output.push(...regularFilesBelow(entryPath, depth + 1));
    else if (entry.isFile() && entry.name.endsWith('.json')) output.push(entryPath);
  }
  return output;
}

export function selectLatestEligibleVault(vaultRoot) {
  const canonicalRoot = realpathSync(resolve(vaultRoot));
  const rootRelative = relative(repositoryRoot, canonicalRoot);
  if (rootRelative === '' || (!rootRelative.startsWith('..') && !isAbsolute(rootRelative))) {
    fail('The review account vault root must remain outside the repository.');
  }
  const eligible = [];
  for (const file of regularFilesBelow(canonicalRoot)) {
    try {
      eligible.push({ file, parsed: parseEligibleVault(file), mtimeMs: statSync(file).mtimeMs });
    } catch {
      // Other isolated runs may be partial or intentionally completed.
    }
  }
  eligible.sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!eligible.length) fail('No eligible private Staging review role set was found.');
  return eligible[0].parsed;
}

async function request(fetchImpl, path, { method = 'GET', token, body } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging API path is invalid.');
  }
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    fail(`Staging ${method} request did not return JSON.`);
  }
  if (response.status !== 200) fail(`Staging ${method} request failed with HTTP ${response.status}.`);
  return value;
}

function hasInteractiveChallenge(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => (
    /otp|challenge|two.?factor|mfa/i.test(key) && entry !== false && entry !== null && entry !== ''
  ));
}

async function login(fetchImpl, account) {
  const session = await request(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (hasInteractiveChallenge(session)) {
    fail(`The ${account.role} review login unexpectedly requires an interactive challenge.`);
  }
  if (typeof session?.accessToken !== 'string' || session.accessToken.length < 20) {
    fail(`The ${account.role} review login did not return a usable session.`);
  }
  return session.accessToken;
}

function assertReviewUser(payload, role) {
  const user = payload?.user;
  if (!user || user.accountStatus !== 'active' || user.isDeactivated !== false
      || user.emailVerified !== true || user.termsAccepted !== true
      || user.privacyAccepted !== true || user.minimumAgeConfirmed !== true) {
    fail(`The ${role} review account is not active, verified, and fully consented.`);
  }
}

export async function diagnoseStoreReviewAccounts({
  vaultRoot = defaultVaultRoot,
  vaultFile = null,
  fetchImpl = globalThis.fetch,
  capturedAt = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  if (!(capturedAt instanceof Date) || !Number.isFinite(capturedAt.getTime())) {
    fail('The evidence timestamp is invalid.');
  }
  const selected = vaultFile ? parseEligibleVault(vaultFile) : selectLatestEligibleVault(vaultRoot);
  const ownerToken = await login(fetchImpl, selected.accounts.get('owner'));
  const renterToken = await login(fetchImpl, selected.accounts.get('renter'));

  const [ownerMe, renterMe, ownerListings, ownerRequests, renterRequests, ownerThreads, renterThreads] =
    await Promise.all([
      request(fetchImpl, '/auth/me', { token: ownerToken }),
      request(fetchImpl, '/auth/me', { token: renterToken }),
      request(fetchImpl, '/listings/mine', { token: ownerToken }),
      request(fetchImpl, '/rental-requests', { token: ownerToken }),
      request(fetchImpl, '/rental-requests', { token: renterToken }),
      request(fetchImpl, '/message-threads', { token: ownerToken }),
      request(fetchImpl, '/message-threads', { token: renterToken }),
    ]);
  assertReviewUser(ownerMe, 'owner');
  assertReviewUser(renterMe, 'renter');

  const listingVisible = Array.isArray(ownerListings?.listings)
    && ownerListings.listings.some((entry) => entry?.id === selected.fixture.listingId && entry?.isActive !== false);
  const ownerBooking = Array.isArray(ownerRequests?.requests)
    ? ownerRequests.requests.find((entry) => entry?.id === selected.fixture.bookingId)
    : null;
  const renterBooking = Array.isArray(renterRequests?.requests)
    ? renterRequests.requests.find((entry) => entry?.id === selected.fixture.bookingId)
    : null;
  const safeSimulationBooking = (booking) => (
    booking?.workflowStatus === 'accepted'
    && booking.simulationOnly === true
    && booking.platformContract == null
    && booking.bindingExpiresAt == null
    && booking.contractCreated === false
    && booking.paymentCreated === false
    && booking.reservationCreated === false
    && booking.monetaryEffectMinor === 0
  );
  const expectedBookingVisible = (booking) => (
    booking?.workflowStatus === selected.fixture.workflowStatus
    && (selected.fixtureKind === 'binding-staging-fixture' || safeSimulationBooking(booking))
  );
  const ownerBookingVisible = expectedBookingVisible(ownerBooking);
  const renterBookingVisible = expectedBookingVisible(renterBooking);
  const ownerThreadVisible = Array.isArray(ownerThreads?.threads)
    && ownerThreads.threads.some((entry) => entry?.id === selected.fixture.threadId);
  const renterThreadVisible = Array.isArray(renterThreads?.threads)
    && renterThreads.threads.some((entry) => entry?.id === selected.fixture.threadId);
  const missingSurfaces = [
    !listingVisible && 'owner listing',
    !ownerBookingVisible && 'owner booking',
    !renterBookingVisible && 'renter booking',
    !ownerThreadVisible && 'owner chat',
    !renterThreadVisible && 'renter chat',
  ].filter(Boolean);
  if (missingSurfaces.length) {
    const observedBookingStates = [ownerBooking?.workflowStatus, renterBooking?.workflowStatus]
      .filter((value) => typeof value === 'string' && /^[a-z]+$/.test(value));
    const stateNote = observedBookingStates.length
      ? ` Observed booking state: ${[...new Set(observedBookingStates)].join(', ')}.`
      : '';
    fail(`The prepared review fixture is not visible on: ${missingSurfaces.join(', ')}.${stateNote}`);
  }

  const [ownerMessages, renterMessages] = await Promise.all([
    request(fetchImpl, `/message-threads/${encodeURIComponent(selected.fixture.threadId)}/messages`, { token: ownerToken }),
    request(fetchImpl, `/message-threads/${encodeURIComponent(selected.fixture.threadId)}/messages`, { token: renterToken }),
  ]);
  if (!Array.isArray(ownerMessages?.messages) || !Array.isArray(renterMessages?.messages)) {
    fail('The prepared review chat is not readable by both roles.');
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'store-review-access-diagnostic',
    status: 'technical-review-access-passed-store-fields-pending',
    capturedAt: capturedAt.toISOString(),
    clientCandidate: {
      scope: 'api-only',
      binding: 'not-performed',
    },
    roles: ['owner', 'renter'],
    checks: {
      isolatedStagingFixture: true,
      ownerPasswordLoginWithoutOtp: true,
      renterPasswordLoginWithoutOtp: true,
      ownerActiveVerifiedAndConsented: true,
      renterActiveVerifiedAndConsented: true,
      ownerListingVisible: true,
      acceptedBookingVisibleToBothRoles: true,
      sharedChatVisibleToBothRoles: true,
      sharedChatReadableByBothRoles: true,
      nonBindingSimulationSafety: selected.fixtureKind === 'non-binding-staging-simulation',
    },
    fixture: {
      kind: selected.fixtureKind,
    },
    environment: {
      apiBaseUrl: stagingApiBaseUrl,
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
    boundaries: {
      productDataReadOnly: true,
      businessDataMutations: false,
      authenticationSessionsCreated: true,
      containsSecrets: false,
      containsEmailAddresses: false,
      containsTokens: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
      syntheticAccountsOnly: true,
      contractCreated: selected.fixtureKind === 'binding-staging-fixture',
      reservationCreated: selected.fixtureKind === 'binding-staging-fixture',
      publicStoreChanged: false,
      productionChanged: false,
    },
  });
}

function cliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--vault-root' && argv[index + 1]) options.vaultRoot = resolve(argv[++index]);
    else if (argv[index] === '--vault-file' && argv[index + 1]) options.vaultFile = resolve(argv[++index]);
    else fail(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  diagnoseStoreReviewAccounts(cliOptions(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
