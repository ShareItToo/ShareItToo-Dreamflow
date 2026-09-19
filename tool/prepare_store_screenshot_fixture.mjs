#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const stagingApiBaseUrl = 'https://staging.shareittoo.com/api/v1';

export const storeScreenshotListings = Object.freeze([
  Object.freeze({
    id: 'sit-store-preview-v1-drill',
    title: 'Akku-Bohrschrauber mit Zubehör',
    description: 'Handlicher Akku-Bohrschrauber mit Ladegerät, zwei Akkus und praktischem Zubehörkoffer.',
    categoryId: 'cat8',
    subcategory: 'Elektrowerkzeuge',
    tags: Object.freeze(['werkzeug', 'bohrschrauber']),
    pricePerDay: 9,
    condition: 'good',
    imageName: 'cordless-drill.png',
    imageSha256: '6028e8b513f5ead1a38362cc057c246ebbf1203604420baf18ddd94f7c1914bc',
  }),
  Object.freeze({
    id: 'sit-store-preview-v1-camera',
    title: 'Kamera-Set mit Tasche',
    description: 'Kompakte Systemkamera mit Objektiv, Akku, Ladegerät und gepolsterter Tragetasche.',
    categoryId: 'cat3',
    subcategory: 'Kameras',
    tags: Object.freeze(['kamera', 'foto']),
    pricePerDay: 18,
    condition: 'like-new',
    imageName: 'mirrorless-camera.png',
    imageSha256: 'a1a9eab6c1942b1c32ac7d6515340786f1bc7fab29902fcb6f8bdd0d1e770b81',
  }),
  Object.freeze({
    id: 'sit-store-preview-v1-tent',
    title: '4-Personen-Campingzelt',
    description: 'Geräumiges Campingzelt für bis zu vier Personen inklusive Gestänge, Heringen und Packsack.',
    categoryId: 'cat23',
    subcategory: 'Zelte',
    tags: Object.freeze(['camping', 'zelt']),
    pricePerDay: 12,
    condition: 'good',
    imageName: 'camping-tent.png',
    imageSha256: '12bc7088334d86833f1743be61e03fa6e9206ec5e4b1d2cf99afc5a0aa9c957e',
  }),
  Object.freeze({
    id: 'sit-store-preview-v1-projector',
    title: 'Heimkino-Beamer mit Leinwand',
    description: 'Heller Heimkino-Beamer mit Fernbedienung, Anschlusskabeln und kompakter Leinwand.',
    categoryId: 'cat1',
    subcategory: 'Beamer',
    tags: Object.freeze(['beamer', 'heimkino']),
    pricePerDay: 15,
    condition: 'like-new',
    imageName: 'home-projector.png',
    imageSha256: '6b3289386e9a7b7d371a438b0e4c3c15fae193576f0b8324ffbdf691025458db',
  }),
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

function ownerAccountFromVault(vaultFile) {
  let vault;
  try {
    vault = JSON.parse(readFileSync(privateVaultFile(vaultFile), 'utf8'));
  } catch {
    fail('The synthetic account vault is invalid.');
  }
  const allowedStatuses = new Set([
    'fixture-verified-ready-for-login',
    'email-link-verified-ready-for-login',
    'synthetic-booking-active',
    'synthetic-booking-completed',
    'synthetic-booking-terminal',
  ]);
  if (vault?.schemaVersion !== 1
      || vault?.kind !== 'sit-staging-synthetic-account-vault'
      || vault?.apiBaseUrl !== stagingApiBaseUrl
      || vault?.stripeLivemode !== false
      || !allowedStatuses.has(vault?.status)
      || !Array.isArray(vault?.accounts)) {
    fail('The vault is not an isolated Staging account set.');
  }
  const owner = vault.accounts.find((account) => account?.role === 'owner');
  if (typeof owner?.email !== 'string'
      || typeof owner?.password !== 'string'
      || owner.password.length < 12) {
    fail('The vault does not contain a valid synthetic owner account.');
  }
  return owner;
}

async function request(fetchImpl, path, {
  method = 'GET',
  token = null,
  body = undefined,
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
    },
    body: body === undefined || body instanceof FormData
      ? body
      : JSON.stringify(body),
  });
  const raw = await response.text();
  let value = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  if (!expected.includes(response.status)) {
    fail(`Staging ${method} request failed with HTTP ${response.status}.`);
  }
  return value;
}

function verifiedImage(definition, assetRoot) {
  const path = resolve(assetRoot, definition.imageName);
  const bytes = readFileSync(path);
  if (bytes.length < 10_000
      || createHash('sha256').update(bytes).digest('hex') !== definition.imageSha256) {
    fail(`The curated ${definition.imageName} asset is missing or changed.`);
  }
  return bytes;
}

