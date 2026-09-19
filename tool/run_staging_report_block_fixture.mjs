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
  activateStagingEmailVerifiedJourneyFixture,
  prepareStagingEmailVerifiedTwoRoleJourney,
  readEmailVerifiedJourneyVault,
  retireStagingEmailVerifiedTwoRoleJourney,
} from './run_staging_email_verified_two_role_journey.mjs';
import {
  retireStagingNonBindingSimulation,
  runStagingNonBindingSimulation,
} from './run_staging_non_binding_simulation.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const journalKind = 'sit-wp132-staging-report-block-journal';

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

function privateInputFile(path, label) {
  const canonical = realpathSync(outsideRepository(path, label));
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
  const absolute = outsideRepository(path, 'The WP132 private journal');
  mkdirSync(resolve(absolute, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(absolute, 0o600);
}

function safeError(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value)
    ? value
    : null;
}

async function request(fetchImpl, path, {
  method = 'GET', token = null, body = undefined, expected = [200],
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
    fail('A WP132 Staging API path is invalid.');
  }
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || form ? {} : { 'Content-Type': 'application/json' }),
      'User-Agent': 'SIT-WP132-Report-Block/1',
    },
    body: body === undefined || form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let value = null;
  try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
  if (!expected.includes(response.status)) {
    const code = safeError(value?.error);
    fail(`WP132 Staging ${method} failed with HTTP ${response.status}${code ? ` (${code})` : ''}.`);
  }
  return { status: response.status, value };
}

async function login(fetchImpl, account) {
  const { value } = await request(fetchImpl, '/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password },
  });
  if (typeof value?.accessToken !== 'string' || typeof value?.sessionId !== 'string'
      || typeof value?.user?.id !== 'string') {
    fail(`The ${account.role} WP132 login did not return an exact session.`);
  }
  return { token: value.accessToken, sessionId: value.sessionId, userId: value.user.id };
}

function accounts(vault) {
  return new Map(vault.accounts.map((entry) => [entry.role, entry]));
}

function exactJournal(path, allowedStatuses) {
  const { canonical, value } = readPrivateJson(path, 'The WP132 private journal');
  if (value?.schemaVersion !== 1 || value?.kind !== journalKind
      || !allowedStatuses.includes(value.status)
      || value.apiBaseUrl !== stagingApiBaseUrl || value.stripeLivemode !== false
      || value.paymentEndpointCalled !== false
      || typeof value.journeyVaultFile !== 'string'
      || typeof value.runId !== 'string'
      || typeof value.targetListing?.id !== 'string'
      || typeof value.targetListing?.title !== 'string'
      || typeof value.companionListing?.id !== 'string'
      || typeof value.companionListing?.title !== 'string'
      || typeof value.messageThreadId !== 'string') {
    fail('The WP132 private journal is incomplete or outside its expected state.');
  }
  return { canonical, journal: value };
}

export function readStagingReportBlockJournal(journalFile) {
  return exactJournal(journalFile, [
    'ready-for-pixel',
    'blocked-server-confirmed',
    'unblocked-server-confirmed',
    'cleanup-server-confirmed-session-revocation-pending',
    'cleanup-server-confirmed-recovery-required',
    'complete-restored',
  ]);
}

function exactBlocks(value) {
  if (!Array.isArray(value?.blocks)) fail('The Staging block truth is malformed.');
  return value.blocks;
}

function exactReports(value) {
  if (!Array.isArray(value?.reports)) fail('The Staging report truth is malformed.');
  return value.reports;
}

function exactThreads(value) {
  if (!Array.isArray(value?.threads)) fail('The Staging message truth is malformed.');
  return value.threads;
}

export function exactPublicSearchListingVisible(value, expected) {
  if (!Array.isArray(value?.listings)
      || typeof expected?.id !== 'string'
      || typeof expected?.title !== 'string') {
    return false;
  }
  return value.listings.length === 1
    && value.listings[0]?.id === expected.id
    && value.listings[0]?.title === expected.title;
}

export function exactPublicRunSearchListingsVisible(value, expected) {
  if (!Array.isArray(value?.listings) || !Array.isArray(expected) || expected.length !== 2) {
    return false;
  }
  const actual = value.listings.map((entry) => `${entry?.id ?? ''}\u001f${entry?.title ?? ''}`).sort();
  const required = expected.map((entry) => `${entry?.id ?? ''}\u001f${entry?.title ?? ''}`).sort();
  return actual.length === 2 && actual.every((entry, index) => entry === required[index]);
}

