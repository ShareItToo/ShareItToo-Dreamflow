#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { storeScreenshotListings } from './prepare_store_screenshot_fixture.mjs';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';
const curatedIds = new Set([
  'sit-store-preview-v1-drill',
  'sit-store-preview-v1-camera',
  'sit-store-preview-v1-tent',
  'sit-store-preview-v1-projector',
]);
const neutralTitles = [
  'Kamera-Set für den Wochenendausflug',
  'Werkzeugkoffer für kleine Heimprojekte',
  'Camping-Set für vier Personen',
  'Heimkino-Set mit kompakter Leinwand',
  'Outdoor-Set für einen Tagesausflug',
  'Praktisches Technik-Set zum Ausleihen',
];
const technicalPlaceholderSha256 = '3dcd287aefca14c935670f356afcf7517a69a5569de3f674743c825c8e0e9913';
const syntheticAssetRoot = resolve(repositoryRoot, 'store/assets/synthetic-listings');

function fail(message) {
  throw new Error(message);
}

function outsideRepository(path, label, expectedType) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(`${label} must be an absolute path.`);
  const canonical = realpathSync(path);
  const rel = relative(repositoryRoot, canonical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    fail(`${label} must remain outside the repository.`);
  }
  const stat = lstatSync(canonical);
  if (stat.isSymbolicLink() || !stat[expectedType]()) fail(`${label} has an invalid type.`);
  return { canonical, stat };
}

function readVault(path) {
  const { canonical, stat } = outsideRepository(path, 'vault', 'isFile');
  if ((stat.mode & 0o077) !== 0) fail('vault must be private.');
  const vault = JSON.parse(readFileSync(canonical, 'utf8'));
  if (vault.schemaVersion !== 1 || vault.kind !== 'sit-staging-synthetic-account-vault' ||
      vault.apiBaseUrl !== stagingApiBaseUrl || vault.stripeLivemode !== false) {
    fail('The selected vault is not an isolated Staging fixture.');
  }
  return vault;
}

function collectAcceptedListingIds(value, target = new Set()) {
  if (!value || typeof value !== 'object') return target;
  if (typeof value.listingId === 'string' && value.workflowStatus === 'accepted' &&
      typeof value.bookingId === 'string') {
    target.add(value.listingId);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'accounts') collectAcceptedListingIds(child, target);
  }
  return target;
}

function loadCleanupScope(vaultRoot) {
  const { canonical: root } = outsideRepository(vaultRoot, 'vault root', 'isDirectory');
  const protectedIds = new Set();
  const owners = new Map();
  let validVaults = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, 'accounts.json');
    let vault;
    try {
      vault = readVault(path);
    } catch {
      continue;
    }
    validVaults += 1;
    const vaultProtectedIds = vault.status === 'synthetic-booking-active'
      ? collectAcceptedListingIds(vault)
      : new Set();
    for (const id of vaultProtectedIds) protectedIds.add(id);
    if (vault.status === 'synthetic-disposable-account-deleted') continue;
    const owner = vault.accounts?.find((account) => account?.role === 'owner');
    if (typeof owner?.email !== 'string' || typeof owner?.password !== 'string') continue;
    const key = `${owner.email}\u0000${owner.password}`;
    const scopedOwner = owners.get(key) ?? {
      email: owner.email, password: owner.password, protectedIds: new Set(),
    };
    for (const id of vaultProtectedIds) scopedOwner.protectedIds.add(id);
    owners.set(key, scopedOwner);
  }
  if (validVaults === 0 || owners.size === 0) {
    fail('The private Staging vault scope is incomplete.');
  }
  return { owners: [...owners.values()], protectedIds, validVaults };
}

