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

import {
  privatePilotCheckoutDocument,
  privatePilotDeclarations,
  privatePilotDocument,
  privatePilotRequiredCheckoutDeclarations,
} from '../backend/src/private_pilot_domain.js';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const allowedTransitions = new Map([
  ['accepted', { role: 'owner', previous: 'requested', result: 'accepted' }],
  ['running', { role: 'renter', previous: 'accepted', result: 'active' }],
  ['completed', { role: 'owner', previous: 'active', result: 'completed' }],
]);
const terminalWorkflowStatuses = new Set(['completed', 'declined', 'cancelled', 'refunded']);

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
      || ![
        'fixture-verified-ready-for-login',
        'email-link-verified-ready-for-login',
        'synthetic-booking-active',
        'synthetic-booking-completed',
        'synthetic-booking-terminal',
        'non-binding-simulation-active',
      ].includes(vault?.status)
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

export function acceptanceTimestampForQuote(quote, observedAt = new Date()) {
  const issuedAt = Date.parse(quote?.quotedAt);
  const expiresAt = Date.parse(quote?.expiresAt);
  const observed = observedAt instanceof Date ? observedAt.getTime() : Number.NaN;
  if (!Number.isFinite(issuedAt)
      || !Number.isFinite(expiresAt)
      || !Number.isFinite(observed)
      || expiresAt <= issuedAt) {
    fail('The synthetic booking quote validity window is invalid.');
  }
  const acceptedAt = Math.max(observed, issuedAt);
  if (acceptedAt >= expiresAt) fail('The synthetic booking quote expired before acceptance.');
  return new Date(acceptedAt).toISOString();
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
      ...(body !== undefined && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  if (!expected.includes(response.status)) {
    const errorCode = typeof value?.error === 'string'
      && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.error)
      ? value.error
      : null;
    const requestId = typeof value?.requestId === 'string'
      && /^[A-Za-z0-9_.:-]{1,120}$/.test(value.requestId)
      ? value.requestId
      : null;
    fail(
      `Staging ${method} request failed with HTTP ${response.status}`
      + `${errorCode ? ` (${errorCode})` : ''}`
      + `${requestId ? ` [request ${requestId}]` : ''}.`,
    );
  }
  return value;
}