function listingBody(source, { id, title }) {
  return {
    id,
    title,
    description: 'Isoliertes Staging-Inserat fuer den aktuellen Report-und-Block-Durchlauf ohne Echtgeld.',
    categoryId: source.categoryId,
    subcategory: source.subcategory,
    tags: ['sit', 'wp132', 'report-block'],
    pricePerDay: source.pricePerDay,
    priceRaw: source.priceRaw ?? source.pricePerDay,
    priceUnit: source.priceUnit ?? 'day',
    currency: source.currency ?? 'EUR',
    deposit: null,
    photos: source.photos,
    locationText: source.locationText,
    city: source.city,
    country: source.country,
    lat: source.lat,
    lng: source.lng,
    geohash: 'private',
    condition: source.condition ?? 'good',
    minDays: 1,
    maxDays: 14,
    protectionModel: 'none',
    privateStatusConfirmed: true,
    status: 'draft',
    isActive: false,
  };
}

async function createActiveListing(fetchImpl, token, source, listing, image) {
  const form = new FormData();
  form.append('purpose', 'listing_image');
  form.append('file', new Blob([image], { type: 'image/png' }), 'sit-wp132-report-block.png');
  const upload = await request(fetchImpl, '/uploads', {
    method: 'POST', token, body: form, expected: [201],
  });
  if (typeof upload.value?.url !== 'string'
      || !upload.value.url.startsWith('https://staging.shareittoo.com/')) {
    fail('A WP132 listing upload did not return an exact Staging URL.');
  }
  const created = await request(fetchImpl, '/listings', {
    method: 'POST',
    token,
    body: { ...listingBody(source, listing), photos: [upload.value.url] },
    expected: [201],
  });
  if (created.value?.listing?.id !== listing.id
      || created.value.listing.status !== 'draft'
      || created.value.listing.isActive !== false) {
    fail('A WP132 same-owner listing was not created as an exact draft.');
  }
  const active = await request(fetchImpl, `/listings/${encodeURIComponent(listing.id)}/status`, {
    method: 'PATCH', token, body: { status: 'active' },
  });
  if (active.value?.listing?.id !== listing.id
      || active.value.listing.status !== 'active'
      || active.value.listing.isActive !== true) {
    fail('A WP132 same-owner listing was not activated exactly.');
  }
}