async function login(fetchImpl, owner) {
  const response = await fetchImpl(`${stagingApiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: owner.email, password: owner.password }),
  });
  if ([401, 403].includes(response.status)) return null;
  const raw = await response.text();
  let value;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    fail('Staging login returned a non-JSON response.');
  }
  if (!response.ok || typeof value?.accessToken !== 'string') fail('Synthetic Staging login failed.');
  return value.accessToken;
}

async function request(fetchImpl, path, { method = 'GET', token, body, expected = [200] } = {}) {
  const response = await fetchImpl(`${stagingApiBaseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    fail(`Staging ${method} request returned a non-JSON response.`);
  }
  if (!expected.includes(response.status)) fail(`Staging ${method} request failed with HTTP ${response.status}.`);
  return value;
}

function isTechnical(listing) {
  return /^SIT Rollenprüfung\b/u.test(listing?.title ?? '');
}

function isStrictSyntheticRoleFixture(listing) {
  const tags = Array.isArray(listing?.tags) ? listing.tags : [];
  return isTechnical(listing) && tags.includes('sit') && tags.includes('role-fixture');
}

const terminalBookingStatuses = new Set([
  'completed', 'declined', 'cancelled', 'refunded',
]);

function activeListings(value) {
  return (Array.isArray(value?.listings) ? value.listings : [])
    .filter((listing) => listing?.isActive !== false && listing?.status === 'active');
}

async function rollback(fetchImpl, mutations) {
  for (const mutation of [...mutations].reverse()) {
    if (mutation.kind === 'pause') {
      await request(fetchImpl, `/listings/${encodeURIComponent(mutation.listing.id)}/status`, {
        method: 'PATCH', token: mutation.token, body: { status: 'active' },
      }).catch(() => {});
    } else {
      await request(fetchImpl, `/listings/${encodeURIComponent(mutation.listing.id)}`, {
        method: 'PUT', token: mutation.token, body: mutation.listing,
      }).catch(() => {});
    }
  }
}

async function publicActiveListings(fetchImpl) {
  const result = [];
  for (let offset = 0, page = 0; page < 100; page += 1, offset += 100) {
    const value = await request(fetchImpl, `/listings?limit=100&offset=${offset}`);
    result.push(...activeListings(value));
    if (value?.page?.hasMore !== true) return result;
  }
  fail('The public Staging catalog exceeded the bounded verification window.');
}

function replacementDefinition(title) {
  const imageName = /Werkzeug/u.test(title) ? 'cordless-drill.png'
    : /(Camping|Outdoor)/u.test(title) ? 'camping-tent.png'
      : /Heimkino/u.test(title) ? 'home-projector.png'
        : 'mirrorless-camera.png';
  return storeScreenshotListings.find((entry) => entry.imageName === imageName);
}

function neutralMetadata(listing, definition) {
  return {
    ...listing,
    description: definition.description,
    categoryId: definition.categoryId,
    subcategory: definition.subcategory,
    tags: [...definition.tags],
    condition: definition.condition,
  };
}

function verifiedReplacementBytes(definition) {
  const bytes = readFileSync(resolve(syntheticAssetRoot, definition.imageName));
  if (bytes.length < 10_000 ||
      createHash('sha256').update(bytes).digest('hex') !== definition.imageSha256) {
    fail('A curated synthetic replacement image is missing or changed.');
  }
  return bytes;
}

async function currentPhotoHash(fetchImpl, listing) {
  const url = listing?.photos?.[0];
  if (typeof url !== 'string' || !url.startsWith('https://staging.shareittoo.com/')) {
    return { reachable: false, sha256: null };
  }
  const response = await fetchImpl(url);
  if (!response.ok) return { reachable: false, sha256: null };
  return {
    reachable: true,
    sha256: createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),
  };
}

async function uploadReplacement(fetchImpl, token, definition) {
  const form = new FormData();
  form.append('purpose', 'listing_image');
  form.append('file', new Blob([verifiedReplacementBytes(definition)], { type: 'image/png' }), definition.imageName);
  const upload = await request(fetchImpl, '/uploads', {
    method: 'POST', token, body: form, expected: [201],
  });
  if (typeof upload?.url !== 'string' || !upload.url.startsWith('https://staging.shareittoo.com/')) {
    fail('A protected Staging replacement image did not return a safe URL.');
  }
  return upload.url;
}

