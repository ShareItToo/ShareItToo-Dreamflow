#!/usr/bin/env node

import { constants } from 'node:fs';
import { open, lstat, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const greenCatalogLocalBinding = Object.freeze({
  kind: 'sit-green-catalog-local-finalizer',
  schemaVersion: 1,
  runtime: Object.freeze({
    commit: 'd3c2f5d7d7516d3bfaac4b61689c2c433924cc6e',
  }),
  ops: Object.freeze({
    commit: '84408c04c0387a4412b8542ca1381d1be110ed1b',
  }),
  consumerSource: Object.freeze({
    commit: '64468ddaa1f0cf2494559ff11e82c0e1eca14db0',
    path: 'backend/ops/green_staging_promotion.mjs',
    sha256: '8e2dd7d47038555b36b917ca88b2e78e61d7e5365886929000004b1814abd8d3',
  }),
  image: Object.freeze({
    reference: 'ghcr.io/shareittoo/shareittoo-api:d3c2f5d7d7516d3bfaac4b61689c2c433924cc6e',
    digest: 'sha256:31b8b015eb0635b9fbb7d6c5e54ef43fe089d5b953dba8fa446aae2122a5888a',
  }),
  attempt: Object.freeze({ id: 'attempt-01', number: 1 }),
});

// This is the immutable catalog/database consumer contract reviewed at the
// consumer source commit above.  It is intentionally local: importing the
// mutable current promotion runner would falsely make producer Ops 844 the
// provenance of today's consumer semantics.
export const greenSyntheticCatalogItemKeys = Object.freeze([
  'approximateLocation', 'autoApplyDiscounts', 'availabilityMode', 'bookingAllowed',
  'cancellationPolicy', 'catalogClass', 'catalogRevision', 'categoryId', 'city',
  'condition', 'country', 'createdAt', 'deposit', 'description', 'endedAt',
  'geohash', 'handoverRadiusKm', 'includedAccessories', 'isActive', 'lat', 'lng',
  'longRentalDiscounts', 'locationText', 'maxDays', 'maxDeliveryKmAtDropoff',
  'maxPickupKmAtReturn', 'minDays', 'offersDeliveryAtDropoff',
  'offersExpressAtDropoff', 'offersPickupAtReturn', 'ownerDeclaration', 'ownerId',
  'paymentAllowed', 'photos', 'pilotRegionCode', 'pricePerDay', 'priceRaw',
  'priceUnit', 'privateStatusConfirmed', 'protectionModel', 'realOffer', 'status',
  'subcategory', 'syntheticNotice', 'tags', 'timesLent', 'title',
  'verificationStatus', 'currency', 'id',
].sort());

export const greenSyntheticCatalogProjection = Object.freeze({
  idDigest: '0fd441cd44dffb9d3273fac6b28bd618ffe6229d5cbfd9d3d8baadc8703ef2f7',
  ownerIdDigest: '902573394e86b5dd3add368d0f32e31f5cef12cd01f606a16a759a202aee7096',
  titleDigest: '8f444d762ed8e17c199039599129f3d1b6822bf7778ad2380e13cb3da613d78d',
  noticeDigest: '9abe85d87e270298352d3079602e860fac754b3e928a77caca1b1fbcc0a14be5',
  photoDigest: 'bd3496b7850a0cd6e7e186e788e9d7fd7a7284832d4c3631b54cc67ee4a9b32e',
  locationText: 'Heilbronn, Deutschland', city: 'Heilbronn', country: 'Deutschland',
  lat: 49.14, lng: 9.22, catalogClass: 'synthetic_noncontractual_catalog_only',
  realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
  isActive: true, status: 'active', verificationStatus: 'unverified', photoCount: 1,
});

export const greenDatabaseStateBaseline = Object.freeze({
  fixtureUserCount: 2, authCount: 6, refreshCount: 6, loginAuditCount: 6,
  activeAuthCount: 0, activeRefreshCount: 0, identityCount: 1, listingCount: 1,
  uploadCount: 1, bookingCount: 0, requestCount: 0, paymentCommandCount: 0,
  ledgerDigest: '796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196',
  authDigest: '7954076826c7df6cfdba5bdb88af8de7766b933f3df1aad27f355c8a36b74a65',
  catalogDigest: '92b6f79addcdc79db0280d21c034d7e1395249aaf631fba2314385e86e1da671',
});

const rootKeys = Object.freeze([
  'capturedAtUtc', 'catalog', 'consumerSource', 'database', 'image', 'kind', 'ops', 'runtime',
  'schemaVersion', 'status', 'attempt',
]);
const finalizedRootKeys = Object.freeze([...rootKeys, 'finalizedAtUtc'].sort());
const runtimeKeys = Object.freeze(['commit']);
const opsKeys = Object.freeze(['commit']);
const consumerSourceKeys = Object.freeze(['commit', 'path', 'sha256']);
const imageKeys = Object.freeze(['digest', 'reference']);
const attemptKeys = Object.freeze(['id', 'number']);
const catalogKeys = Object.freeze(['readback', 'source']);
const databaseKeys = Object.freeze(['after', 'before']);
const secretKey = /(?:password|secret|token|credential|privatekey|jwt|databaseurl)/iu;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactKeys(value, expected, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
  return value;
}

function assertNoSecretKeys(value, trail = 'document') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretKeys(entry, `${trail}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (secretKey.test(key)) fail(`green_catalog_local_secret_field:${trail}.${key}`);
    assertNoSecretKeys(entry, `${trail}.${key}`);
  }
}

function assertCommit(value, expected, code) {
  if (value !== expected) fail(code);
  return value;
}

function assertUtc(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
      || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fileIdentity(metadata) {
  return Object.freeze({
    dev: metadata.dev, ino: metadata.ino, size: metadata.size, nlink: metadata.nlink,
    mode: metadata.mode & 0o777, uid: metadata.uid,
    mtimeNs: String(metadata.mtimeNs), ctimeNs: String(metadata.ctimeNs),
  });
}

function sameFileIdentity(left, right) {
  return left && right && ['dev', 'ino', 'size', 'nlink', 'mode', 'uid', 'mtimeNs', 'ctimeNs']
    .every((key) => left[key] === right[key]);
}

function sameOwnedFileIdentity(left, right) {
  return left && right && left.dev === right.dev && left.ino === right.ino && left.uid === right.uid;
}

function sameStableFileIdentity(left, right) {
  return left && right && ['dev', 'ino', 'nlink', 'mode', 'uid']
    .every((key) => left[key] === right[key]);
}

function assertPrivateFileMetadata(metadata, mode, code) {
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : metadata.uid;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || (metadata.mode & 0o777) !== mode || metadata.uid !== ownerUid) fail(code);
  return fileIdentity(metadata);
}

async function removeOwnedOutput(filePath, identity) {
  if (!identity) return;
  try {
    const metadata = await lstat(filePath);
    if (metadata.isFile() && !metadata.isSymbolicLink()
        && sameOwnedFileIdentity(fileIdentity(metadata), identity)) await unlink(filePath);
  } catch {
    // A failed cleanup remains a failure; never unlink an identity we did not create.
  }
}

const catalogReadbackKeys = Object.freeze([
  'attempts', 'bookingAllowed', 'canonicalValues', 'catalogClass', 'city', 'converged',
  'count', 'country', 'idDigest', 'isActive', 'lat', 'listingStatus', 'lng',
  'locationText', 'noticeDigest', 'ownerDeclaration', 'ownerIdDigest', 'pageCount',
  'paymentAllowed', 'photoCount', 'photoDigest', 'photoReachable', 'realOffer', 'rowKeys',
  'status', 'strictItemCompatible', 'titleDigest', 'verificationStatus',
].sort());

export function assertGreenSyntheticCatalogPublicReadback(value, { requirePhotoReachable = false } = {}) {
  exactKeys(value, catalogReadbackKeys, 'green_catalog_local_catalog_readback_shape_invalid');
  if (value.status !== 200 || value.count !== 1 || value.pageCount !== 1
      || value.converged !== true || !Number.isInteger(value.attempts)
      || value.attempts < 1 || value.attempts > 8
      || JSON.stringify(value.rowKeys) !== JSON.stringify(greenSyntheticCatalogItemKeys)
      || value.idDigest !== greenSyntheticCatalogProjection.idDigest
      || value.ownerIdDigest !== greenSyntheticCatalogProjection.ownerIdDigest
      || value.titleDigest !== greenSyntheticCatalogProjection.titleDigest
      || value.noticeDigest !== greenSyntheticCatalogProjection.noticeDigest
      || value.photoCount !== greenSyntheticCatalogProjection.photoCount
      || value.photoDigest !== greenSyntheticCatalogProjection.photoDigest
      || value.locationText !== greenSyntheticCatalogProjection.locationText
      || value.city !== greenSyntheticCatalogProjection.city
      || value.country !== greenSyntheticCatalogProjection.country
      || value.lat !== greenSyntheticCatalogProjection.lat || value.lng !== greenSyntheticCatalogProjection.lng
      || value.catalogClass !== greenSyntheticCatalogProjection.catalogClass
      || value.realOffer !== false || value.ownerDeclaration !== false
      || value.bookingAllowed !== false || value.paymentAllowed !== false
      || value.isActive !== true || value.listingStatus !== greenSyntheticCatalogProjection.status
      || value.verificationStatus !== greenSyntheticCatalogProjection.verificationStatus
      || value.strictItemCompatible !== true || value.canonicalValues !== true
      || value.photoReachable !== (requirePhotoReachable ? true : null)) {
    fail('green_catalog_local_catalog_readback_invalid');
  }
  return true;
}

export function assertGreenDatabaseStateReadback(value, expected = greenDatabaseStateBaseline) {
  exactKeys(value, Object.keys(greenDatabaseStateBaseline), 'green_catalog_local_database_readback_shape_invalid');
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith('Digest')) {
      if (typeof entry !== 'string' || !/^[0-9a-f]{64}$/u.test(entry)) fail('green_catalog_local_database_readback_invalid');
    } else if (!Number.isInteger(entry) || entry < 0) {
      fail('green_catalog_local_database_readback_invalid');
    }
  }
  if (canonicalJson(value) !== canonicalJson(expected)) fail('green_catalog_local_database_changed');
  return Object.freeze(value);
}

function safePath(filePath, code) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath) || resolve(filePath) !== filePath
      || !filePath.endsWith('.json') || basename(filePath).startsWith('.')
      || filePath === repositoryRoot || !relative(repositoryRoot, filePath).startsWith('..')) fail(code);
  return filePath;
}

async function assertSafeParent(filePath) {
  const parent = dirname(filePath);
  const root = resolve('/');
  const components = parent.slice(root.length).split('/').filter(Boolean);
  let current = root;
  let metadata;
  if (components.length === 0) {
    try { metadata = await lstat(root); } catch { fail('green_catalog_local_parent_missing'); }
  }
  for (const component of components) {
    current = resolve(current, component);
    try { metadata = await lstat(current); } catch { fail('green_catalog_local_parent_missing'); }
    if (metadata.isSymbolicLink()) {
      let canonical;
      try { canonical = await realpath(current); } catch { fail('green_catalog_local_parent_unsafe'); }
      const approvedSystemLink = (current === '/var' && canonical === '/private/var')
        || (current === '/tmp' && canonical === '/private/tmp');
      if (!approvedSystemLink) fail('green_catalog_local_parent_unsafe');
      metadata = await lstat(canonical);
    }
    if (!metadata.isDirectory()) fail('green_catalog_local_parent_unsafe');
  }
  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : metadata.uid;
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
      || (metadata.mode & 0o777) !== 0o700 || metadata.uid !== ownerUid) {
    fail('green_catalog_local_parent_unsafe');
  }
}

async function readPrivateJson(filePath) {
  safePath(filePath, 'green_catalog_local_input_path_invalid');
  await assertSafeParent(filePath);
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    const before = assertPrivateFileMetadata(metadata, 0o600, 'green_catalog_local_input_unsafe');
    if (metadata.size < 2 || metadata.size > 1024 * 1024) {
      fail('green_catalog_local_input_unsafe');
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameFileIdentity(before, fileIdentity(after)) || bytes.length !== after.size) {
      fail('green_catalog_local_input_changed');
    }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('green_catalog_local_json_invalid'); }
    let value;
    try { value = JSON.parse(text.replace(/^\uFEFF/u, '').trim()); } catch { fail('green_catalog_local_json_invalid'); }
    return { value, bytes };
  } catch (error) {
    if (error?.code === 'ELOOP') fail('green_catalog_local_input_symlink_forbidden');
    if (error?.code === 'ENOENT') fail('green_catalog_local_input_missing');
    throw error;
  } finally {
    await handle?.close();
  }
}

export function assertGreenCatalogLocalDocument(value, { finalized = false, nowUtc = null } = {}) {
  exactKeys(value, finalized ? finalizedRootKeys : rootKeys, 'green_catalog_local_root_shape_invalid');
  assertNoSecretKeys(value);
  if (value.schemaVersion !== greenCatalogLocalBinding.schemaVersion
      || value.kind !== greenCatalogLocalBinding.kind
      || value.status !== 'passed') fail('green_catalog_local_identity_invalid');
  exactKeys(value.runtime, runtimeKeys, 'green_catalog_local_runtime_shape_invalid');
  exactKeys(value.ops, opsKeys, 'green_catalog_local_ops_shape_invalid');
  exactKeys(value.consumerSource, consumerSourceKeys, 'green_catalog_local_consumer_source_shape_invalid');
  exactKeys(value.image, imageKeys, 'green_catalog_local_image_shape_invalid');
  exactKeys(value.attempt, attemptKeys, 'green_catalog_local_attempt_shape_invalid');
  exactKeys(value.catalog, catalogKeys, 'green_catalog_local_catalog_shape_invalid');
  exactKeys(value.database, databaseKeys, 'green_catalog_local_database_shape_invalid');
  assertCommit(value.runtime.commit, greenCatalogLocalBinding.runtime.commit, 'green_catalog_local_runtime_mismatch');
  assertCommit(value.ops.commit, greenCatalogLocalBinding.ops.commit, 'green_catalog_local_ops_mismatch');
  if (value.consumerSource.commit !== greenCatalogLocalBinding.consumerSource.commit
      || value.consumerSource.path !== greenCatalogLocalBinding.consumerSource.path
      || value.consumerSource.sha256 !== greenCatalogLocalBinding.consumerSource.sha256) {
    fail('green_catalog_local_consumer_source_mismatch');
  }
  if (value.image.reference !== greenCatalogLocalBinding.image.reference
      || value.image.digest !== greenCatalogLocalBinding.image.digest) fail('green_catalog_local_image_mismatch');
  if (value.attempt.id !== greenCatalogLocalBinding.attempt.id
      || value.attempt.number !== greenCatalogLocalBinding.attempt.number) fail('green_catalog_local_attempt_mismatch');
  const capturedAtUtc = assertUtc(value.capturedAtUtc, 'green_catalog_local_captured_at_invalid');
  if (finalized) {
    const finalizedAtUtc = assertUtc(value.finalizedAtUtc, 'green_catalog_local_finalized_at_invalid');
    if (Date.parse(finalizedAtUtc) < Date.parse(capturedAtUtc)) fail('green_catalog_local_time_order_invalid');
    if (nowUtc !== null && finalizedAtUtc !== nowUtc) fail('green_catalog_local_finalized_at_mismatch');
  }
  if (value.catalog.source !== 'local-readback') fail('green_catalog_local_catalog_source_invalid');
  assertGreenSyntheticCatalogPublicReadback(value.catalog.readback, { requirePhotoReachable: false });
  const expectedDatabase = canonicalize(greenDatabaseStateBaseline);
  const before = assertGreenDatabaseStateReadback(canonicalize(value.database.before), expectedDatabase);
  const after = assertGreenDatabaseStateReadback(canonicalize(value.database.after), expectedDatabase);
  if (canonicalJson(before) !== canonicalJson(after)) fail('green_catalog_local_database_changed');
  return Object.freeze(value);
}

async function writePrivateJson(filePath, value, { onOutputWriteForTest = null } = {}) {
  safePath(filePath, 'green_catalog_local_output_path_invalid');
  await assertSafeParent(filePath);
  let handle;
  let identity;
  let succeeded = false;
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  try {
    handle = await open(filePath, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    identity = assertPrivateFileMetadata(await handle.stat(), 0o600, 'green_catalog_local_output_unsafe');
    await handle.writeFile(bytes);
    if (typeof onOutputWriteForTest === 'function') await onOutputWriteForTest();
    const metadata = await handle.stat();
    if (!sameStableFileIdentity(identity, fileIdentity(metadata)) || metadata.size !== bytes.length) {
      fail('green_catalog_local_output_changed');
    }
    await handle.sync();
    const synced = await handle.stat();
    if (!sameStableFileIdentity(identity, fileIdentity(synced)) || synced.size !== bytes.length) {
      fail('green_catalog_local_output_changed');
    }
    identity = fileIdentity(synced);
    const readback = Buffer.alloc(bytes.length);
    let offset = 0;
    while (offset < readback.length) {
      const result = await handle.read(readback, offset, readback.length - offset, offset);
      if (result.bytesRead === 0) fail('green_catalog_local_output_readback_invalid');
      offset += result.bytesRead;
    }
    if (!readback.equals(bytes)) fail('green_catalog_local_output_readback_invalid');
    await handle.close();
    handle = null;
    const pathMetadata = await lstat(filePath);
    if (pathMetadata.isSymbolicLink() || pathMetadata.nlink !== 1
        || !sameFileIdentity(identity, fileIdentity(pathMetadata)) || pathMetadata.size !== bytes.length) {
      fail('green_catalog_local_output_changed');
    }
    succeeded = true;
  } catch (error) {
    if (error?.code === 'EEXIST') fail('green_catalog_local_output_exists');
    if (error?.code === 'ELOOP') fail('green_catalog_local_output_symlink_forbidden');
    throw error;
  } finally {
    await handle?.close();
    if (!succeeded) await removeOwnedOutput(filePath, identity);
  }
  return Object.freeze({ path: filePath, sha256: digest(bytes), bytes: bytes.length });
}

export async function finalizeGreenCatalogLocal({ inputFile, outputFile, nowUtc, onOutputWriteForTest = null } = {}) {
  if (typeof nowUtc !== 'string') fail('green_catalog_local_finalized_at_required');
  assertUtc(nowUtc, 'green_catalog_local_finalized_at_invalid');
  safePath(inputFile, 'green_catalog_local_input_path_invalid');
  safePath(outputFile, 'green_catalog_local_output_path_invalid');
  if (inputFile === outputFile) fail('green_catalog_local_input_output_same');
  const { value } = await readPrivateJson(inputFile);
  assertGreenCatalogLocalDocument(value, { nowUtc: null });
  if (Date.parse(value.capturedAtUtc) > Date.parse(nowUtc)) fail('green_catalog_local_time_order_invalid');
  const finalized = { ...value, finalizedAtUtc: nowUtc };
  assertGreenCatalogLocalDocument(finalized, { finalized: true, nowUtc });
  return writePrivateJson(outputFile, finalized, { onOutputWriteForTest });
}

async function main() {
  const [inputFile, outputFile, nowUtc = new Date().toISOString()] = process.argv.slice(2);
  if (!inputFile || !outputFile) fail('green_catalog_local_arguments_invalid');
  const result = await finalizeGreenCatalogLocal({ inputFile, outputFile, nowUtc });
  process.stdout.write(`${JSON.stringify({ status: 'passed', ...result })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'green_catalog_local_failed' })}\n`);
    process.exitCode = 1;
  });
}