export async function prepareStagingReportBlockFixture({
  sourceVaultFile,
  journalFile,
  vaultRoot,
  imagePath = resolve(repositoryRoot, 'assets/images/shareittoo_app_icon_master.png'),
  fetchImpl = globalThis.fetch,
  now = new Date(),
  random = randomBytes,
  wait,
} = {}) {
  outsideRepository(journalFile, 'The WP132 private journal');
  if (typeof random !== 'function' || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail('The WP132 preparation dependencies are invalid.');
  }
  const prepared = await prepareStagingEmailVerifiedTwoRoleJourney({
    sourceVaultFile,
    ...(vaultRoot === undefined ? {} : { vaultRoot }),
    imagePath,
    fetchImpl,
    now,
    random,
  });
  const journeyVaultFile = prepared.vaultFile;
  let targetListing = null;
  let companionListing = null;
  try {
    const image = readFileSync(resolve(imagePath));
    if (image.length < 100) fail('The WP132 listing image is invalid.');
    await activateStagingEmailVerifiedJourneyFixture({
      vaultFile: journeyVaultFile,
      fetchImpl,
    });
    await runStagingNonBindingSimulation({
      vaultFile: journeyVaultFile,
      fetchImpl,
      now,
      random,
      ...(wait === undefined ? {} : { wait }),
    });
    await retireStagingNonBindingSimulation({
      vaultFile: journeyVaultFile,
      fetchImpl,
      now: new Date(now.getTime() + 1_000),
    });

    const { vault } = readEmailVerifiedJourneyVault(journeyVaultFile);
    const byRole = accounts(vault);
    const [owner, renter] = await Promise.all([
      login(fetchImpl, byRole.get('owner')),
      login(fetchImpl, byRole.get('renter')),
    ]);
    if (owner.userId === renter.userId) fail('The WP132 roles resolved to one principal.');
    const mine = await request(fetchImpl, '/listings/mine', { token: owner.token });
    const primary = (mine.value?.listings ?? []).filter((entry) => (
      entry?.id === vault.realTwoRoleJourney?.listingId
        && entry.title === vault.realTwoRoleJourney?.title
        && ['paused', 'ended'].includes(entry.status)
        && entry.isActive === false
    ));
    if (primary.length !== 1 || !Array.isArray(primary[0].photos) || primary[0].photos.length !== 1) {
      fail('The retired message-isolation listing is not exact.');
    }
    const suffix = random(4).toString('hex');
    targetListing = {
      id: `sit-${vault.runId}-${suffix}-report`,
      title: `SIT Meldung ${vault.runId}`,
    };
    companionListing = {
      id: `sit-${vault.runId}-${suffix}-visibility`,
      title: `SIT Sichtbarkeit ${vault.runId}`,
    };
    await createActiveListing(fetchImpl, owner.token, primary[0], targetListing, image);
    await createActiveListing(fetchImpl, owner.token, primary[0], companionListing, image);

  const [
    blockState,
    reportState,
    threadState,
    catalogState,
    targetSearchState,
    companionSearchState,
    runSearchState,
  ] = await Promise.all([
    request(fetchImpl, '/user-blocks', { token: renter.token }),
    request(fetchImpl, '/reports/mine', { token: renter.token }),
    request(fetchImpl, '/message-threads', { token: renter.token }),
    request(fetchImpl, '/listings?sort=newest&limit=100'),
    request(fetchImpl, `/listings?q=${encodeURIComponent(targetListing.title)}&sort=newest&limit=100`),
    request(fetchImpl, `/listings?q=${encodeURIComponent(companionListing.title)}&sort=newest&limit=100`),
    request(fetchImpl, `/listings?q=${encodeURIComponent(vault.runId)}&sort=newest&limit=100`),
  ]);
  if (exactBlocks(blockState.value).length !== 0) {
    fail('The WP132 renter has pre-existing blocks; no physical mutation is allowed.');
  }
  if (exactReports(reportState.value).some((entry) => (
    entry?.targetType === 'listing' && entry?.targetId === targetListing.id
  ))) {
    fail('The fresh WP132 listing already has a reporter-owned report.');
  }
  const messageThreadId = vault.nonBindingSimulation?.threadId;
  if (typeof messageThreadId !== 'string'
      || !exactThreads(threadState.value).some((entry) => entry?.id === messageThreadId)) {
    fail('The exact cancelled message thread is not visible before blocking.');
  }
  const publicIds = new Set((catalogState.value?.listings ?? []).map((entry) => entry?.id));
  if (!publicIds.has(targetListing.id) || !publicIds.has(companionListing.id)) {
    fail('Both active WP132 same-owner listings are not publicly visible.');
  }
  if (!exactPublicSearchListingVisible(targetSearchState.value, targetListing)
      || !exactPublicSearchListingVisible(companionSearchState.value, companionListing)) {
    fail('The WP132 exact-title Staging search is incomplete or ambiguous.');
  }
  if (!exactPublicRunSearchListingsVisible(
    runSearchState.value,
    [targetListing, companionListing],
  )) fail('The WP132 unique-run Staging search does not return exactly both listings.');

  writePrivateJson(journalFile, {
    schemaVersion: 1,
    kind: journalKind,
    status: 'ready-for-pixel',
    createdAt: now.toISOString(),
    apiBaseUrl: stagingApiBaseUrl,
    stripeLivemode: false,
    paymentEndpointCalled: false,
    journeyVaultFile,
    runId: vault.runId,
    ownerUserId: owner.userId,
    renterUserId: renter.userId,
    targetListing,
    companionListing,
    messageListingId: vault.realTwoRoleJourney.listingId,
    messageThreadId,
    preflight: {
      reporterBlocks: 0,
      exactTargetReports: 0,
      exactThreadVisible: true,
      bothSameOwnerListingsPublic: true,
      exactTitleSearches: 2,
      uniqueRunSearchListingCount: 2,
      bookingStatus: 'cancelled',
      contractCreated: false,
      reservationCreated: false,
      monetaryEffectMinor: 0,
    },
    recoveryRequired: true,
  });
    return Object.freeze({
      status: 'ready-for-pixel',
      exactTargetReports: 0,
      reporterBlocks: 0,
      exactThreadVisible: true,
      sameOwnerListingCount: 2,
      exactTitleSearches: 2,
      uniqueRunSearchListingCount: 2,
      bookingCancelled: true,
      paymentEndpointCalled: false,
      monetaryEffectMinor: 0,
      containsSecrets: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
    });
  } catch (error) {
    try {
      const { vault } = readEmailVerifiedJourneyVault(journeyVaultFile);
      const owner = await login(fetchImpl, accounts(vault).get('owner'));
      const mine = await request(fetchImpl, '/listings/mine', { token: owner.token });
      for (const expected of [targetListing, companionListing].filter(Boolean)) {
        const match = (mine.value?.listings ?? []).find((entry) => (
          entry?.id === expected.id && entry?.title === expected.title
        ));
        if (match && (match.status !== 'ended' || match.isActive !== false)) {
          await request(fetchImpl, `/listings/${encodeURIComponent(expected.id)}/status`, {
            method: 'PATCH', token: owner.token, body: { status: 'ended' },
          });
        }
      }
      await retireStagingEmailVerifiedTwoRoleJourney({
        vaultFile: journeyVaultFile,
        fetchImpl,
      });
    } catch {
      // The original fail-closed error remains authoritative; the private
      // journey vault retains exact identifiers for bounded recovery.
    }
    throw error;
  }
}