export async function cleanStagingStoreFeed({
  vaultFile,
  vaultRoot,
  fetchImpl = globalThis.fetch,
  placeholderSha256 = technicalPlaceholderSha256,
}) {
  readVault(vaultFile); // Explicit operator-selected private anchor; its secrets are never emitted.
  const { owners, protectedIds, validVaults } = loadCleanupScope(vaultRoot);
  if (protectedIds.size === 0) fail('The private Staging vault scope is incomplete.');
  const sessions = [];
  let skippedHistoricalOwners = 0;
  for (const owner of owners) {
    const token = await login(fetchImpl, owner);
    if (token === null) {
      if (owner.protectedIds.size > 0) fail('An owner of an accepted protected booking is not accessible.');
      skippedHistoricalOwners += 1;
      continue;
    }
    const mine = await request(fetchImpl, '/listings/mine', { token });
    sessions.push({ token, listings: Array.isArray(mine?.listings) ? mine.listings : [] });
  }

  const ownedIds = new Set(sessions.flatMap(({ listings }) => listings.map(({ id }) => id)));
  for (const id of protectedIds) {
    if (!ownedIds.has(id)) fail('An accepted protected Staging booking has no accessible owner listing.');
  }

  const mutations = [];
  let renamed = 0;
  let paused = 0;
  let replacedPhotos = 0;
  try {
    const seen = new Set();
    for (const session of sessions) {
      for (const listing of activeListings({ listings: session.listings })) {
        if (seen.has(listing.id)) continue;
        seen.add(listing.id);
        if (!isTechnical(listing) || curatedIds.has(listing.id)) continue;
        if (protectedIds.has(listing.id)) {
          const title = neutralTitles[renamed % neutralTitles.length];
          await request(fetchImpl, `/listings/${encodeURIComponent(listing.id)}`, {
            method: 'PUT', token: session.token, body: { ...listing, title },
          });
          mutations.push({ kind: 'rename', token: session.token, listing });
          renamed += 1;
        } else {
          await request(fetchImpl, `/listings/${encodeURIComponent(listing.id)}/status`, {
            method: 'PATCH', token: session.token, body: { status: 'paused' },
          });
          mutations.push({ kind: 'pause', token: session.token, listing });
          paused += 1;
        }
      }
    }

    for (const session of sessions) {
      const verified = await request(fetchImpl, '/listings/mine', { token: session.token });
      if (activeListings(verified).some(isTechnical)) {
        fail('An active technical owner listing remained after cleanup.');
      }
      for (const listing of activeListings(verified).filter(({ id }) => protectedIds.has(id))) {
        const currentPhoto = await currentPhotoHash(fetchImpl, listing);
        if (currentPhoto.reachable && currentPhoto.sha256 !== placeholderSha256) continue;
        const definition = replacementDefinition(listing.title);
        const photoUrl = await uploadReplacement(fetchImpl, session.token, definition);
        await request(fetchImpl, `/listings/${encodeURIComponent(listing.id)}`, {
          method: 'PUT',
          token: session.token,
          body: { ...neutralMetadata(listing, definition), photos: [photoUrl] },
        });
        mutations.push({ kind: 'photo', token: session.token, listing });
        replacedPhotos += 1;
      }
    }
    const publicListings = await publicActiveListings(fetchImpl);
    if (publicListings.some(isTechnical)) {
      fail('The public Staging catalog still contains technical listing copy.');
    }
    if ([...curatedIds].some((id) => !publicListings.some((listing) => listing.id === id))) {
      fail('The public Staging catalog is missing a curated screenshot listing.');
    }
    if ([...protectedIds].some((id) => !publicListings.some((listing) => listing.id === id))) {
      fail('The public Staging catalog is missing a protected accepted-booking listing.');
    }
    for (const listing of publicListings.filter(({ id }) => protectedIds.has(id))) {
      const currentPhoto = await currentPhotoHash(fetchImpl, listing);
      if (!currentPhoto.reachable || currentPhoto.sha256 === placeholderSha256) {
        fail('A protected Staging listing still has an invalid public image.');
      }
    }
  } catch (error) {
    await rollback(fetchImpl, mutations);
    throw error;
  }

  return {
    status: 'staging-store-feed-clean',
    privateVaultsChecked: validVaults,
    syntheticOwnersChecked: sessions.length,
    skippedHistoricalOwners,
    pausedTechnicalListings: paused,
    renamedProtectedListings: renamed,
    replacedProtectedPlaceholderPhotos: replacedPhotos,
    curatedActiveListings: curatedIds.size,
    protectedActiveBookings: protectedIds.size,
    publicTechnicalListingsRemaining: 0,
    protectedBookingsPreserved: true,
    productionChanged: false,
    listingDeleted: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsListingIdentifiers: false,
  };
}