async function login(fetchImpl, account) {
  const session = await request(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (typeof session?.accessToken !== 'string' || session.accessToken.length < 20) {
    fail(`The ${account.role} Staging login did not return a usable session.`);
  }
  return session.accessToken;
}

async function retireUnbookedSyntheticListing({
  fetchImpl,
  ownerToken,
  renterToken,
  listingId,
}) {
  const renterRequests = await request(fetchImpl, '/rental-requests', {
    token: renterToken,
  });
  if ((renterRequests?.requests ?? []).some((entry) => entry?.itemId === listingId)) {
    fail('A failed synthetic booking request created server state that requires controlled reconciliation.');
  }
  const paused = await request(
    fetchImpl,
    `/listings/${encodeURIComponent(listingId)}/status`,
    {
      method: 'PATCH',
      token: ownerToken,
      body: { status: 'paused' },
    },
  );
  if (paused?.listing?.status !== 'paused' || paused.listing.isActive !== false) {
    fail('The unbooked synthetic listing was not paused after fixture preparation failed.');
  }
  const mine = await request(fetchImpl, '/listings/mine', { token: ownerToken });
  if ((mine?.listings ?? []).some((entry) => (
    entry?.id === listingId
      && (entry.status === 'active' || entry.isActive !== false)
  ))) {
    fail('The unbooked synthetic listing remained active after fixture preparation failed.');
  }
}

async function verifySyntheticBookingConfirmation({
  fetchImpl,
  accounts,
  fixture,
  segment,
}) {
  const presenterRole = segment === 'pickup' ? 'owner' : 'renter';
  const verifierRole = presenterRole === 'owner' ? 'renter' : 'owner';
  const presenterToken = await login(fetchImpl, accounts.get(presenterRole));
  const issued = await request(
    fetchImpl,
    `/bookings/${encodeURIComponent(fixture.bookingId)}/confirmation-challenges`,
    {
      method: 'POST',
      token: presenterToken,
      body: { segment },
      expected: [201],
    },
  );
  const qrPayload = issued?.challenge?.qrPayload;
  if (typeof qrPayload !== 'string'
      || !qrPayload.startsWith(`shareittoo:v3:${segment}:${presenterRole}:`)) {
    fail(`The synthetic ${segment} confirmation challenge is invalid.`);
  }
  const verifierToken = await login(fetchImpl, accounts.get(verifierRole));
  const verified = await request(
    fetchImpl,
    `/bookings/${encodeURIComponent(fixture.bookingId)}/confirmation-challenges/verify`,
    {
      method: 'POST',
      token: verifierToken,
      body: { qrPayload },
    },
  );
  if (verified?.confirmation?.verificationVersion !== 3
      || verified.confirmation.presenterRole !== presenterRole
      || verified.confirmation.confirmedByRole !== verifierRole) {
    fail(`The synthetic ${segment} confirmation was not verified safely.`);
  }
  return Object.freeze({
    status: 'passed',
    segment,
    presenterRole,
    verifierRole,
    verificationVersion: 3,
    containsConfirmationCode: false,
    containsFixtureIdentifiers: false,
  });
}

export async function createSyntheticBookingFixture({
  vaultFile,
  imagePath = resolve(repositoryRoot, 'assets/images/shareittoo_app_icon_master.png'),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  random = (size) => randomBytes(size),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('The fixture time is invalid.');
  const { path, vault, accounts } = readVault(vaultFile);
  if (vault.syntheticBooking && vault.syntheticBooking.workflowStatus !== 'cleaned') {
    fail('The vault already contains an active synthetic booking fixture.');
  }
  const ownerToken = await login(fetchImpl, accounts.get('owner'));
  const renterToken = await login(fetchImpl, accounts.get('renter'));

  const expectedTitle = `SIT Rollenprüfung ${vault.runId}`;
  const [mine, requests] = await Promise.all([
    request(fetchImpl, '/listings/mine', { token: ownerToken }),
    request(fetchImpl, '/rental-requests', { token: renterToken }),
  ]);
  const namedListings = Array.isArray(mine?.listings)
    ? mine.listings.filter((listing) => listing?.title === expectedTitle)
    : [];
  const matchingListings = namedListings.filter((listing) => (
    listing?.status !== 'paused'
    && listing?.status !== 'ended'
    && listing?.isActive !== false
  ));
  const matchingRequests = Array.isArray(requests?.requests)
    ? requests.requests.filter((booking) => (
        matchingListings.some((listing) => listing?.id === booking?.itemId)
        && booking?.workflowStatus === 'requested'
      ))
    : [];
  if (matchingListings.length === 1 && matchingRequests.length === 1) {
    const listing = matchingListings[0];
    const booking = matchingRequests[0];
    vault.syntheticBooking = {
      schemaVersion: 1,
      listingId: listing.id,
      bookingId: booking.id,
      title: expectedTitle,
      startDate: booking.startDate,
      endDate: booking.endDate,
      workflowStatus: 'requested',
      createdAt: booking.createdAt ?? now.toISOString(),
      recoveredAt: now.toISOString(),
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    };
    vault.status = 'synthetic-booking-active';
    saveVault(path, vault);
    return Object.freeze({
      status: 'synthetic-booking-requested',
      rolesLoggedIn: ['owner', 'renter'],
      listingCreated: true,
      bookingCreated: true,
      fixtureRecovered: true,
      workflowStatus: 'requested',
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
      containsSecrets: false,
      containsEmailAddresses: false,
      containsTokens: false,
    });
  }
  if (matchingListings.length > 1 || matchingRequests.length > 1
      || (matchingListings.length === 0 && matchingRequests.length !== 0)) {
    fail('A partial synthetic booking fixture requires controlled cleanup before retry.');
  }
  const recoveredListing = matchingListings.length === 1;
  const suffix = random(4).toString('hex');
  const listingId = recoveredListing
    ? safeFixtureIdentifier(matchingListings[0].id, 'recovered listing id')
    : `sit-${vault.runId}-${suffix}-listing`;
  const bookingId = `sit-${safeFixtureIdentifier(vault.runId, 'synthetic run id')}-${suffix}-booking`;
  const title = expectedTitle;
  const startDate = dateOnly(now, 60);
  const endDate = dateOnly(now, 62);
  let listingCreatedThisRun = false;
  try {
    if (!recoveredListing) {
      const imageBytes = readFileSync(resolve(imagePath));
      if (imageBytes.length < 100) fail('The synthetic listing image is invalid.');
      const form = new FormData();
      form.append('purpose', 'listing_image');
      form.append('file', new Blob([imageBytes], { type: 'image/png' }), 'sit-role-fixture.png');
      const upload = await request(fetchImpl, '/uploads', {
        method: 'POST',
        token: ownerToken,
        body: form,
        expected: [201],
      });
      if (typeof upload?.url !== 'string' || !upload.url.startsWith('https://')) {
        fail('The synthetic listing upload did not return a safe URL.');
      }
      await request(fetchImpl, '/listings', {
        method: 'POST',
        token: ownerToken,
        expected: [201],
        body: {
          id: listingId,
          title,
          description: 'Isoliertes Staging-Inserat für die ShareItToo Rollen- und Buchungsprüfung ohne Echtgeld.',
          categoryId: 'cat3',
          subcategory: 'Kameras',
          tags: ['sit', 'role-fixture'],
          pricePerDay: 12,
          priceRaw: 12,
          priceUnit: 'day',
          currency: 'EUR',
          deposit: null,
          photos: [upload.url],
          locationText: 'Staging Testadresse',
          city: 'Heilbronn',
          country: 'Deutschland',
          lat: 49.1427,
          lng: 9.2109,
          geohash: 'private',
          condition: 'good',
          minDays: 1,
          maxDays: 14,
          protectionModel: 'none',
          privateStatusConfirmed: true,
          status: 'active',
          isActive: true,
        },
      });
      listingCreatedThisRun = true;
      await request(fetchImpl, `/listings/${encodeURIComponent(listingId)}/availability`, {
        method: 'PUT',
        token: ownerToken,
        body: {
          timezone: 'Europe/Berlin',
          minimumDays: 1,
          maximumDays: 14,
          noticeHours: 0,
          acceptanceWindowMinutes: 30,
          rules: Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            localStart: '00:00',
            localEnd: '23:59',
            isAvailable: true,
          })),
          blocks: [],
        },
      });
    }
    const quote = await request(fetchImpl, '/bookings/quote', {
      method: 'POST',
      token: renterToken,
      body: {
        itemId: listingId,
        startDate,
        endDate,
        ownerDeliversAtDropoffChosen: false,
        ownerPicksUpAtReturnChosen: false,
        expressRequested: false,
      },
    });
    if (typeof quote?.quoteId !== 'string'
        || typeof quote?.quoteHash !== 'string'
        || !/^[0-9a-f]{64}$/.test(quote.quoteHash)) {
      fail('The synthetic booking quote is not immutably bound.');
    }
    // The server clock can be a few milliseconds ahead of this client even
    // after the quote response arrives. Clamp to the authoritative issued-at
    // value so a transport-timing skew cannot invalidate the V5.2 consent.
    const acceptedAt = acceptanceTimestampForQuote(quote);
    const clientBuild = 'synthetic-review-tool-v52';
    const legalDeclarations = privatePilotRequiredCheckoutDeclarations.map(
      ({ type, wording, documentReferences }) => ({
        type,
        exactWording: wording,
        documentName: privatePilotCheckoutDocument.name,
        documentVersion: privatePilotCheckoutDocument.version,
        clientBuild,
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash,
        documentReferences,
        language: privatePilotCheckoutDocument.locale,
        accepted: true,
        acceptedAt,
      }),
    );
    const created = await request(fetchImpl, '/bookings', {
      method: 'POST',
      token: renterToken,
      headers: { 'Idempotency-Key': `${bookingId}-create` },
      body: {
        id: bookingId,
        itemId: listingId,
        startDate,
        endDate,
        privateStatusConfirmed: true,
        clientBuild,
        quoteId: quote.quoteId,
        quoteHash: quote.quoteHash,
        legalDeclarations,
      },
      expected: [201],
    });
    if (created?.booking?.workflowStatus !== 'requested') {
      fail('The synthetic booking was not created in the requested state.');
    }
  } catch (error) {
    if (listingCreatedThisRun) {
      try {
        await retireUnbookedSyntheticListing({
          fetchImpl,
          ownerToken,
          renterToken,
          listingId,
        });
      } catch {
        fail('Synthetic booking preparation failed and the unbooked listing cleanup did not complete.');
      }
    }
    throw error;
  }

  vault.syntheticBooking = {
    schemaVersion: 1,
    listingId,
    bookingId,
    title,
    startDate,
    endDate,
    workflowStatus: 'requested',
    createdAt: now.toISOString(),
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  };
  vault.status = 'synthetic-booking-active';
  saveVault(path, vault);
  return Object.freeze({
    status: 'synthetic-booking-requested',
    rolesLoggedIn: ['owner', 'renter'],
    listingCreated: true,
    bookingCreated: true,
    fixtureRecovered: recoveredListing,
    workflowStatus: 'requested',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
  });
}