export async function inspectStagingReportBlockFixture({
  journalFile,
  expectedPhase,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!['blocked', 'unblocked'].includes(expectedPhase)) {
    fail('The WP132 inspection phase must be blocked or unblocked.');
  }
  const allowed = expectedPhase === 'blocked'
    ? ['ready-for-pixel', 'blocked-server-confirmed']
    : ['blocked-server-confirmed', 'unblocked-server-confirmed'];
  const { canonical, journal } = exactJournal(journalFile, allowed);
  const { vault } = readEmailVerifiedJourneyVault(journal.journeyVaultFile);
  const renter = await login(fetchImpl, accounts(vault).get('renter'));
  if (renter.userId !== journal.renterUserId) fail('The WP132 reporter principal changed.');
  const [blockState, reportState, threadState, catalogState] = await Promise.all([
    request(fetchImpl, '/user-blocks', { token: renter.token }),
    request(fetchImpl, '/reports/mine', { token: renter.token }),
    request(fetchImpl, '/message-threads', { token: renter.token }),
    request(fetchImpl, '/listings?sort=newest&limit=100'),
  ]);
  const reports = exactReports(reportState.value).filter((entry) => (
    entry?.targetType === 'listing'
      && entry?.targetId === journal.targetListing.id
      && entry?.reasonCode === 'fraud_or_deception'
      && ['open', 'triaged', 'investigating', 'actioned'].includes(entry?.status)
  ));
  if (reports.length !== 1) fail('The exact WP132 moderation report is not accepted exactly once.');
  const targetBlocks = exactBlocks(blockState.value).filter(
    (entry) => entry?.userId === journal.ownerUserId,
  );
  const threadVisible = exactThreads(threadState.value).some(
    (entry) => entry?.id === journal.messageThreadId,
  );
  if (expectedPhase === 'blocked' && (targetBlocks.length !== 1 || threadVisible)) {
    fail('The exact WP132 block or message isolation is not server-confirmed.');
  }
  if (expectedPhase === 'unblocked' && (targetBlocks.length !== 0 || exactBlocks(blockState.value).length !== 0)) {
    fail('The WP132 unblock did not restore server-confirmed empty truth.');
  }
  const publicIds = new Set((catalogState.value?.listings ?? []).map((entry) => entry?.id));
  if (!publicIds.has(journal.targetListing.id) || !publicIds.has(journal.companionListing.id)) {
    fail('The active WP132 listings unexpectedly left the public Staging catalog.');
  }
  journal.status = expectedPhase === 'blocked'
    ? 'blocked-server-confirmed'
    : 'unblocked-server-confirmed';
  journal[expectedPhase] = {
    exactTargetReportCount: 1,
    exactTargetBlockCount: targetBlocks.length,
    exactThreadVisible: threadVisible,
    bothSameOwnerListingsPublic: true,
    confirmedAt: new Date().toISOString(),
  };
  writePrivateJson(canonical, journal);
  return Object.freeze({
    status: journal.status,
    exactTargetReportCount: 1,
    exactTargetBlockCount: targetBlocks.length,
    exactThreadVisible: threadVisible,
    publicSameOwnerListingCount: 2,
    containsSecrets: false,
    containsAccountIdentifiers: false,
    containsFixtureIdentifiers: false,
  });
}