export async function retireOrphanedStagingTechnicalListings({
  vaultRoot,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { owners, validVaults } = loadCleanupScope(vaultRoot);
  const sessions = [];
  let skippedHistoricalOwners = 0;
  for (const owner of owners) {
    const token = await login(fetchImpl, owner);
    if (token === null) {
      skippedHistoricalOwners += 1;
      continue;
    }
    const [mine, requests] = await Promise.all([
      request(fetchImpl, '/listings/mine', { token }),
      request(fetchImpl, '/rental-requests', { token }),
    ]);
    sessions.push({
      token,
      listings: Array.isArray(mine?.listings) ? mine.listings : [],
      bookings: Array.isArray(requests?.requests) ? requests.requests : [],
    });
  }
  if (sessions.length === 0) fail('No accessible synthetic Staging owner remains.');

  const mutations = [];
  let paused = 0;
  let protectedByBooking = 0;
  try {
    const seen = new Set();
    for (const session of sessions) {
      for (const listing of activeListings({ listings: session.listings })) {
        if (seen.has(listing.id) || !isStrictSyntheticRoleFixture(listing)) continue;
        seen.add(listing.id);
        const activeBooking = session.bookings.some((booking) => (
          booking?.itemId === listing.id
          && typeof booking?.workflowStatus === 'string'
          && !terminalBookingStatuses.has(booking.workflowStatus)
        ));
        if (activeBooking) {
          protectedByBooking += 1;
          continue;
        }
        await request(fetchImpl, `/listings/${encodeURIComponent(listing.id)}/status`, {
          method: 'PATCH', token: session.token, body: { status: 'paused' },
        });
        mutations.push({ kind: 'pause', token: session.token, listing });
        paused += 1;
      }
    }

    for (const session of sessions) {
      const [mine, requests] = await Promise.all([
        request(fetchImpl, '/listings/mine', { token: session.token }),
        request(fetchImpl, '/rental-requests', { token: session.token }),
      ]);
      const activeBookings = Array.isArray(requests?.requests) ? requests.requests : [];
      const unsafe = activeListings(mine).filter(isStrictSyntheticRoleFixture).filter(
        (listing) => !activeBookings.some((booking) => (
          booking?.itemId === listing.id
          && typeof booking?.workflowStatus === 'string'
          && !terminalBookingStatuses.has(booking.workflowStatus)
        )),
      );
      if (unsafe.length > 0) fail('An orphaned active technical listing remained after cleanup.');
    }
    const publicListings = await publicActiveListings(fetchImpl);
    if (publicListings.some((listing) => (
      isStrictSyntheticRoleFixture(listing)
      && !sessions.some((session) => session.bookings.some((booking) => (
        booking?.itemId === listing.id
        && typeof booking?.workflowStatus === 'string'
        && !terminalBookingStatuses.has(booking.workflowStatus)
      )))
    ))) {
      fail('The public Staging catalog still contains an unprotected technical listing.');
    }
  } catch (error) {
    await rollback(fetchImpl, mutations);
    throw error;
  }

  return Object.freeze({
    status: 'orphaned-staging-technical-listings-retired',
    privateVaultsChecked: validVaults,
    syntheticOwnersChecked: sessions.length,
    skippedHistoricalOwners,
    pausedTechnicalListings: paused,
    activeTechnicalListingsProtectedByBooking: protectedByBooking,
    productionChanged: false,
    listingDeleted: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsListingIdentifiers: false,
  });
}

async function main() {
  const mode = process.env.SIT_STAGING_FEED_MODE?.trim() || 'store-curated';
  const result = mode === 'technical-only'
    ? await retireOrphanedStagingTechnicalListings({
      vaultRoot: process.env.SIT_STAGING_ACCOUNT_VAULT_ROOT,
    })
    : mode === 'store-curated'
      ? await cleanStagingStoreFeed({
        vaultFile: process.env.SIT_STAGING_ACCOUNT_VAULT,
        vaultRoot: process.env.SIT_STAGING_ACCOUNT_VAULT_ROOT,
      })
      : fail('SIT_STAGING_FEED_MODE must be store-curated or technical-only.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? 'Staging feed cleanup failed.'}\n`);
    process.exitCode = 1;
  });
}
