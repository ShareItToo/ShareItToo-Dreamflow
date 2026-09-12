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
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  runStagingNonBindingSimulation,
} from './run_staging_non_binding_simulation.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const sourceReadyStatus = 'email-link-verified-ready-for-login';
const journeyKind = 'sit-staging-email-verified-two-role-product-journey';

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
  const absolute = outsideRepository(path, 'The private product-journey directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  chmodSync(absolute, 0o700);
  return absolute;
}

function privateInputFile(path, label) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be absolute.`);
  const canonical = realpathSync(path);
  outsideRepository(canonical, label);
  const stat = statSync(canonical);
  if (!stat.isFile() || stat.size === 0 || (stat.mode & 0o077) !== 0) {
    fail(`${label} must be a non-empty owner-only regular file.`);
  }
  return canonical;
}

function readPrivateJson(path, label) {
  const canonical = privateInputFile(path, label);
  let descriptor;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) fail(`${label} is not owner-only.`);
    return { canonical, value: JSON.parse(readFileSync(descriptor, 'utf8')) };
  } catch (error) {
    if (typeof error?.message === 'string' && error.message.startsWith(label)) throw error;
    fail(`${label} is invalid.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writePrivateJson(path, value) {
  privateDirectory(resolve(path, '..'));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function validAccount(account) {
  return ['owner', 'renter'].includes(account?.role)
    && typeof account.displayName === 'string'
    && account.displayName.trim().length >= 2
    && typeof account.email === 'string'
    && account.email.includes('@')
    && typeof account.password === 'string'
    && account.password.length >= 12
    && account.registrationStatus === 'accepted'
    && account.verificationStatus === 'email-link-verified';
}

function validateEmailVerifiedVault(vault, { source = false } = {}) {
  const allowedStatuses = source
    ? new Set([sourceReadyStatus])
    : new Set([
        sourceReadyStatus,
        'non-binding-simulation-active',
        'email-linked-product-journey-retired',
      ]);
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault.apiBaseUrl !== stagingApiBaseUrl
      || vault.stripeLivemode !== false
      || vault.verificationMethod !== 'email-link'
      || !allowedStatuses.has(vault.status)
      || !Array.isArray(vault.accounts)
      || vault.accounts.length !== 2
      || !vault.accounts.every(validAccount)
      || new Set(vault.accounts.map((account) => account.role)).size !== 2) {
    fail(source
      ? 'The source vault is not an exact email-link-verified two-role Staging fixture.'
      : 'The product-journey vault is not an exact email-link-verified two-role Staging fixture.');
  }
  if (new Set(vault.accounts.map((account) => account.email.toLowerCase())).size !== 2) {
    fail('The product-journey roles are not distinct principals.');
  }
  return vault;
}

export function readEmailVerifiedJourneyVault(vaultFile) {
  const { canonical, value } = readPrivateJson(
    vaultFile,
    'The private product-journey vault',
  );
  return { canonical, vault: validateEmailVerifiedVault(value) };
}

function safeRunId(now, random) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The product-journey timestamp is invalid.');
  }
  if (typeof random !== 'function') fail('The product-journey random source is invalid.');
  const stamp = now.toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'z')
    .toLowerCase();
  return `n22-${stamp}-${random(4).toString('hex')}`;
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value)
    ? value
    : null;
}

