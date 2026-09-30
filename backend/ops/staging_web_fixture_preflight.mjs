#!/usr/bin/env node
// Preparation only. No credential rotation, declaration, upload or SQL write.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readStablePrivateFile } from './stable_private_file.mjs';
import { readStagingAccessConfiguration } from '../src/staging_access_gate.js';
import { privatePilotAllowedCatalogKeys } from '../src/private_pilot_domain.js';

const repository = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const digestPattern = /^[a-f0-9]{64}$/u;
const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
export const fixtureTarget = 'https://staging.shareittoo.com/api/v1';
export const fixtureNotice = 'Synthetische Katalogfixture – kein reales Angebot, kein Vertrag, keine Zahlung';
export const placeholderStatement = 'Objectively verified uniform-color placeholder; original generator, date and license unknown; internal noncontractual catalog test only.';
export function fixturePhotoFileName(photo) {
  if (photo?.classification === 'synthetic_programmatic_placeholder' && photo.mimeType === 'image/webp') return 'photo.webp';
  requireThat(['authentic_non_ai', 'synthetic_ai_illustration'].includes(photo?.classification)
    && photo.mimeType === 'image/jpeg', 'fixture_photo_type_invalid');
  return 'photo.jpg';
}
export function fixturePhotoBytesValid(photo, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length <= 3 || bytes.length > 8388608
    || bytesDigest(bytes) !== photo?.sha256) return false;
  if (photo.classification === 'synthetic_programmatic_placeholder') return photo.mimeType === 'image/webp'
    && bytes.length === photo.byteSize && bytes.length >= 20
    && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    && bytes.readUInt32LE(4) === bytes.length - 8;
  return ['authentic_non_ai', 'synthetic_ai_illustration'].includes(photo.classification)
    && photo.mimeType === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
export async function validateFixturePhotoContent(photo, bytes) {
  requireThat(fixturePhotoBytesValid(photo, bytes), 'fixture_photo_bytes_invalid');
  if (photo.classification !== 'synthetic_programmatic_placeholder') return;
  // Use the existing image decoder, not a declared MIME or caller's pixel claim.
  // No network or new dependency; bounded single-frame input/output only.
  try {
    const { default: sharp } = await import('sharp');
    const image = sharp(bytes, { limitInputPixels: 4194304, failOn: 'warning' });
    const metadata = await image.metadata();
    requireThat(metadata.format === 'webp' && metadata.width === photo.width && metadata.height === photo.height
      && (metadata.pages ?? 1) === 1, 'fixture_placeholder_content_invalid');
    const { data, info } = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const rgb = [1, 3, 5].map((i) => parseInt(photo.rgbHex.slice(i, i + 2), 16));
    requireThat(info.channels === 4 && data.length === photo.width * photo.height * 4, 'fixture_placeholder_content_invalid');
    for (let i = 0; i < data.length; i += 4) requireThat(data[i] === rgb[0] && data[i + 1] === rgb[1]
      && data[i + 2] === rgb[2] && data[i + 3] === 255, 'fixture_placeholder_content_invalid');
  } catch { fail('fixture_placeholder_content_invalid'); }
}
// Capability passed only by the isolated PG16 rehearsal. JSON/env/argv cannot
// reproduce this identity; both CLIs deliberately omit it.
export const isolatedFixtureRehearsal = Symbol('isolated-fixture-pg16-rehearsal');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function requireThat(value, code) { if (!value) fail(code); }
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
  return value;
}
export function fixtureDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function hasSyntheticFixtureContact(user) {
  return typeof user?.email === 'string' && user.email === user.email.trim().toLowerCase()
    && /^[^@\s]+@example\.invalid$/u.test(user.email) && user.phone_e164 === null;
}
const bytesDigest = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Versioned, explicit input inventory; never bind volatile shell/process metadata.
// NODE_ENV remains bound even when DEPLOYMENT_ENVIRONMENT overrides its fallback.
// pg's environment fallbacks are included because the CLI constructs a Pool.
export const fixtureEnvironmentKeys = Object.freeze([
  'APP_COMMIT', 'DATABASE_URL', 'DEPLOYMENT_ENVIRONMENT', 'NODE_ENV',
  'PRIVATE_PILOT_ALLOWED_REGIONS', 'PRIVATE_PILOT_V4_ENABLED',
  'SIT_STAGING_ACCESS_GATE_ENABLED', 'SIT_STAGING_ALLOWED_USER_IDS',
  'SIT_STAGING_PUBLIC_LISTING_IDS', 'SIT_STAGING_PUBLIC_UPLOAD_NAMES',
  'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST',
  'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'MAIL_TRANSPORT', 'PUSH_TRANSPORT',
  'SIT_WEB_FIXTURE_EXECUTE', 'SIT_WEB_FIXTURE_CONFIRM',
  'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED',
  'PGUSER', 'PGDATABASE', 'PGPORT', 'PGHOST', 'PGPASSWORD', 'PGPASSFILE',
  'PGBINARY', 'PGOPTIONS', 'PGSSLMODE', 'PGSSLNEGOTIATION',
  'PGCLIENT_ENCODING', 'PGREPLICATION', 'PGAPPNAME', 'PGCONNECT_TIMEOUT',
]);
export function fixtureEnvironmentDigest(environment) {
  const values = Object.fromEntries(fixtureEnvironmentKeys.map((key) => {
    const present = Object.hasOwn(environment, key);
    requireThat(!present || typeof environment[key] === 'string', 'fixture_environment_value_invalid');
    return [key, { present, value: present ? environment[key] : null }];
  }));
  return fixtureDigest({ kind: 'sit-web-fixture-environment-v1', values });
}

