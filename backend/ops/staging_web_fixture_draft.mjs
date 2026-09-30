// Read-only draft derivation; no CLI, provider, credential or persistence path.
import { createHash, randomUUID } from 'node:crypto';
import { readStagingAccessConfiguration } from '../src/staging_access_gate.js';
import { fixtureDigest, fixtureEnvironmentDigest, fixtureNotice, fixtureTarget,
  readFixtureSnapshot, validateFixtureManifest, validateFixtureEnvironment,
  validateFixtureSnapshot, hasSyntheticFixtureContact, validateFixturePhotoContent, fixturePhotoFileName } from './staging_web_fixture_preflight.mjs';
import { readAdapterStoredPhoto, runFixtureAdapter } from './staging_web_fixture_adapter.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (value, code) => { if (!value) throw Object.assign(Error(code), { code }); };

export function fixtureDraftScope({ source, environment, photo, now = new Date(), rehearsal }) {
  const gate = readStagingAccessConfiguration(environment);
  check(gate.enabled && gate.valid && gate.publicListingConfigurationValid && gate.publicUploadConfigurationValid
    && gate.allowedUserIds.length >= 2 && gate.publicListingIds.length === 1 && gate.publicUploadNames.length === 1,
  'fixture_draft_access_ambiguous');
  check(source.schemaCount === 98 && /^[a-f0-9]{40}$/u.test(source.commit)
    && /^[a-f0-9]{64}$/u.test(source.ledgerDigest), 'fixture_draft_source_invalid');
  const database = new URL(environment.DATABASE_URL);
  const preflight = { kind: 'sit-staging-web-two-role-preflight', schemaVersion: 1, target: fixtureTarget,
    createdAt: now.toISOString(), runId: `web-fixture-${randomUUID()}`, runtimeCommit: environment.APP_COMMIT,
    environmentDigest: fixtureEnvironmentDigest(environment), snapshotDigest: '0'.repeat(64),
    database: { host: database.hostname, name: database.pathname.slice(1), user: decodeURIComponent(database.username) },
    // Placeholders are validated for effect boundaries only, never returned.
    // Actual roles/markers and both digests must be derived inside READ ONLY.
    roles: gate.allowedUserIds.slice(0, 2).map((userId, index) => ({ role: index ? 'renter' : 'owner', userId, syntheticMarker: 'unresolved' })),
    listingId: gate.publicListingIds[0], uploadName: gate.publicUploadNames[0], region: 'heilbronn',
    fixtureClass: 'synthetic_noncontractual_catalog_only', notice: fixtureNotice, realOffer: false,
    ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
    availabilityDigest: '0'.repeat(64), photo: { ...photo, file: `/run/sit-fixture-input/${fixturePhotoFileName(photo)}` } };
  validateFixtureManifest(preflight, now, rehearsal);
  validateFixtureEnvironment(preflight, environment, rehearsal);
  check(!environment.SIT_WEB_FIXTURE_EXECUTE && !environment.SIT_WEB_FIXTURE_CONFIRM, 'fixture_draft_execution_forbidden');
  return { gate, preflight };
}

export async function generateFixtureDraft({ source, environment, photo, client, now = new Date(), rehearsal,
  readPhoto = readAdapterStoredPhoto, adapterPreflight = runFixtureAdapter }) {
  const { gate, preflight } = fixtureDraftScope({ source, environment, photo, now, rehearsal });
  let snapshot;
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    const ledger = (await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
    check(ledger.length === 98 && fixtureDigest(ledger) === source.ledgerDigest, 'fixture_draft_ledger_drift');
    const users = (await client.query(`SELECT id, email, phone_e164, profile, role, account_status, deactivated_at,
      email_verified_at, private_use_confirmed_at, private_marketplace_review_status
      FROM users WHERE id = ANY($1::text[]) ORDER BY id`, [gate.allowedUserIds])).rows;
    check(users.length === gate.allowedUserIds.length && new Set(users.map((row) => row.id)).size === users.length,
      'fixture_draft_allowed_accounts_missing');
    const eligible = users.filter((row) => row.profile?.syntheticOnly === true && hasSyntheticFixtureContact(row)
      && typeof row.profile.syntheticMarker === 'string' && row.profile.syntheticMarker.length > 0
      && row.role === 'user' && row.account_status === 'active' && row.deactivated_at === null
      && row.email_verified_at && row.private_use_confirmed_at && row.private_marketplace_review_status === 'clear');
    const listing = (await client.query('SELECT id, owner_id FROM listings WHERE id = $1', [preflight.listingId])).rows;
    check(listing.length === 1 && eligible.some((row) => row.id === listing[0].owner_id), 'fixture_draft_owner_missing');
    const owner = eligible.find((row) => row.id === listing[0].owner_id);
    // The administrator's verified allowlist order, never SQL row order,
    // selects one renter. A failed pair preflight must not try an alternate.
    const eligibleById = new Map(eligible.map((row) => [row.id, row]));
    const renter = gate.allowedUserIds.map((id) => eligibleById.get(id)).find((row) => row && row.id !== owner.id);
    check(renter, 'fixture_draft_renter_missing');
    preflight.roles = [owner, renter].map((row, index) => ({ role: index ? 'renter' : 'owner', userId: row.id, syntheticMarker: row.profile.syntheticMarker }));
    snapshot = await readFixtureSnapshot(client, preflight, { withinTransaction: true });
    preflight.snapshotDigest = fixtureDigest(snapshot);
    preflight.availabilityDigest = fixtureDigest({ rules: snapshot.rules, blocks: snapshot.blocks });
    validateFixtureManifest(preflight, now, rehearsal); validateFixtureEnvironment(preflight, environment, rehearsal);
    validateFixtureSnapshot(preflight, snapshot);
  } finally { await client.query('ROLLBACK'); }
  const manifest = { kind: 'sit-staging-web-fixture-adapter', schemaVersion: 1, operation: 'activate',
    sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: source.schemaCount,
    ledgerDigest: source.ledgerDigest, uploadDirectory: '/data/uploads', preflight };
  const photoBytes = readPhoto(manifest, environment);
  check(Buffer.isBuffer(photoBytes) && hash(photoBytes) === photo.sha256, 'fixture_draft_stored_photo_drift');
  await validateFixturePhotoContent(photo, photoBytes);
  // The unchanged adapter rechecks the complete dependency/FK inventory,
  // refresh tokens, schema and snapshot on this connection. No write mode.
  const accepted = await adapterPreflight({ manifest, manifestHash: hash(JSON.stringify(manifest)), source,
    environment, photoBytes, storedPhotoBytes: photoBytes, client, execute: false, now, rehearsal });
  check(accepted.status === 'preflight-passed-no-mutation' && accepted.runtimeActivated === false, 'fixture_draft_preflight_rejected');
  return manifest;
}