async function apiRequest(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
  headers = {},
  expected = [200],
} = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A Staging product-journey API path is invalid.');
  }
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined || form ? body : JSON.stringify(body),
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
    fail(`Staging ${method} product-journey request failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return { status: response.status, value };
}

async function login(fetchImpl, account) {
  const { value } = await apiRequest(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: account.email, password: account.password },
  });
  if (typeof value?.accessToken !== 'string' || value.accessToken.length < 20) {
    fail(`The ${account.role} email-verified Staging login did not return a usable session.`);
  }
  const me = await apiRequest(fetchImpl, '/auth/me', { token: value.accessToken });
  if (typeof me.value?.user?.id !== 'string'
      || me.value.user.id.length === 0
      || String(me.value.user.email ?? '').toLowerCase() !== account.email.toLowerCase()) {
    fail(`The ${account.role} Staging session did not bind to the exact expected principal.`);
  }
  return { token: value.accessToken, userId: me.value.user.id };
}

function accountMap(vault) {
  return new Map(vault.accounts.map((account) => [account.role, account]));
}

function defaultVaultRoot() {
  return resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
    'email-verified-two-role-journeys',
  );
}

export async function prepareStagingEmailVerifiedTwoRoleJourney({
  sourceVaultFile,
  vaultRoot = defaultVaultRoot(),
  imagePath = resolve(repositoryRoot, 'assets/images/shareittoo_app_icon_master.png'),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  random = randomBytes,
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  const source = readPrivateJson(
    sourceVaultFile,
    'The private email-verified source vault',
  ).value;
  validateEmailVerifiedVault(source, { source: true });
  const image = readFileSync(resolve(imagePath));
  if (image.length < 100) fail('The isolated product-journey image is invalid.');

  const runId = safeRunId(now, random);
  const directory = privateDirectory(resolve(vaultRoot, runId));
  const vaultFile = resolve(directory, 'accounts.json');
  const listingId = `sit-${runId}-${random(4).toString('hex')}-listing`;
  const title = `SIT Rollenprüfung ${runId}`;
  const vault = {
    schemaVersion: 1,
    kind: 'sit-staging-synthetic-account-vault',
    runId,
    status: sourceReadyStatus,
    createdAt: now.toISOString(),
    apiBaseUrl: stagingApiBaseUrl,
    stripeLivemode: false,
    verificationMethod: 'email-link',
    sourceVerification: {
      status: 'two-distinct-email-links-confirmed',
      credentialsRemainInOwnerOnlyPrivateVaults: true,
      sourceVaultMutated: false,
    },
    accounts: structuredClone(source.accounts),
    realTwoRoleJourney: {
      schemaVersion: 1,
      kind: journeyKind,
      status: 'preparation-pending',
      listingId,
      title,
      listingStatus: 'draft',
      createdAt: now.toISOString(),
      paymentEndpointCalled: false,
      stripeLivemode: false,
    },
  };
  writePrivateJson(vaultFile, vault);

  const accounts = accountMap(vault);
  let owner = null;
  let renter = null;
  let listingCreated = false;
  try {
    [owner, renter] = await Promise.all([
      login(fetchImpl, accounts.get('owner')),
      login(fetchImpl, accounts.get('renter')),
    ]);
    if (owner.userId === renter.userId) {
      fail('The email-verified Staging roles resolved to one principal.');
    }
    const mine = await apiRequest(fetchImpl, '/listings/mine', { token: owner.token });
    if ((mine.value?.listings ?? []).some((listing) => listing?.title === title)) {
      fail('The isolated product-journey listing title already exists.');
    }
    const form = new FormData();
    form.append('purpose', 'listing_image');
    form.append('file', new Blob([image], { type: 'image/png' }), 'sit-n22-product-journey.png');
    const upload = await apiRequest(fetchImpl, '/uploads', {
      method: 'POST',
      token: owner.token,
      body: form,
      expected: [201],
    });
    if (typeof upload.value?.url !== 'string'
        || !upload.value.url.startsWith('https://staging.shareittoo.com/')) {
      fail('The isolated product-journey upload did not return a Staging URL.');
    }
    const created = await apiRequest(fetchImpl, '/listings', {
      method: 'POST',
      token: owner.token,
      expected: [201],
      body: {
        id: listingId,
        title,
        description: 'Isoliertes, per E-Mail bestätigtes Staging-Inserat für den ShareItToo Zwei-Rollen-Produktdurchlauf ohne Echtgeld.',
        categoryId: 'cat8',
        subcategory: 'Bohrmaschinen',
        tags: ['sit', 'n22', 'email-verified'],
        pricePerDay: 12,
        priceRaw: 12,
        priceUnit: 'day',
        currency: 'EUR',
        deposit: null,
        photos: [upload.value.url],
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
        status: 'draft',
        isActive: false,
      },
    });
    listingCreated = true;
    if (created.value?.listing?.id !== listingId
        || created.value.listing.status !== 'draft'
        || created.value.listing.isActive !== false) {
      fail('The product-journey listing was not stored as an exact owner draft.');
    }
    await apiRequest(fetchImpl, `/listings/${encodeURIComponent(listingId)}/availability`, {
      method: 'PUT',
      token: owner.token,
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
    vault.realTwoRoleJourney.status = 'owner-draft-ready-for-pixel-publish';
    vault.realTwoRoleJourney.preparedAt = new Date().toISOString();
    writePrivateJson(vaultFile, vault);
  } catch (error) {
    let cleanupClosed = !listingCreated;
    if (listingCreated && owner !== null) {
      try {
        const ended = await apiRequest(
          fetchImpl,
          `/listings/${encodeURIComponent(listingId)}/status`,
          {
            method: 'PATCH',
            token: owner.token,
            body: { status: 'ended' },
          },
        );
        cleanupClosed = ended.value?.listing?.status === 'ended'
          && ended.value.listing.isActive === false;
      } catch {
        cleanupClosed = false;
      }
    }
    if (cleanupClosed) {
      rmSync(directory, { recursive: true, force: false });
    }
    throw error;
  }

  return Object.freeze({
    status: 'owner-draft-ready-for-pixel-publish',
    vaultFile,
    runId,
    roleCount: 2,
    emailLinksVerified: true,
    distinctPrincipalsVerified: true,
    listingStatus: 'draft',
    paymentEndpointCalled: false,
    stripeLivemode: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function verifyStagingEmailVerifiedJourneyPublished({
  vaultFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  if (vault.realTwoRoleJourney?.kind !== journeyKind
      || !['owner-draft-ready-for-pixel-publish', 'pixel-owner-publish-confirmed'].includes(
        vault.realTwoRoleJourney.status,
      )) {
    fail('The product-journey vault is not ready for the Pixel publish verification.');
  }
  const owner = await login(fetchImpl, accountMap(vault).get('owner'));
  const mine = await apiRequest(fetchImpl, '/listings/mine', { token: owner.token });
  const matches = (mine.value?.listings ?? []).filter((listing) => (
    listing?.id === vault.realTwoRoleJourney.listingId
      && listing.title === vault.realTwoRoleJourney.title
      && listing.status === 'active'
      && listing.isActive === true
  ));
  if (matches.length !== 1) fail('The Pixel owner publish is not server-confirmed as exactly one active listing.');
  const catalog = await apiRequest(fetchImpl, '/listings?sort=newest&limit=100');
  if (!(catalog.value?.listings ?? []).some((listing) => (
    listing?.id === vault.realTwoRoleJourney.listingId
      && listing.title === vault.realTwoRoleJourney.title
  ))) {
    fail('The Pixel-published listing is not visible in the public Staging catalog.');
  }
  vault.realTwoRoleJourney.status = 'pixel-owner-publish-confirmed';
  vault.realTwoRoleJourney.listingStatus = 'active';
  vault.realTwoRoleJourney.publishedAt = new Date().toISOString();
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: 'pixel-owner-publish-server-confirmed',
    listingStatus: 'active',
    publicCatalogVisible: true,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function activateStagingEmailVerifiedJourneyFixture({
  vaultFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  if (vault.realTwoRoleJourney?.kind !== journeyKind
      || vault.realTwoRoleJourney.status !== 'owner-draft-ready-for-pixel-publish'
      || vault.realTwoRoleJourney.listingStatus !== 'draft') {
    fail('The product-journey vault is not an exact isolated draft fixture.');
  }
  const owner = await login(fetchImpl, accountMap(vault).get('owner'));
  const mine = await apiRequest(fetchImpl, '/listings/mine', { token: owner.token });
  const matches = (mine.value?.listings ?? []).filter((listing) => (
    listing?.id === vault.realTwoRoleJourney.listingId
      && listing.title === vault.realTwoRoleJourney.title
  ));
  if (matches.length !== 1
      || matches[0].status !== 'draft'
      || matches[0].isActive !== false) {
    fail('The isolated product-journey fixture is not exactly one owner draft.');
  }
  const activated = await apiRequest(
    fetchImpl,
    `/listings/${encodeURIComponent(vault.realTwoRoleJourney.listingId)}/status`,
    {
      method: 'PATCH',
      token: owner.token,
      body: { status: 'active' },
    },
  );
  if (activated.value?.listing?.id !== vault.realTwoRoleJourney.listingId
      || activated.value.listing.title !== vault.realTwoRoleJourney.title
      || activated.value.listing.status !== 'active'
      || activated.value.listing.isActive !== true) {
    fail('The isolated product-journey fixture activation was not exact.');
  }
  const catalog = await apiRequest(fetchImpl, '/listings?sort=newest&limit=100');
  const publicMatches = (catalog.value?.listings ?? []).filter((listing) => (
    listing?.id === vault.realTwoRoleJourney.listingId
      && listing.title === vault.realTwoRoleJourney.title
  ));
  if (publicMatches.length !== 1) {
    fail('The isolated product-journey fixture is not exactly once in the public catalog.');
  }
  vault.realTwoRoleJourney.status = 'synthetic-fixture-active';
  vault.realTwoRoleJourney.listingStatus = 'active';
  vault.realTwoRoleJourney.fixtureActivatedAt = new Date().toISOString();
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: 'isolated-product-journey-fixture-active',
    listingStatus: 'active',
    publicCatalogVisible: true,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    monetaryEffectMinor: 0,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

export async function runStagingEmailVerifiedTwoRoleSimulation({
  vaultFile,
  fetchImpl = globalThis.fetch,
  now = new Date(),
  random = randomBytes,
  wait,
} = {}) {
  const before = readEmailVerifiedJourneyVault(vaultFile).vault;
  if (before.realTwoRoleJourney?.status !== 'pixel-owner-publish-confirmed') {
    fail('The server-confirmed Pixel owner publish is required before the role simulation.');
  }
  const result = await runStagingNonBindingSimulation({
    vaultFile,
    fetchImpl,
    now,
    random,
    ...(wait === undefined ? {} : { wait }),
  });
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  vault.realTwoRoleJourney.status = 'accepted-chat-ready-for-pixel-role-review';
  vault.realTwoRoleJourney.simulationOnly = true;
  vault.realTwoRoleJourney.acceptedAt = new Date().toISOString();
  writePrivateJson(canonical, vault);
  return Object.freeze({
    ...result,
    status: 'email-verified-two-role-simulation-ready-for-pixel-review',
    emailLinksVerified: true,
    distinctPrincipalsVerified: true,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

function exactRentalCart(value) {
  const cart = value?.cart;
  if (cart === null || typeof cart !== 'object' || Array.isArray(cart)
      || !Array.isArray(cart.projects) || !Array.isArray(cart.items)
      || cart.reservationCreated !== false) {
    fail('The Staging rental-cart truth is malformed or reserving.');
  }
  return cart;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function cartDataSnapshot(cart) {
  const byId = (left, right) => String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
  return canonicalValue({
    projects: structuredClone(cart.projects).sort(byId),
    items: structuredClone(cart.items).sort(byId),
  });
}

function sameCartData(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function exactFixtureRequests(value, listingId) {
  if (!Array.isArray(value?.requests)) {
    fail('The Staging rental-request truth is malformed.');
  }
  return value.requests.filter((entry) => [
    entry?.itemId,
    entry?.listingId,
    entry?.item?.id,
    entry?.listing?.id,
  ].includes(listingId));
}

function rentalCartLifecycle(vault) {
  const lifecycle = vault.rentalCartLifecycle;
  if (lifecycle?.schemaVersion !== 1
      || lifecycle?.kind !== 'sit-staging-isolated-rental-cart-lifecycle'
      || typeof lifecycle.projectTitle !== 'string'
      || lifecycle.projectTitle.length < 10
      || lifecycle.baseline === null
      || typeof lifecycle.baseline !== 'object') {
    fail('The private Staging rental-cart lifecycle is unavailable.');
  }
  return lifecycle;
}

export async function prepareStagingEmailVerifiedRentalCartLifecycle({
  vaultFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  if (vault.realTwoRoleJourney?.kind !== journeyKind
      || vault.realTwoRoleJourney.status !== 'synthetic-fixture-active'
      || vault.realTwoRoleJourney.listingStatus !== 'active'
      || vault.rentalCartLifecycle !== undefined) {
    fail('The isolated listing is not ready for a fresh rental-cart lifecycle.');
  }
  const listingId = vault.realTwoRoleJourney.listingId;
  const renter = await login(fetchImpl, accountMap(vault).get('renter'));
  const current = exactRentalCart(
    (await apiRequest(fetchImpl, '/rental-cart', { token: renter.token })).value,
  );
  const projectTitle = `SIT Projekt ${vault.runId}`;
  if (current.items.some((entry) => entry?.listingId === listingId)
      || current.projects.some((entry) => entry?.title === projectTitle)) {
    fail('The isolated rental-cart fixture collides with existing renter data.');
  }
  const requests = await apiRequest(fetchImpl, '/rental-requests', { token: renter.token });
  if (exactFixtureRequests(requests.value, listingId).length !== 0) {
    fail('The isolated listing already has an unexpected rental request.');
  }
  vault.rentalCartLifecycle = {
    schemaVersion: 1,
    kind: 'sit-staging-isolated-rental-cart-lifecycle',
    status: 'baseline-captured',
    projectTitle,
    baseline: cartDataSnapshot(current),
    capturedAt: new Date().toISOString(),
  };
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: 'isolated-rental-cart-baseline-captured',
    reservationCreated: false,
    fixtureRentalRequests: 0,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
    containsPrivateCartData: false,
  });
}

export async function inspectStagingEmailVerifiedRentalCartLifecycle({
  vaultFile,
  expectedProjectAssignment = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  const lifecycle = rentalCartLifecycle(vault);
  const listingId = vault.realTwoRoleJourney?.listingId;
  const renter = await login(fetchImpl, accountMap(vault).get('renter'));
  const current = exactRentalCart(
    (await apiRequest(fetchImpl, '/rental-cart', { token: renter.token })).value,
  );
  const items = current.items.filter((entry) => entry?.listingId === listingId);
  if (items.length !== 1
      || !/^cartitem_[0-9a-f]{64}$/u.test(String(items[0]?.id ?? ''))
      || !/^\d{4}-\d{2}-\d{2}$/u.test(String(items[0]?.startDate ?? ''))
      || !/^\d{4}-\d{2}-\d{2}$/u.test(String(items[0]?.endDate ?? ''))
      || !(new Date(items[0].endDate).getTime() > new Date(items[0].startDate).getTime())) {
    fail('The exact non-reserving rental-cart intent is not server-confirmed once.');
  }
  const projects = current.projects.filter(
    (entry) => entry?.title === lifecycle.projectTitle,
  );
  if (expectedProjectAssignment) {
    if (projects.length !== 1 || items[0].projectId !== projects[0].id) {
      fail('The exact rental-cart project assignment is not server-confirmed.');
    }
  } else if (items[0].projectId !== null && items[0].projectId !== undefined) {
    fail('The isolated rental-cart intent unexpectedly has a project assignment.');
  }
  const requests = await apiRequest(fetchImpl, '/rental-requests', { token: renter.token });
  if (exactFixtureRequests(requests.value, listingId).length !== 0) {
    fail('The non-reserving rental-cart intent unexpectedly created a request.');
  }
  lifecycle.status = expectedProjectAssignment
    ? 'project-assignment-server-confirmed'
    : 'single-intent-server-confirmed';
  lifecycle.observed = {
    itemId: items[0].id,
    startDate: items[0].startDate,
    endDate: items[0].endDate,
    ...(expectedProjectAssignment ? { projectId: projects[0].id } : {}),
  };
  lifecycle.lastInspectedAt = new Date().toISOString();
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: expectedProjectAssignment
      ? 'isolated-rental-cart-project-server-confirmed'
      : 'isolated-rental-cart-single-intent-server-confirmed',
    exactIntentCount: 1,
    exactProjectCount: expectedProjectAssignment ? 1 : 0,
    reservationCreated: false,
    fixtureRentalRequests: 0,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
    containsPrivateCartData: false,
  });
}

export async function cleanupStagingEmailVerifiedRentalCartLifecycle({
  vaultFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  const lifecycle = rentalCartLifecycle(vault);
  const listingId = vault.realTwoRoleJourney?.listingId;
  const renter = await login(fetchImpl, accountMap(vault).get('renter'));
  let current = exactRentalCart(
    (await apiRequest(fetchImpl, '/rental-cart', { token: renter.token })).value,
  );
  for (const item of current.items.filter((entry) => entry?.listingId === listingId)) {
    current = exactRentalCart((await apiRequest(
      fetchImpl,
      `/rental-cart/items/${encodeURIComponent(item.id)}`,
      { method: 'DELETE', token: renter.token },
    )).value);
  }
  for (const project of current.projects.filter(
    (entry) => entry?.title === lifecycle.projectTitle,
  )) {
    current = exactRentalCart((await apiRequest(
      fetchImpl,
      `/rental-cart/projects/${encodeURIComponent(project.id)}`,
      { method: 'DELETE', token: renter.token },
    )).value);
  }
  current = exactRentalCart(
    (await apiRequest(fetchImpl, '/rental-cart', { token: renter.token })).value,
  );
  if (!sameCartData(cartDataSnapshot(current), lifecycle.baseline)) {
    fail('The isolated rental-cart cleanup did not restore the exact baseline.');
  }
  const requests = await apiRequest(fetchImpl, '/rental-requests', { token: renter.token });
  if (exactFixtureRequests(requests.value, listingId).length !== 0) {
    fail('The isolated rental-cart cleanup found an unexpected rental request.');
  }
  lifecycle.status = 'cleanup-server-confirmed';
  lifecycle.cleanedAt = new Date().toISOString();
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: 'isolated-rental-cart-baseline-restored',
    reservationCreated: false,
    fixtureRentalRequests: 0,
    unrelatedCartDataRestored: true,
    containsAccountIdentity: false,
    containsFixtureIdentifier: false,
    containsPrivateCartData: false,
  });
}

export async function retireStagingEmailVerifiedTwoRoleJourney({
  vaultFile,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { canonical, vault } = readEmailVerifiedJourneyVault(vaultFile);
  if (vault.realTwoRoleJourney?.kind !== journeyKind) {
    fail('The product-journey retirement target is invalid.');
  }
  const accounts = accountMap(vault);
  const [owner, renter] = await Promise.all([
    login(fetchImpl, accounts.get('owner')),
    login(fetchImpl, accounts.get('renter')),
  ]);
  const bookingId = vault.nonBindingSimulation?.bookingId;
  let bookingCancelled = bookingId === undefined;
  if (typeof bookingId === 'string' && bookingId.length > 0) {
    const requests = await apiRequest(fetchImpl, '/rental-requests', { token: renter.token });
    const booking = (requests.value?.requests ?? []).find((entry) => entry?.id === bookingId);
    if (booking && ['requested', 'accepted'].includes(booking.workflowStatus)) {
      const cancelled = await apiRequest(
        fetchImpl,
        `/bookings/${encodeURIComponent(bookingId)}/transitions`,
        {
          method: 'POST',
          token: renter.token,
          headers: { 'Idempotency-Key': `${bookingId}-n22-cleanup` },
          body: { status: 'cancelled' },
        },
      );
      bookingCancelled = cancelled.value?.booking?.workflowStatus === 'cancelled'
        && cancelled.value.booking.simulationOnly === true
        && cancelled.value.booking.contractCreated === false
        && cancelled.value.booking.reservationCreated === false
        && cancelled.value.booking.paymentCreated === false
        && cancelled.value.booking.monetaryEffectMinor === 0;
    } else {
      bookingCancelled = booking?.workflowStatus === 'cancelled';
    }
  }
  if (!bookingCancelled) fail('The isolated non-binding booking was not safely cancelled.');

  const listingId = vault.realTwoRoleJourney.listingId;
  const mine = await apiRequest(fetchImpl, '/listings/mine', { token: owner.token });
  const listing = (mine.value?.listings ?? []).find((entry) => entry?.id === listingId);
  if (listing && listing.status !== 'ended') {
    const ended = await apiRequest(fetchImpl, `/listings/${encodeURIComponent(listingId)}/status`, {
      method: 'PATCH',
      token: owner.token,
      body: { status: 'ended' },
    });
    if (ended.value?.listing?.status !== 'ended' || ended.value.listing.isActive !== false) {
      fail('The isolated product-journey listing was not safely ended.');
    }
  }
  const verifyMine = await apiRequest(fetchImpl, '/listings/mine', { token: owner.token });
  const retired = (verifyMine.value?.listings ?? []).find((entry) => entry?.id === listingId);
  if (retired?.status !== 'ended' || retired.isActive !== false) {
    fail('The isolated product-journey listing retirement is not server-confirmed.');
  }
  const catalog = await apiRequest(fetchImpl, '/listings?sort=newest&limit=100');
  if ((catalog.value?.listings ?? []).some((entry) => entry?.id === listingId)) {
    fail('The retired product-journey listing remains visible in the public catalog.');
  }

  vault.status = 'email-linked-product-journey-retired';
  vault.realTwoRoleJourney.status = 'retired';
  vault.realTwoRoleJourney.listingStatus = 'ended';
  vault.realTwoRoleJourney.bookingStatus = bookingId === undefined ? 'not-created' : 'cancelled';
  vault.realTwoRoleJourney.retiredAt = new Date().toISOString();
  writePrivateJson(canonical, vault);
  return Object.freeze({
    status: 'email-verified-two-role-product-journey-retired',
    bookingCancelled,
    listingEnded: true,
    publicCatalogEntryRemoved: true,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    monetaryEffectMinor: 0,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const phase = argumentValue(args, '--phase') ?? fail('--phase is required.');
  let result;
  if (phase === 'prepare') {
    result = await prepareStagingEmailVerifiedTwoRoleJourney({
      sourceVaultFile: resolve(
        argumentValue(args, '--source-vault-file') ?? fail('--source-vault-file is required.'),
      ),
      ...(argumentValue(args, '--vault-root') === null
        ? {}
        : { vaultRoot: resolve(argumentValue(args, '--vault-root')) }),
    });
  } else {
    const vaultFile = resolve(
      argumentValue(args, '--vault-file') ?? fail('--vault-file is required.'),
    );
    if (phase === 'activate-fixture') {
      result = await activateStagingEmailVerifiedJourneyFixture({ vaultFile });
    } else if (phase === 'verify-published') {
      result = await verifyStagingEmailVerifiedJourneyPublished({ vaultFile });
    } else if (phase === 'simulate') {
      result = await runStagingEmailVerifiedTwoRoleSimulation({ vaultFile });
    } else if (phase === 'retire') {
      result = await retireStagingEmailVerifiedTwoRoleJourney({ vaultFile });
    } else {
      fail('--phase must be prepare, activate-fixture, verify-published, simulate, or retire.');
    }
  }
  const { vaultFile: privatePath, runId, ...safeResult } = result;
  process.stdout.write(`${JSON.stringify({
    ...safeResult,
    privateVaultCreated: typeof privatePath === 'string',
    runIdentifierRetainedPrivately: typeof runId === 'string',
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error?.message ?? 'The email-verified product journey failed safely.'}\n`);
    process.exitCode = 1;
  });
}