export function readPrivateFixtureInput(file, { maxBytes = 65536 } = {}) {
  requireThat(typeof file === 'string' && isAbsolute(file) && resolve(file) === file,
    'fixture_private_path_invalid');
  const rel = relative(repository, file);
  requireThat(rel === '..' || rel.startsWith(`..${sep}`), 'fixture_input_inside_repository');
  // Reject symlink ancestors too; the final read binds bytes and metadata to one FD.
  for (let parent = dirname(file); ; parent = dirname(parent)) {
    const metadata = lstatSync(parent);
    requireThat(metadata.isDirectory() && !metadata.isSymbolicLink(), 'fixture_parent_unsafe');
    if (parent === dirname(file)) requireThat(metadata.uid === process.getuid()
      && (metadata.mode & 0o777) === 0o700, 'fixture_parent_not_private');
    if (parent === dirname(parent)) break;
  }
  return readStablePrivateFile(file, { encoding: null, expectedUid: process.getuid(),
    expectedMode: 0o600, minBytes: 1, maxBytes });
}

export function validateFixtureManifest(manifest, now = new Date(), rehearsal) {
  requireThat(rehearsal === undefined || rehearsal === isolatedFixtureRehearsal, 'fixture_rehearsal_binding_invalid');
  requireThat(manifest?.kind === 'sit-staging-web-two-role-preflight'
    && manifest.schemaVersion === 1 && manifest.target === fixtureTarget
    && /^web-fixture-[a-z0-9-]{8,48}$/u.test(manifest.runId ?? ''), 'fixture_manifest_invalid');
  const created = Date.parse(manifest.createdAt);
  requireThat(Number.isFinite(created) && created <= +now && +now - created <= 3600000,
    'fixture_manifest_stale');
  requireThat(/^[a-f0-9]{40}$/u.test(manifest.runtimeCommit ?? '')
    && digestPattern.test(manifest.environmentDigest ?? '')
    && digestPattern.test(manifest.snapshotDigest ?? ''), 'fixture_binding_invalid');
  requireThat(rehearsal === isolatedFixtureRehearsal
    ? manifest.database?.host === '127.0.0.1' && manifest.database.name === 'sit_integration'
      && manifest.database.user === 'sit_runner'
    : manifest.database?.host === 'sit-green-postgres-20260918011528-wp254'
    && manifest.database.name === 'shareittoo_green'
    && manifest.database.user === 'shareittoo_green', 'fixture_database_invalid');
  requireThat(Array.isArray(manifest.roles) && manifest.roles.length === 2
    && manifest.roles[0]?.role === 'owner' && manifest.roles[1]?.role === 'renter'
    && manifest.roles.every((r) => identifier.test(r.userId ?? '')
      && typeof r.syntheticMarker === 'string' && r.syntheticMarker.length > 0)
    && manifest.roles[0].userId !== manifest.roles[1].userId, 'fixture_roles_invalid');
  requireThat(identifier.test(manifest.listingId ?? '')
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/u.test(manifest.uploadName ?? '')
    && manifest.region === 'heilbronn', 'fixture_scope_invalid');
  const photo = manifest.photo;
  const common = ['classification', 'mimeType', 'sha256', 'currentProductEvidence', 'file'];
  const authentic = photo?.classification === 'authentic_non_ai';
  const synthetic = photo?.classification === 'synthetic_ai_illustration';
  const placeholder = photo?.classification === 'synthetic_programmatic_placeholder';
  const fields = authentic ? ['sourceUrl', 'creator', 'license', 'capturedAt']
    : placeholder ? ['syntheticAi', 'byteSize', 'width', 'height', 'rgbHex', 'opaque', 'testOnlyStatement']
      : ['syntheticAi', 'generatedAt', 'toolIdentity', 'promptHash', 'usageLicenseStatement', 'sourceUrl'];
  const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
  const past = (value) => Number.isFinite(Date.parse(value)) && Date.parse(value) <= +now;
  requireThat((authentic || synthetic || placeholder) && photo.mimeType === (placeholder ? 'image/webp' : 'image/jpeg') && digestPattern.test(photo.sha256 ?? '')
    && Object.keys(photo).every((key) => [...common, ...fields].includes(key))
    && (authentic ? text(photo.creator) && text(photo.license) && past(photo.capturedAt)
      : placeholder ? photo.syntheticAi === false && photo.opaque === true && photo.testOnlyStatement === placeholderStatement
        && Number.isInteger(photo.width) && photo.width > 0 && photo.width <= 2048
        && Number.isInteger(photo.height) && photo.height > 0 && photo.height <= 2048
        && Number.isInteger(photo.byteSize) && photo.byteSize >= 20 && photo.byteSize <= 8388608
        && /^#[0-9A-F]{6}$/u.test(photo.rgbHex ?? '')
      : photo.syntheticAi === true && past(photo.generatedAt) && text(photo.toolIdentity)
        && digestPattern.test(photo.promptHash ?? '') && text(photo.usageLicenseStatement)),
  'fixture_photo_provenance_required');
  if (authentic || Object.hasOwn(photo, 'sourceUrl')) {
    let sourceUrl;
    try { sourceUrl = new URL(photo.sourceUrl); } catch { fail('fixture_photo_provenance_required'); }
    requireThat(sourceUrl.protocol === 'https:' && !sourceUrl.username && !sourceUrl.password,
      'fixture_photo_provenance_required');
  }
  // Fixture illustrations, including explicitly synthetic AI, are never product proof.
  requireThat(manifest.fixtureClass === 'synthetic_noncontractual_catalog_only'
    && manifest.notice === fixtureNotice && manifest.realOffer === false
    && manifest.ownerDeclaration === false && manifest.bookingAllowed === false
    && manifest.paymentAllowed === false && photo.currentProductEvidence === false
    && digestPattern.test(manifest.availabilityDigest ?? ''), 'fixture_synthetic_boundary_required');
  return manifest;
}

