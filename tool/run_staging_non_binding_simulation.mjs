#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const readyVaultStates = new Set([
  'fixture-verified-ready-for-login',
  'email-link-verified-ready-for-login',
  'synthetic-booking-active',
  'synthetic-booking-completed',
  'synthetic-booking-terminal',
  'non-binding-simulation-active',
  'non-binding-simulation-retired',
]);

function fail(message) {
  throw new Error(message);
}

function privateVaultFile(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    fail('The synthetic account vault must be an absolute path.');
  }
  const canonical = realpathSync(value);
  const rel = relative(repositoryRoot, canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail('The synthetic account vault must remain outside the repository.');
  }
  const stat = lstatSync(canonical);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail('The synthetic account vault must be a private, regular file.');
  }
  return canonical;
}

function readVault(vaultFile) {
  const path = privateVaultFile(vaultFile);
  let vault;
  try {
    vault = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail('The synthetic account vault is invalid.');
  }
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || !readyVaultStates.has(vault?.status)
      || !Array.isArray(vault?.accounts)
      || vault.accounts.length !== 2) {
    fail('The vault is not an isolated, verified Staging role set.');
  }
  const accounts = new Map();
  for (const account of vault.accounts) {
    if (!['owner', 'renter'].includes(account?.role)
        || typeof account?.email !== 'string'
        || typeof account?.password !== 'string'
        || account.email.length < 3
        || account.password.length < 12
        || accounts.has(account.role)) {
      fail('The vault does not contain exactly one valid account per synthetic role.');
    }
    accounts.set(account.role, account);
  }
  if (accounts.size !== 2) fail('The vault does not contain both synthetic roles.');
  return { path, vault, accounts };
}