export async function transitionSyntheticBookingFixture({
  vaultFile,
  status,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  const transition = allowedTransitions.get(status);
  if (!transition) fail('The synthetic booking transition is invalid.');
  const { path, vault, accounts } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (!fixture || fixture.paymentEndpointCalled !== false || fixture.stripeLivemode !== false) {
    fail('The active synthetic booking fixture is missing or unsafe.');
  }
  if (fixture.workflowStatus !== transition.previous) {
    fail(`The synthetic booking is not ready for the ${status} transition.`);
  }
  let confirmation = null;
  if (status === 'running') {
    confirmation = await verifySyntheticBookingConfirmation({
      fetchImpl,
      accounts,
      fixture,
      segment: 'pickup',
    });
  } else if (status === 'completed') {
    confirmation = await verifySyntheticBookingConfirmation({
      fetchImpl,
      accounts,
      fixture,
      segment: 'return',
    });
  }
  const token = await login(fetchImpl, accounts.get(transition.role));
  const body = { status };
  if (status === 'accepted') {
    body.legalDeclarations = [{
      type: 'owner_booking_acceptance',
      exactWording: privatePilotDeclarations.ownerAcceptance,
      documentName: privatePilotDocument.name,
      documentVersion: privatePilotDocument.version,
      appVersion: 'synthetic-review-tool',
      language: privatePilotDocument.language,
      accepted: true,
      acceptedAt: now.toISOString(),
    }];
  }
  const result = await request(fetchImpl, `/bookings/${encodeURIComponent(fixture.bookingId)}/transitions`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `${fixture.bookingId}-${status}` },
    body,
  });
  if (result?.booking?.workflowStatus !== transition.result) {
    fail(`The synthetic booking did not reach ${transition.result}.`);
  }
  fixture.workflowStatus = transition.result;
  fixture.updatedAt = now.toISOString();
  if (status === 'completed') vault.status = 'synthetic-booking-completed';
  saveVault(path, vault);
  return Object.freeze({
    status: `synthetic-booking-${status}`,
    actingRole: transition.role,
    workflowStatus: transition.result,
    paymentMode: fixture.paymentMode,
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    ...(confirmation === null ? {} : { confirmation }),
  });
}