export function validateFixtureEnvironment(manifest, environment, rehearsal) {
  const gate = readStagingAccessConfiguration(environment);
  requireThat(['test', 'staging'].includes(environment.DEPLOYMENT_ENVIRONMENT)
    && environment.APP_COMMIT === manifest.runtimeCommit
    && fixtureEnvironmentDigest(environment) === manifest.environmentDigest, 'fixture_runtime_drift');
  requireThat(gate.enabled && gate.valid && gate.publicListingConfigurationValid
    && gate.publicUploadConfigurationValid && gate.publicListingIds.length === 1
    && gate.publicListingIds[0] === manifest.listingId && gate.publicUploadNames.length === 1
    && gate.publicUploadNames[0] === manifest.uploadName
    && manifest.roles.every((role) => gate.allowedUserIds.includes(role.userId)),
  'fixture_access_scope_drift');
  requireThat(environment.PRIVATE_PILOT_V4_ENABLED === 'true'
    && environment.PRIVATE_PILOT_ALLOWED_REGIONS === 'heilbronn'
    && environment.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED === 'false'
    && ['false', undefined].includes(environment.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED)
    && !environment.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST
    && environment.PAYMENT_TRANSPORT === 'memory' && environment.STRIPE_LIVEMODE === 'false'
    && ['disabled', 'memory'].includes(environment.MAIL_TRANSPORT)
    && ['disabled', 'memory'].includes(environment.PUSH_TRANSPORT), 'fixture_effect_boundary_unsafe');
  let database;
  try { database = new URL(environment.DATABASE_URL); } catch { fail('fixture_database_invalid'); }
  requireThat(rehearsal === undefined || (rehearsal === isolatedFixtureRehearsal
    && environment.DEPLOYMENT_ENVIRONMENT === 'test' && [undefined, '', 'test'].includes(environment.NODE_ENV)
    && database.hostname === '127.0.0.1' && database.pathname === '/sit_integration'
    && database.username === 'sit_runner' && !database.password && !database.search && !database.hash
    && /^[1-9][0-9]{0,4}$/u.test(database.port) && Number(database.port) <= 65535),
  'fixture_rehearsal_binding_invalid');
  requireThat(['postgres:', 'postgresql:'].includes(database.protocol)
    && database.hostname === manifest.database.host && database.pathname === `/${manifest.database.name}`
    && decodeURIComponent(database.username) === manifest.database.user,
  'fixture_database_invalid');
}