async function publicImageIsReachable(fetchImpl, listing) {
  const url = listing?.photos?.[0];
  if (typeof url !== 'string' || !url.startsWith('https://staging.shareittoo.com/')) return false;
  try {
    const response = await fetchImpl(url);
    return response.ok;
  } catch {
    return false;
  }
}

function listingPayload(definition, photoUrl) {
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    categoryId: definition.categoryId,
    subcategory: definition.subcategory,
    tags: [...definition.tags],
    pricePerDay: definition.pricePerDay,
    priceRaw: definition.pricePerDay,
    priceUnit: 'day',
    currency: 'EUR',
    deposit: null,
    photos: [photoUrl],
    locationText: 'Berlin',
    city: 'Berlin',
    country: 'Deutschland',
    lat: 52.52,
    lng: 13.405,
    geohash: 'private',
    condition: definition.condition,
    minDays: 1,
    maxDays: 14,
    protectionModel: 'none',
    status: 'active',
    isActive: true,
  };
}

async function uploadListingImage(fetchImpl, token, definition, assetRoot) {
  const bytes = verifiedImage(definition, assetRoot);
  const form = new FormData();
  form.append('purpose', 'listing_image');
  form.append('file', new Blob([bytes], { type: 'image/png' }), definition.imageName);
  const upload = await request(fetchImpl, '/uploads', {
    method: 'POST',
    token,
    body: form,
    expected: [201],
  });
  if (typeof upload?.url !== 'string'
      || !upload.url.startsWith('https://staging.shareittoo.com/')) {
    fail('A curated image upload did not return a Staging URL.');
  }
  return upload.url;
}

async function setAlwaysAvailable(fetchImpl, token, listingId) {
  await request(fetchImpl, `/listings/${encodeURIComponent(listingId)}/availability`, {
    method: 'PUT',
    token,
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

export async function prepareStoreScreenshotFixture({
  vaultFile,
  fetchImpl = globalThis.fetch,
  assetRoot = resolve(repositoryRoot, 'store/assets/synthetic-listings'),
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  const owner = ownerAccountFromVault(vaultFile);
  const session = await request(fetchImpl, '/auth/login', {
    method: 'POST',
    body: { email: owner.email, password: owner.password },
  });
  if (typeof session?.accessToken !== 'string' || session.accessToken.length < 20) {
    fail('The synthetic owner login did not return a usable session.');
  }

  const token = session.accessToken;
  const mine = await request(fetchImpl, '/listings/mine', { token });
  const existing = Array.isArray(mine?.listings) ? mine.listings : [];
  let createdCount = 0;
  let reusedCount = 0;

  for (const definition of storeScreenshotListings) {
    const byId = existing.find((listing) => listing?.id === definition.id);
    const byTitle = existing.filter((listing) => listing?.title === definition.title);
    if (byId && (byId.title !== definition.title || byId.status !== 'active')) {
      fail('A conflicting curated Staging listing already exists.');
    }
    if (!byId && byTitle.length > 0) {
      fail('A curated title already exists under an unexpected identifier.');
    }
    if (byId) {
      const imageReachable = await publicImageIsReachable(fetchImpl, byId);
      const photoUrl = imageReachable
        ? byId.photos[0]
        : await uploadListingImage(fetchImpl, token, definition, assetRoot);
      if (imageReachable) verifiedImage(definition, assetRoot);
      const updated = await request(fetchImpl, `/listings/${encodeURIComponent(definition.id)}`, {
        method: 'PUT',
        token,
        body: listingPayload(definition, photoUrl),
      });
      if (updated?.listing?.id !== definition.id) {
        fail('A curated Staging listing could not be reconciled safely.');
      }
      await setAlwaysAvailable(fetchImpl, token, definition.id);
      reusedCount += 1;
      continue;
    }

    const photoUrl = await uploadListingImage(
      fetchImpl,
      token,
      definition,
      assetRoot,
    );
    const created = await request(fetchImpl, '/listings', {
      method: 'POST',
      token,
      body: listingPayload(definition, photoUrl),
      expected: [201],
    });
    if (created?.listing?.id !== definition.id) {
      fail('A curated Staging listing was not created with its expected identifier.');
    }
    await setAlwaysAvailable(fetchImpl, token, definition.id);
    createdCount += 1;
  }

  return Object.freeze({
    status: 'store-screenshot-fixture-ready',
    listingCount: storeScreenshotListings.length,
    createdCount,
    reusedCount,
    target: 'staging-only',
    productionChanged: false,
    paymentEndpointCalled: false,
    containsSecrets: false,
    containsEmailAddresses: false,
    containsTokens: false,
    containsFixtureIdentifiers: false,
  });
}

async function main() {
  const result = await prepareStoreScreenshotFixture({
    vaultFile: process.env.SIT_STAGING_ACCOUNT_VAULT,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? 'Store screenshot fixture failed.'}\n`);
    process.exitCode = 1;
  });
}