async function endExactListing(fetchImpl, ownerToken, expected) {
  const mine = await request(fetchImpl, '/listings/mine', { token: ownerToken });
  const matches = (mine.value?.listings ?? []).filter((entry) => (
    entry?.id === expected.id && entry?.title === expected.title
  ));
  if (matches.length !== 1) fail('A WP132 cleanup listing identity is not exact.');
  if (matches[0].status !== 'ended' || matches[0].isActive !== false) {
    const ended = await request(
      fetchImpl,
      `/listings/${encodeURIComponent(expected.id)}/status`,
      { method: 'PATCH', token: ownerToken, body: { status: 'ended' } },
    );
    if (ended.value?.listing?.id !== expected.id
        || ended.value.listing.title !== expected.title
        || ended.value.listing.status !== 'ended'
        || ended.value.listing.isActive !== false) {
      fail('A WP132 cleanup listing did not end exactly.');
    }
  }
}

export async function cleanupStagingReportBlockFixture({
  journalFile,
  fetchImpl = globalThis.fetch,
  wait = (milliseconds) => new Promise((resolveWait) =>
    setTimeout(resolveWait, milliseconds)),
} = {}) {
  if (typeof wait !== 'function') fail('A cleanup retry wait function is required.');
  const { canonical, journal } = exactJournal(journalFile, [
    'ready-for-pixel',
    'blocked-server-confirmed',
    'unblocked-server-confirmed',
    'cleanup-server-confirmed-session-revocation-pending',
    'cleanup-server-confirmed-recovery-required',
  ]);
  if (journal.status === 'cleanup-server-confirmed-recovery-required') {
    return Object.freeze({
      status: journal.status,
      recoveryRequired: true,
      containsSecrets: false,
      containsAccountIdentifiers: false,
      containsFixtureIdentifiers: false,
    });
  }
  const { vault } = readEmailVerifiedJourneyVault(journal.journeyVaultFile);
  const byRole = accounts(vault);
  let owner = null;
  let renter = null;
  if (journal.status !== 'cleanup-server-confirmed-session-revocation-pending') {
    [owner, renter] = await Promise.all([
      login(fetchImpl, byRole.get('owner')),
      login(fetchImpl, byRole.get('renter')),
    ]);
    if (owner.userId !== journal.ownerUserId || renter.userId !== journal.renterUserId) {
      fail('The WP132 cleanup principals changed.');
    }
    const beforeBlocks = exactBlocks(
      (await request(fetchImpl, '/user-blocks', { token: renter.token })).value,
    );
    const unrelatedBlocks = beforeBlocks.filter((entry) => entry?.userId !== owner.userId);
    if (unrelatedBlocks.length !== 0) {
      fail('The WP132 cleanup found an unrelated block and stopped without touching it.');
    }
    if (beforeBlocks.some((entry) => entry?.userId === owner.userId)) {
      await request(fetchImpl, `/user-blocks/${encodeURIComponent(owner.userId)}`, {
        method: 'DELETE', token: renter.token, expected: [204],
      });
    }
    if (exactBlocks((await request(fetchImpl, '/user-blocks', { token: renter.token })).value).length !== 0) {
      fail('The WP132 cleanup did not restore empty block truth.');
    }
    await endExactListing(fetchImpl, owner.token, journal.targetListing);
    await endExactListing(fetchImpl, owner.token, journal.companionListing);
    await retireStagingEmailVerifiedTwoRoleJourney({
      vaultFile: journal.journeyVaultFile,
      fetchImpl,
    });

    const [catalogState, reportState] = await Promise.all([
      request(fetchImpl, '/listings?sort=newest&limit=100'),
      request(fetchImpl, '/reports/mine', { token: renter.token }),
    ]);
    const retiredIds = new Set([
      journal.targetListing.id,
      journal.companionListing.id,
      journal.messageListingId,
    ]);
    if ((catalogState.value?.listings ?? []).some((entry) => retiredIds.has(entry?.id))) {
      fail('A retired WP132 listing remains visible in the public catalog.');
    }
    const retainedReports = exactReports(reportState.value).filter((entry) => (
      entry?.targetType === 'listing' && entry?.targetId === journal.targetListing.id
    ));
    if (retainedReports.length > 1) fail('The WP132 report audit count is ambiguous.');
    journal.status = 'cleanup-server-confirmed-session-revocation-pending';
    journal.cleanup = {
      exactListingsEnded: 3,
      exactListingsAbsentFromPublicCatalog: 3,
      exactBlockCount: 0,
      retainedModerationReportCount: retainedReports.length,
      sessionRevocation: { owner: false, renter: false },
      exactRoleSessionsRevoked: false,
      protectedOwnerSessionRestored: false,
      serverCleanupAt: new Date().toISOString(),
    };
    journal.recoveryRequired = true;
    writePrivateJson(canonical, journal);
  }

  for (const role of ['owner', 'renter']) {
    if (journal.cleanup.sessionRevocation[role] === true) continue;
    const expectedUserId = role === 'owner' ? journal.ownerUserId : journal.renterUserId;
    let session = role === 'owner' ? owner : renter;
    let revoked = false;
    let lastFailure = null;
    for (let attempt = 0; attempt < 3 && !revoked; attempt += 1) {
      if (session === null) session = await login(fetchImpl, byRole.get(role));
      if (session.userId !== expectedUserId) {
        fail(`The WP132 ${role} cleanup principal changed.`);
      }
      try {
        await request(fetchImpl, '/auth/logout-all', {
          method: 'POST', token: session.token, expected: [204],
        });
        revoked = true;
      } catch (error) {
        lastFailure = error;
        session = null;
        if (attempt < 2) await wait(400 * (attempt + 1));
      }
    }
    if (!revoked) throw lastFailure;
    journal.cleanup.sessionRevocation[role] = true;
    writePrivateJson(canonical, journal);
  }
  journal.status = 'cleanup-server-confirmed-recovery-required';
  journal.cleanup.exactRoleSessionsRevoked = true;
  journal.cleanup.completedAt = new Date().toISOString();
  journal.recoveryRequired = true;
  writePrivateJson(canonical, journal);
  return Object.freeze({
    status: journal.status,
    exactListingsEnded: 3,
    exactBlockCount: 0,
    retainedModerationReportCount: journal.cleanup.retainedModerationReportCount,
    exactRoleSessionsRevoked: true,
    recoveryRequired: true,
    paymentEndpointCalled: false,
    monetaryEffectMinor: 0,
    containsSecrets: false,
    containsAccountIdentifiers: false,
    containsFixtureIdentifiers: false,
  });
}