// Rows stay in memory. Standalone reads are READ ONLY; the adapter can repeat
// the same reads inside its already locked transaction before conditional writes.
export async function readFixtureSnapshot(client, manifest, { withinTransaction = false } = {}) {
  const users = manifest.roles.map((r) => r.userId);
  const queries = {
    users: [`SELECT id, email, phone_e164, role, account_status, deactivated_at,
      email_verified_at, private_use_confirmed_at, private_marketplace_review_status,
      profile, created_at, updated_at FROM users WHERE id = ANY($1::text[]) ORDER BY id`, [users]],
    listing: ['SELECT * FROM listings WHERE id = $1', [manifest.listingId]],
    upload: ['SELECT * FROM uploads WHERE storage_name = $1', [manifest.uploadName]],
    rules: ['SELECT * FROM listing_availability_rules WHERE listing_id = $1 ORDER BY id', [manifest.listingId]],
    blocks: ['SELECT * FROM listing_availability_blocks WHERE listing_id = $1 ORDER BY id', [manifest.listingId]],
    bookings: ['SELECT id FROM bookings WHERE listing_id = $1 OR owner_id = ANY($2::text[]) OR renter_id = ANY($2::text[]) ORDER BY id', [manifest.listingId, users]],
    requests: ['SELECT id FROM rental_requests WHERE item_id = $1 OR owner_id = ANY($2::text[]) OR renter_id = ANY($2::text[]) ORDER BY id', [manifest.listingId, users]],
    sessions: ['SELECT * FROM auth_sessions WHERE user_id = ANY($1::text[]) ORDER BY id', [users]],
    identities: ['SELECT id FROM auth_identities WHERE user_id = ANY($1::text[]) ORDER BY id', [users]],
    push: ['SELECT id FROM push_devices WHERE user_id = ANY($1::text[]) ORDER BY id', [users]],
  };
  if (!withinTransaction) await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    const identity = (await client.query('SELECT current_database() AS name, current_user AS username')).rows[0];
    requireThat(identity?.name === manifest.database.name && identity?.username === manifest.database.user,
      'fixture_database_identity_drift');
    const snapshot = {};
    for (const [key, [sql, parameters]] of Object.entries(queries)) {
      snapshot[key] = (await client.query(sql, parameters)).rows;
    }
    return snapshot;
  } finally { if (!withinTransaction) await client.query('ROLLBACK'); }
}