function saveVault(path, vault) {
  writeFileSync(path, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function dateOnly(now, daysFromNow) {
  return new Date(now.getTime() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value)
    ? value
    : null;
}

async function request(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
  headers = {},
  expected = [200],
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging API path is invalid.');
  }
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
    fail(`Staging ${method} request failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return { status: response.status, value };
}

async function login(fetchImpl, account) {
  const { value } = await request(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (typeof value?.accessToken !== 'string' || value.accessToken.length < 20) {
    fail(`The ${account.role} Staging login did not return a usable session.`);
  }
  return value.accessToken;
}

async function notificationVisible(fetchImpl, token, bookingId, expectedKind, wait) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { value } = await request(fetchImpl, '/notifications?limit=100', { token });
    const found = Array.isArray(value?.notifications)
      ? value.notifications.find((entry) => (
          entry?.entityId === bookingId
          && entry?.kind === expectedKind
          && entry?.payload?.simulationOnly === true
          && String(entry?.title ?? '').startsWith('Pilot-Simulation · ')
        ))
      : null;
    if (found) return true;
    await wait(250);
  }
  return false;
}

function validateSimulationBooking(booking, expectedStatus) {
  if (booking?.simulationOnly !== true
      || booking?.workflowStatus !== expectedStatus
      || booking?.platformContract != null
      || booking?.bindingExpiresAt != null
      || booking?.contractCreated !== false
      || booking?.paymentCreated !== false
      || booking?.reservationCreated !== false
      || booking?.monetaryEffectMinor !== 0) {
    fail(`The non-binding simulation is not safely represented as ${expectedStatus}.`);
  }
}

export async function runStagingNonBindingSimulation({
  vaultFile,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  random = (size) => randomBytes(size),
  wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)),
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof random !== 'function' || typeof wait !== 'function') {
    fail('The simulation dependencies are invalid.');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The simulation timestamp is invalid.');
  }
  const { path: vaultPath, vault, accounts } = readVault(vaultFile);
  if (vault.nonBindingSimulation?.status === 'accepted-chat-ready') {
    fail('The vault already contains a completed non-binding simulation proof.');
  }
  const ownerToken = await login(fetchImpl, accounts.get('owner'));
  const renterToken = await login(fetchImpl, accounts.get('renter'));
  const { value: mine } = await request(fetchImpl, '/listings/mine', { token: ownerToken });
  const expectedTitle = `SIT Rollenprüfung ${vault.runId}`;
  const matchingListings = Array.isArray(mine?.listings)
    ? mine.listings.filter((listing) => listing?.title === expectedTitle && listing?.status === 'active')
    : [];
  if (matchingListings.length !== 1 || typeof matchingListings[0]?.id !== 'string') {
    fail('Exactly one active isolated Staging listing is required.');
  }
  const listingId = matchingListings[0].id;
  const startDate = dateOnly(now, 75);
  const endDate = dateOnly(now, 77);
  const bookingId = `sit-${vault.runId}-${random(4).toString('hex')}-simulation`;
  vault.nonBindingSimulation = {
    schemaVersion: 1,
    status: 'creation-pending',
    listingId,
    bookingId,
    startDate,
    endDate,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    createdAt: now.toISOString(),
  };
  vault.status = 'non-binding-simulation-active';
  saveVault(vaultPath, vault);

  const { value: created } = await request(fetchImpl, '/bookings', {
    method: 'POST',
    token: renterToken,
    headers: { 'Idempotency-Key': `${bookingId}-create` },
    body: {
      id: bookingId,
      itemId: listingId,
      startDate,
      endDate,
      privateStatusConfirmed: true,
      simulationOnly: true,
      simulationAcknowledged: true,
      clientBuild: 'internal-stage-a-simulation-v1',
    },
    expected: [201],
  });
  validateSimulationBooking(created?.booking, 'requested');
  vault.nonBindingSimulation.status = 'requested';
  saveVault(vaultPath, vault);

  const { value: ownerRequests } = await request(fetchImpl, '/rental-requests', {
    token: ownerToken,
  });
  const ownerRequest = Array.isArray(ownerRequests?.requests)
    ? ownerRequests.requests.find((entry) => entry?.id === bookingId)
    : null;
  validateSimulationBooking(ownerRequest, 'requested');

  const { value: availability } = await request(
    fetchImpl,
    `/listings/${encodeURIComponent(listingId)}/availability/check`,
    {
      method: 'POST',
      body: { startDate, endDate },
    },
  );
  if (availability?.available !== true) {
    fail('The simulation incorrectly reserved listing availability.');
  }

  const paymentRead = await request(
    fetchImpl,
    `/bookings/${encodeURIComponent(bookingId)}/payment`,
    { token: renterToken, expected: [409] },
  );
  if (safeError(paymentRead.value?.error) !== 'pilot_simulation_payment_forbidden') {
    fail('The simulation payment boundary did not fail closed.');
  }

  const { value: accepted } = await request(
    fetchImpl,
    `/bookings/${encodeURIComponent(bookingId)}/transitions`,
    {
      method: 'POST',
      token: ownerToken,
      headers: { 'Idempotency-Key': `${bookingId}-accepted` },
      body: { status: 'accepted' },
    },
  );
  validateSimulationBooking(accepted?.booking, 'accepted');

  const { value: renterRequests } = await request(fetchImpl, '/rental-requests', {
    token: renterToken,
  });
  const renterRequest = Array.isArray(renterRequests?.requests)
    ? renterRequests.requests.find((entry) => entry?.id === bookingId)
    : null;
  validateSimulationBooking(renterRequest, 'accepted');

  const { value: threadResult } = await request(
    fetchImpl,
    `/message-threads/booking/${encodeURIComponent(bookingId)}`,
    { method: 'POST', token: ownerToken, expected: [201] },
  );
  const threadId = threadResult?.thread?.id;
  if (typeof threadId !== 'string' || threadId.length < 1) {
    fail('The simulation chat thread was not created.');
  }
  const messageText = 'SIT Stage-A Testchat: unverbindliche Pilot-Simulation.';
  await request(fetchImpl, `/message-threads/${encodeURIComponent(threadId)}/messages`, {
    method: 'POST',
    token: ownerToken,
    headers: { 'Idempotency-Key': `${bookingId}-message` },
    body: { text: messageText },
    expected: [201],
  });
  const { value: renterThreads } = await request(fetchImpl, '/message-threads', {
    token: renterToken,
  });
  if (!Array.isArray(renterThreads?.threads)
      || !renterThreads.threads.some((entry) => entry?.id === threadId)) {
    fail('The simulation chat is not visible to the renter role.');
  }
  const { value: messages } = await request(
    fetchImpl,
    `/message-threads/${encodeURIComponent(threadId)}/messages`,
    { token: renterToken },
  );
  if (!Array.isArray(messages?.messages)
      || !messages.messages.some((entry) => entry?.text === messageText)) {
    fail('The simulation message is not visible to the renter role.');
  }

  const requestNotification = await notificationVisible(
    fetchImpl, ownerToken, bookingId, 'booking_requested', wait,
  );
  const acceptanceNotification = await notificationVisible(
    fetchImpl, renterToken, bookingId, 'booking_accepted', wait,
  );
  if (!requestNotification || !acceptanceNotification) {
    fail('The simulation in-app notifications were not durably visible.');
  }

  vault.nonBindingSimulation = {
    ...vault.nonBindingSimulation,
    status: 'accepted-chat-ready',
    threadId,
    acceptedAt: new Date().toISOString(),
    availabilityUnaffected: true,
    paymentReadRejected: true,
    inAppNotificationsVerified: true,
  };
  saveVault(vaultPath, vault);
  return Object.freeze({
    status: 'passed-staging-non-binding-simulation',
    workflow: Object.freeze(['requested', 'accepted']),
    roleVisibility: true,
    chatReady: true,
    availabilityUnaffected: true,
    paymentReadRejected: true,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    contractCreated: false,
    reservationCreated: false,
    monetaryEffectMinor: 0,
    inAppNotificationsVerified: true,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function retireStagingNonBindingSimulation({
  vaultFile,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('The simulation dependencies are invalid.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The simulation retirement timestamp is invalid.');
  }
  const { path: vaultPath, vault, accounts } = readVault(vaultFile);
  const fixture = vault.nonBindingSimulation;
  if (!fixture
      || !['accepted-chat-ready', 'retired'].includes(fixture.status)
      || typeof fixture.listingId !== 'string'
      || typeof fixture.bookingId !== 'string'
      || fixture.paymentEndpointCalled !== false
      || fixture.stripeLivemode !== false) {
    fail('The non-binding simulation retirement target is missing or unsafe.');
  }

  const [ownerToken, renterToken] = await Promise.all([
    login(fetchImpl, accounts.get('owner')),
    login(fetchImpl, accounts.get('renter')),
  ]);
  const { value: renterRequests } = await request(fetchImpl, '/rental-requests', {
    token: renterToken,
  });
  const booking = Array.isArray(renterRequests?.requests)
    ? renterRequests.requests.find((entry) => entry?.id === fixture.bookingId)
    : null;
  if (!booking) fail('The non-binding simulation booking is not server-visible.');
  if (booking.workflowStatus === 'accepted') {
    validateSimulationBooking(booking, 'accepted');
    const { value: cancelled } = await request(
      fetchImpl,
      `/bookings/${encodeURIComponent(fixture.bookingId)}/transitions`,
      {
        method: 'POST',
        token: renterToken,
        headers: { 'Idempotency-Key': `${fixture.bookingId}-retire` },
        body: { status: 'cancelled' },
      },
    );
    validateSimulationBooking(cancelled?.booking, 'cancelled');
  } else {
    validateSimulationBooking(booking, 'cancelled');
  }

  const { value: mine } = await request(fetchImpl, '/listings/mine', { token: ownerToken });
  const listing = Array.isArray(mine?.listings)
    ? mine.listings.find((entry) => entry?.id === fixture.listingId)
    : null;
  if (!listing
      || listing.title !== `SIT Rollenprüfung ${vault.runId}`) {
    fail('The non-binding simulation listing identity is not exact.');
  }
  if (listing.status === 'active' || listing.isActive !== false) {
    const { value: paused } = await request(
      fetchImpl,
      `/listings/${encodeURIComponent(fixture.listingId)}/status`,
      {
        method: 'PATCH',
        token: ownerToken,
        body: { status: 'paused' },
      },
    );
    if (paused?.listing?.status !== 'paused' || paused.listing.isActive !== false) {
      fail('The non-binding simulation listing was not paused safely.');
    }
  } else if (!['paused', 'ended'].includes(listing.status)) {
    fail('The non-binding simulation listing has an unsafe terminal state.');
  }

  const [{ value: verifiedRequests }, { value: verifiedMine }, { value: publicCatalog }] =
    await Promise.all([
      request(fetchImpl, '/rental-requests', { token: renterToken }),
      request(fetchImpl, '/listings/mine', { token: ownerToken }),
      request(fetchImpl, '/listings?limit=100&offset=0'),
    ]);
  const verifiedBooking = Array.isArray(verifiedRequests?.requests)
    ? verifiedRequests.requests.find((entry) => entry?.id === fixture.bookingId)
    : null;
  validateSimulationBooking(verifiedBooking, 'cancelled');
  const verifiedListing = Array.isArray(verifiedMine?.listings)
    ? verifiedMine.listings.find((entry) => entry?.id === fixture.listingId)
    : null;
  if (!verifiedListing
      || !['paused', 'ended'].includes(verifiedListing.status)
      || verifiedListing.isActive !== false) {
    fail('The non-binding simulation listing retirement is not server-confirmed.');
  }
  if ((publicCatalog?.listings ?? []).some((entry) => entry?.id === fixture.listingId)) {
    fail('The retired non-binding simulation remains visible in the public catalog.');
  }

  fixture.status = 'retired';
  fixture.workflowStatus = 'cancelled';
  fixture.listingStatus = verifiedListing.status;
  fixture.retiredAt = now.toISOString();
  vault.status = 'non-binding-simulation-retired';
  saveVault(vaultPath, vault);
  return Object.freeze({
    status: 'staging-non-binding-simulation-retired',
    bookingCancelled: true,
    listingPaused: verifiedListing.status === 'paused',
    listingEnded: verifiedListing.status === 'ended',
    publicCatalogEntryRemoved: true,
    contractCreated: false,
    reservationCreated: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    monetaryEffectMinor: 0,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

function parseArguments(values) {
  let vaultFile = null;
  let phase = 'run';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--vault-file') {
      vaultFile = values[index + 1] ?? fail('--vault-file requires a path.');
      index += 1;
    } else if (values[index] === '--phase') {
      phase = values[index + 1] ?? fail('--phase requires a value.');
      index += 1;
    } else {
      fail(`Unknown argument: ${values[index]}`);
    }
  }
  if (!vaultFile) fail('--vault-file is required.');
  if (!['run', 'retire'].includes(phase)) fail('--phase must be run or retire.');
  return { vaultFile, phase };
}

async function main() {
  const { phase, ...options } = parseArguments(process.argv.slice(2));
  const result = phase === 'retire'
    ? await retireStagingNonBindingSimulation(options)
    : await runStagingNonBindingSimulation(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  });
}