export function markStagingReportBlockPixelRestored({ journalFile } = {}) {
  const { canonical, journal } = exactJournal(journalFile, [
    'cleanup-server-confirmed-recovery-required',
    'complete-restored',
  ]);
  if (journal.status !== 'complete-restored') {
    journal.status = 'complete-restored';
    journal.recoveryRequired = false;
    journal.cleanup.protectedOwnerSessionRestored = true;
    journal.cleanup.restoredAt = new Date().toISOString();
    writePrivateJson(canonical, journal);
  }
  return Object.freeze({
    status: 'complete-restored',
    recoveryRequired: false,
    protectedOwnerSessionRestored: true,
    containsSecrets: false,
    containsAccountIdentifiers: false,
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
  const journalFile = argumentValue(args, '--journal-file')
    ?? fail('--journal-file is required.');
  let result;
  if (phase === 'prepare') {
    result = await prepareStagingReportBlockFixture({
      sourceVaultFile: argumentValue(args, '--source-vault-file')
        ?? fail('--source-vault-file is required.'),
      journalFile,
      ...(argumentValue(args, '--vault-root')
        ? { vaultRoot: argumentValue(args, '--vault-root') }
        : {}),
    });
  } else if (phase === 'inspect-blocked' || phase === 'inspect-unblocked') {
    result = await inspectStagingReportBlockFixture({
      journalFile,
      expectedPhase: phase === 'inspect-blocked' ? 'blocked' : 'unblocked',
    });
  } else if (phase === 'cleanup') {
    result = await cleanupStagingReportBlockFixture({ journalFile });
  } else if (phase === 'mark-restored') {
    result = markStagingReportBlockPixelRestored({ journalFile });
  } else {
    fail('Unknown WP132 phase.');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP132 Staging fixture failed.'}\n`);
    process.exitCode = 1;
  });
}