export function validateFixtureSnapshot(manifest, snapshot) {
  requireThat(fixtureDigest(snapshot) === manifest.snapshotDigest, 'fixture_snapshot_drift');
  requireThat(snapshot.users?.length === 2 && snapshot.listing?.length === 1
    && snapshot.upload?.length === 1, 'fixture_rows_missing');
  for (const role of manifest.roles) {
    const user = snapshot.users.find((row) => row.id === role.userId);
    requireThat(user?.profile?.syntheticOnly === true
      && hasSyntheticFixtureContact(user)
      && user.profile.syntheticMarker === role.syntheticMarker
      && user.role === 'user' && user.account_status === 'active' && user.deactivated_at === null
      && user.email_verified_at && user.private_use_confirmed_at
      && user.private_marketplace_review_status === 'clear', 'fixture_synthetic_role_unsafe');
  }
  requireThat(['bookings', 'requests', 'identities', 'push'].every((key) =>
    Array.isArray(snapshot[key]) && snapshot[key].length === 0)
    && Array.isArray(snapshot.sessions) && snapshot.sessions.every((row) =>
      row.revoked_at != null && Number.isFinite(Date.parse(row.revoked_at))),
  'fixture_dependency_blocked');
  const listing = snapshot.listing[0]; const upload = snapshot.upload[0];
  requireThat(listing.id === manifest.listingId && listing.owner_id === manifest.roles[0].userId
    && listing.catalog_version === 1 && listing.is_active === true && listing.status === 'active'
    && listing.moderation_status === 'active'
    && privatePilotAllowedCatalogKeys.includes(`${listing.category_id}\u001f${listing.subcategory}`),
  'fixture_listing_unsafe');
  requireThat(listing.private_status_confirmed_at === null
    && listing.private_pilot_region_code !== 'heilbronn', 'fixture_excluded_prestate_required');
  requireThat(upload.storage_name === manifest.uploadName && upload.owner_id === listing.owner_id
    && upload.listing_id === listing.id && upload.purpose === 'listing_image'
    && upload.visibility === 'public' && upload.content_scan_status === 'passed', 'fixture_upload_unsafe');
  if (manifest.photo.classification === 'synthetic_programmatic_placeholder') requireThat(
    upload.mime_type === 'image/webp' && Number(upload.byte_size) === manifest.photo.byteSize
      && upload.content_sha256 === manifest.photo.sha256, 'fixture_upload_media_drift');
  requireThat(fixtureDigest({ rules: snapshot.rules, blocks: snapshot.blocks })
    === manifest.availabilityDigest, 'fixture_availability_drift');
}

export async function preflightWebFixture({ manifest, environment, client, photoBytes, execute = false, now, rehearsal }) {
  // Activation belongs to the separately confirmed adapter, never this preflight.
  requireThat(execute === false, 'fixture_mutation_adapter_not_approved');
  validateFixtureManifest(manifest, now, rehearsal);
  validateFixtureEnvironment(manifest, environment, rehearsal);
  await validateFixturePhotoContent(manifest.photo, photoBytes);
  validateFixtureSnapshot(manifest, await readFixtureSnapshot(client, manifest));
  return { status: 'preflight-passed-no-mutation', executable: false,
    roles: 2, listings: 1, uploads: 1,
    blocker: 'synthetic_catalog_activation_not_prepared',
    cleanup: 'semantic_safety_restore_audits_retained_no_session_reactivation' };
}

async function main() {
  requireThat(process.argv.length === 4 && digestPattern.test(process.argv[3] ?? '')
    && !process.env.SIT_WEB_FIXTURE_EXECUTE && !process.env.SIT_WEB_FIXTURE_CONFIRM,
  'fixture_preflight_only_arguments');
  const bytes = readPrivateFixtureInput(process.argv[2]);
  requireThat(bytesDigest(bytes) === process.argv[3], 'fixture_manifest_hash_mismatch');
  const manifest = validateFixtureManifest(JSON.parse(bytes));
  validateFixtureEnvironment(manifest, process.env);
  const photoBytes = readPrivateFixtureInput(manifest.photo.file, { maxBytes: 8388608 });
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    try { process.stdout.write(`${JSON.stringify(await preflightWebFixture({ manifest,
      environment: process.env, client, photoBytes }))}\n`); }
    finally { client.release(); }
  } finally { await pool.end(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(() => {
  // Never echo pg/file/JSON errors: those can contain identifiers or secrets.
  process.stderr.write('{"status":"failed","code":"fixture_preflight_failed"}\n');
  process.exitCode = 1;
});