export async function retireSyntheticBookingFixture({
  vaultFile,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The synthetic fixture retirement timestamp is invalid.');
  }
  let current = readVault(vaultFile).vault.syntheticBooking?.workflowStatus;
  if (current === 'requested') {
    await transitionSyntheticBookingFixture({ vaultFile, status: 'accepted', fetchImpl, now });
    current = 'accepted';
  }
  if (current === 'accepted') {
    await transitionSyntheticBookingFixture({ vaultFile, status: 'running', fetchImpl, now });
    current = 'active';
  }
  if (current === 'active') {
    await transitionSyntheticBookingFixture({ vaultFile, status: 'completed', fetchImpl, now });
    current = 'completed';
  }
  const { path, vault, accounts } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (current !== 'completed'
      || fixture?.workflowStatus !== 'completed'
      || fixture?.paymentEndpointCalled !== false
      || fixture?.stripeLivemode !== false) {
    fail('Only a completed payment-free synthetic fixture can be retired.');
  }
  const ownerToken = await login(fetchImpl, accounts.get('owner'));
  await request(fetchImpl, `/listings/${encodeURIComponent(fixture.listingId)}/status`, {
    method: 'PATCH',
    token: ownerToken,
    body: { status: 'paused' },
  });
  fixture.listingStatus = 'paused';
  fixture.retiredAt = now.toISOString();
  saveVault(path, vault);
  return Object.freeze({
    status: 'synthetic-booking-retired',
    bookingCompleted: true,
    listingPaused: true,
    listingDeleted: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

const roleVisibilityExpectations = Object.freeze({
  requested: Object.freeze({
    actorRole: 'owner',
    result: 'requested-visible-to-owner',
  }),
  accepted: Object.freeze({
    actorRole: 'renter',
    result: 'accepted-visible-to-renter',
  }),
  active: Object.freeze({
    actorRole: 'renter',
    result: 'active-visible-to-renter',
  }),
  completed: Object.freeze({
    actorRole: 'renter',
    result: 'completed-visible-to-renter',
  }),
});

export async function inspectSyntheticBookingRoleVisibility({
  vaultFile,
  expectedStatus,
  fetchImpl = globalThis.fetch,
} = {}) {
  const expectation = roleVisibilityExpectations[expectedStatus];
  if (!expectation) fail('The synthetic booking visibility status is invalid.');
  const { vault, accounts } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (!fixture
      || fixture.workflowStatus !== expectedStatus
      || fixture.paymentMode !== 'memory'
      || fixture.paymentEndpointCalled !== false
      || fixture.stripeLivemode !== false) {
    fail('The synthetic booking is not ready for the requested role-visibility check.');
  }
  const token = await login(fetchImpl, accounts.get(expectation.actorRole));
  const result = await request(fetchImpl, '/rental-requests', { token });
  const booking = Array.isArray(result?.requests)
    ? result.requests.find((entry) => entry?.id === fixture.bookingId)
    : null;
  if (booking?.workflowStatus !== expectedStatus) {
    fail(`The ${expectedStatus} synthetic booking is not visible to the expected role.`);
  }
  return Object.freeze({
    status: 'passed',
    result: expectation.result,
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function inspectSyntheticReturnCaseRoleTruth({
  vaultFile,
  expectedEvidenceCount = 1,
  expectedContestedAuthorizedMinor = 100,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!Number.isSafeInteger(expectedEvidenceCount) || expectedEvidenceCount < 1) {
    fail('The expected synthetic return-case evidence count is invalid.');
  }
  if (!Number.isSafeInteger(expectedContestedAuthorizedMinor)
      || expectedContestedAuthorizedMinor < 1) {
    fail('The expected synthetic return-case amount is invalid.');
  }
  const { vault, accounts } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (!fixture
      || fixture.workflowStatus !== 'completed'
      || fixture.paymentMode !== 'memory'
      || fixture.paymentEndpointCalled !== false
      || fixture.stripeLivemode !== false) {
    fail('The synthetic booking is not ready for return-case truth inspection.');
  }
  const projections = [];
  for (const role of ['owner', 'renter']) {
    const token = await login(fetchImpl, accounts.get(role));
    const result = await request(fetchImpl, '/rental-requests', { token });
    const matches = Array.isArray(result?.requests)
      ? result.requests.filter((entry) => entry?.id === fixture.bookingId)
      : [];
    if (matches.length !== 1) {
      fail(`The synthetic return case is not exactly once visible to the ${role} role.`);
    }
    projections.push(matches[0]);
  }
  const exactFields = [
    'workflowStatus',
    'needsReview',
    'reviewSource',
    'returnState',
    'returnT0',
    'returnReportDeadline',
    'returnCaseOpenedAt',
    'contestedAuthorizedMinor',
    'undisputedReleasableMinor',
    'additionalChargeMinor',
  ];
  for (const field of exactFields) {
    if (JSON.stringify(projections[0]?.[field]) !== JSON.stringify(projections[1]?.[field])) {
      fail('The participant return-case projections do not agree on server-owned truth.');
    }
  }
  const [truth] = projections;
  const t0 = Date.parse(truth.returnT0);
  const openedAt = Date.parse(truth.returnCaseOpenedAt);
  const reportDeadline = Date.parse(truth.returnReportDeadline);
  const evidence = truth.reviewEvidenceReferences;
  if (truth.workflowStatus !== 'completed'
      || truth.needsReview !== true
      || truth.reviewSource !== 'v52_return_case'
      || truth.returnState !== 'needsReview'
      || !Number.isFinite(t0)
      || !Number.isFinite(openedAt)
      || !Number.isFinite(reportDeadline)
      || openedAt < t0
      || openedAt > reportDeadline
      || reportDeadline - t0 !== 48 * 60 * 60 * 1000
      || !Array.isArray(evidence)
      || evidence.length !== expectedEvidenceCount
      || evidence.some((entry) => !/^upload:[0-9a-f-]{36}$/iu.test(String(entry)))
      || truth.contestedAuthorizedMinor !== expectedContestedAuthorizedMinor
      || !Number.isSafeInteger(truth.undisputedReleasableMinor)
      || truth.undisputedReleasableMinor < 0
      || truth.additionalChargeMinor !== 0) {
    fail('The synthetic return-case server truth is incomplete or unsafe.');
  }
  return Object.freeze({
    status: 'synthetic-return-case-role-truth-passed',
    participantProjections: 2,
    workflowStatus: 'completed',
    needsReview: true,
    returnState: 'needsReview',
    evidenceCount: expectedEvidenceCount,
    contestedAuthorizedMinor: expectedContestedAuthorizedMinor,
    additionalChargeMinor: 0,
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function runSyntheticRoleBookingLifecycle({
  vaultFile,
  imagePath = resolve(repositoryRoot, 'assets/images/shareittoo_app_icon_master.png'),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  random = (size) => randomBytes(size),
} = {}) {
  await createSyntheticBookingFixture({ vaultFile, imagePath, fetchImpl, now, random });
  const ownerRequestVisibility = await inspectSyntheticBookingRoleVisibility({
    vaultFile,
    expectedStatus: 'requested',
    fetchImpl,
  });
  await transitionSyntheticBookingFixture({ vaultFile, status: 'accepted', fetchImpl, now });
  const renterUpcomingVisibility = await inspectSyntheticBookingRoleVisibility({
    vaultFile,
    expectedStatus: 'accepted',
    fetchImpl,
  });
  const pickupTransition = await transitionSyntheticBookingFixture({
    vaultFile, status: 'running', fetchImpl, now,
  });
  const renterRunningVisibility = await inspectSyntheticBookingRoleVisibility({
    vaultFile,
    expectedStatus: 'active',
    fetchImpl,
  });
  const returnTransition = await transitionSyntheticBookingFixture({
    vaultFile, status: 'completed', fetchImpl, now,
  });
  const renterCompletedVisibility = await inspectSyntheticBookingRoleVisibility({
    vaultFile,
    expectedStatus: 'completed',
    fetchImpl,
  });
  return Object.freeze({
    status: 'passed-bounded-synthetic-role-booking-lifecycle',
    workflow: Object.freeze(['requested', 'accepted', 'active', 'completed']),
    tests: Object.freeze({
      ownerRequestVisibility,
      renterUpcomingVisibility,
      renterRunningVisibility,
      renterCompletedVisibility,
    }),
    confirmations: Object.freeze({
      pickup: pickupTransition.confirmation,
      return: returnTransition.confirmation,
    }),
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export function archiveCompletedSyntheticBookingFixture({
  vaultFile,
  nextRunId,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The fixture archive time is invalid.');
  }
  if (typeof nextRunId !== 'string'
      || nextRunId.length < 4
      || nextRunId.length > 80
      || !/^[A-Za-z0-9_-]+$/.test(nextRunId)) {
    fail('The next synthetic run identifier is invalid.');
  }
  const { path, vault } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (vault.status !== 'synthetic-booking-completed'
      || fixture?.workflowStatus !== 'completed'
      || fixture?.paymentMode !== 'memory'
      || fixture?.stripeLivemode !== false
      || fixture?.paymentEndpointCalled !== false) {
    fail('Only a completed, payment-free Staging fixture can be archived.');
  }
  const history = Array.isArray(vault.syntheticBookingHistory)
    ? vault.syntheticBookingHistory.slice(-19)
    : [];
  history.push({ ...fixture, archivedAt: now.toISOString() });
  vault.syntheticBookingHistory = history;
  delete vault.syntheticBooking;
  vault.runId = nextRunId;
  vault.status = 'fixture-verified-ready-for-login';
  saveVault(path, vault);
  return Object.freeze({
    status: 'synthetic-booking-archived',
    historyCount: history.length,
    readyForNextFixture: true,
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function reconcileSyntheticBookingFixture({
  vaultFile,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The fixture reconciliation timestamp is invalid.');
  }
  const { path, vault, accounts } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (!fixture || fixture.paymentEndpointCalled !== false || fixture.stripeLivemode !== false) {
    fail('The active synthetic booking fixture is missing or unsafe.');
  }
  const token = await login(fetchImpl, accounts.get('owner'));
  const result = await request(fetchImpl, '/rental-requests', { token });
  const booking = Array.isArray(result?.requests)
    ? result.requests.find((entry) => entry?.id === fixture.bookingId)
    : null;
  const workflowStatus = booking?.workflowStatus;
  if (typeof workflowStatus !== 'string'
      || ![
        'draft', 'requested', 'accepted', 'payment_pending', 'confirmed',
        'active', 'returned', 'completed', 'declined', 'cancelled',
        'refunded', 'disputed',
      ].includes(workflowStatus)) {
    fail('The synthetic booking could not be reconciled safely.');
  }
  fixture.workflowStatus = workflowStatus;
  fixture.reconciledAt = now.toISOString();
  vault.status = terminalWorkflowStatuses.has(workflowStatus)
    ? 'synthetic-booking-terminal'
    : 'synthetic-booking-active';
  saveVault(path, vault);
  return Object.freeze({
    status: terminalWorkflowStatuses.has(workflowStatus)
      ? 'synthetic-booking-reconciled-terminal'
      : 'synthetic-booking-reconciled-active',
    workflowStatus,
    terminal: terminalWorkflowStatuses.has(workflowStatus),
    paymentMode: fixture.paymentMode,
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export function archiveTerminalSyntheticBookingFixture({
  vaultFile,
  nextRunId,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The fixture archive timestamp is invalid.');
  }
  if (typeof nextRunId !== 'string'
      || nextRunId.length < 4
      || nextRunId.length > 80
      || !/^[A-Za-z0-9_-]+$/.test(nextRunId)) {
    fail('The next synthetic run identifier is invalid.');
  }
  const { path, vault } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (vault.status !== 'synthetic-booking-terminal'
      || !terminalWorkflowStatuses.has(fixture?.workflowStatus)
      || fixture?.paymentMode !== 'memory'
      || fixture?.stripeLivemode !== false
      || fixture?.paymentEndpointCalled !== false) {
    fail('Only a reconciled terminal, payment-free Staging fixture can be archived.');
  }
  const history = Array.isArray(vault.syntheticBookingHistory)
    ? vault.syntheticBookingHistory.slice(-19)
    : [];
  history.push({ ...fixture, archivedAt: now.toISOString() });
  vault.syntheticBookingHistory = history;
  delete vault.syntheticBooking;
  vault.runId = nextRunId;
  vault.status = 'fixture-verified-ready-for-login';
  saveVault(path, vault);
  return Object.freeze({
    status: 'synthetic-booking-terminal-archived',
    historyCount: history.length,
    readyForNextFixture: true,
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function prepareSyntheticBookingThread({
  vaultFile,
  actorRole = 'owner',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!['owner', 'renter'].includes(actorRole)) fail('The thread actor role is invalid.');
  const { path, vault, accounts } = readVault(vaultFile);
  const fixture = vault.syntheticBooking;
  if (!fixture
      || !['accepted', 'active', 'completed'].includes(fixture.workflowStatus)
      || fixture.paymentEndpointCalled !== false
      || fixture.stripeLivemode !== false) {
    fail('The synthetic booking is not ready for a controlled chat thread.');
  }
  const token = await login(fetchImpl, accounts.get(actorRole));
  const result = await request(fetchImpl,
    `/message-threads/booking/${encodeURIComponent(safeFixtureIdentifier(fixture.bookingId, 'booking fixture'))}`,
    { method: 'POST', token, expected: [200, 201] });
  const threadId = safeFixtureIdentifier(result?.thread?.id, 'thread fixture');
  fixture.threadId = threadId;
  fixture.threadPreparedAt = new Date().toISOString();
  saveVault(path, vault);
  return Object.freeze({
    status: 'synthetic-booking-thread-ready',
    workflowStatus: fixture.workflowStatus,
    actorRole,
    paymentMode: fixture.paymentMode,
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function sendSyntheticBookingDiagnosticMessage({
  vaultFile,
  senderRole = 'owner',
  diagnosticKind = 'generic',
  diagnosticRunId = randomBytes(8).toString('hex'),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!['owner', 'renter'].includes(senderRole)) fail('The message sender role is invalid.');
  if (!['generic', 'foreground', 'background', 'terminated', 'logout', 'offline'].includes(diagnosticKind)) {
    fail('The message diagnostic kind is invalid.');
  }
  if (typeof diagnosticRunId !== 'string'
      || diagnosticRunId.length < 8
      || diagnosticRunId.length > 40
      || !/^[A-Za-z0-9_-]+$/.test(diagnosticRunId)) {
    fail('The message diagnostic run identifier is invalid.');
  }
  const { vault, accounts } = readVault(vaultFile);
  const bindingFixture = vault.syntheticBooking;
  const simulationFixture = vault.nonBindingSimulation;
  const fixture = bindingFixture
    && ['accepted', 'active'].includes(bindingFixture.workflowStatus)
    && bindingFixture.paymentEndpointCalled === false
    && bindingFixture.stripeLivemode === false
    ? bindingFixture
    : simulationFixture?.status === 'accepted-chat-ready'
      && simulationFixture.paymentEndpointCalled === false
      && simulationFixture.stripeLivemode === false
      ? { ...simulationFixture, workflowStatus: 'accepted' }
      : null;
  if (!fixture) {
    fail('The synthetic booking is not ready for a controlled diagnostic message.');
  }
  const threadId = safeFixtureIdentifier(fixture.threadId, 'thread fixture');
  const bookingId = safeFixtureIdentifier(fixture.bookingId, 'booking fixture');
  const token = await login(fetchImpl, accounts.get(senderRole));
  const result = await request(fetchImpl,
    `/message-threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      token,
      headers: {
        'Idempotency-Key': `${bookingId}-${diagnosticKind}-${diagnosticRunId}-push-diagnostic-${senderRole}`,
      },
      body: { text: `Kontrollierte SIT Staging-Pushprüfung (${diagnosticKind}).` },
      expected: [200, 201],
    });
  if (typeof result?.message?.id !== 'string' || result.message.id.length < 1) {
    fail('The controlled diagnostic message was not accepted.');
  }
  return Object.freeze({
    status: 'synthetic-booking-diagnostic-message-sent',
    senderRole,
    diagnosticKind,
    workflowStatus: fixture.workflowStatus,
    paymentMode: fixture.paymentMode,
    stripeLivemode: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

function cliValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const [command] = process.argv.slice(2);
  const vaultFile = cliValue(process.argv.slice(2), '--vault-file');
  try {
    const result = command === 'create'
      ? await createSyntheticBookingFixture({ vaultFile })
      : command === 'reconcile'
        ? await reconcileSyntheticBookingFixture({ vaultFile })
        : command === 'archive-terminal'
          ? archiveTerminalSyntheticBookingFixture({
              vaultFile,
              nextRunId: cliValue(process.argv.slice(2), '--next-run-id'),
            })
      : command === 'archive-completed'
        ? archiveCompletedSyntheticBookingFixture({
            vaultFile,
            nextRunId: cliValue(process.argv.slice(2), '--next-run-id'),
          })
        : command === 'prepare-thread'
          ? await prepareSyntheticBookingThread({
              vaultFile,
              actorRole: cliValue(process.argv.slice(2), '--actor-role') ?? 'owner',
            })
          : command === 'send-diagnostic-message'
            ? await sendSyntheticBookingDiagnosticMessage({
                vaultFile,
                senderRole: cliValue(process.argv.slice(2), '--sender-role') ?? 'owner',
                diagnosticKind: cliValue(process.argv.slice(2), '--diagnostic-kind') ?? 'generic',
              })
          : command === 'diagnose-lifecycle'
            ? await runSyntheticRoleBookingLifecycle({ vaultFile })
        : await transitionSyntheticBookingFixture({
            vaultFile,
            status: cliValue(process.argv.slice(2), '--status'),
          });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
