#!/usr/bin/env node
// Staging DB preparation only: no provider, credential issuance, file replacement or runtime activation.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readStablePrivateFile } from './stable_private_file.mjs';
import { fixtureDigest, fixtureNotice, readPrivateFixtureInput, readFixtureSnapshot,
  validateFixtureManifest, validateFixtureEnvironment, validateFixtureSnapshot,
  preflightWebFixture, hasSyntheticFixtureContact, fixturePhotoBytesValid, validateFixturePhotoContent } from './staging_web_fixture_preflight.mjs';

const root = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (condition, code) => { if (!condition) throw Object.assign(Error(code), { code }); };
const action = (phase) => `staging_web_fixture.${phase}`;
export const adapterSources = Object.freeze([
  'backend/ops/staging_web_fixture_adapter.mjs', 'backend/ops/staging_web_fixture_preflight.mjs',
  'backend/ops/staging_web_fixture_runner.mjs',
  'backend/ops/staging_web_fixture_draft.mjs',
  'backend/ops/staging_web_fixture_bootstrap.mjs', 'backend/ops/provision_synthetic_sandbox_user.mjs',
  'backend/ops/stable_private_file.mjs', 'backend/src/staging_synthetic_catalog.js',
  'backend/src/staging_access_gate.js', 'backend/src/private_pilot_domain.js',
]);

export function readAdapterSource() {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  check(git('status', '--porcelain') === '', 'fixture_adapter_source_dirty');
  const ledger = readdirSync(resolve(root, 'backend/sql/migrations')).filter((p) => p.endsWith('.up.sql')).sort()
    .map((name) => ({ name, checksum: sha(readFileSync(resolve(root, 'backend/sql/migrations', name))) }));
  return { commit: git('rev-parse', 'HEAD'),
    hashes: Object.fromEntries(adapterSources.map((p) => [p, sha(readFileSync(resolve(root, p)))])),
    ledgerDigest: fixtureDigest(ledger), schemaCount: ledger.length };
}

export function validateAdapterInputs({ manifest, manifestHash, source, environment, execute = false,
  confirmSource, confirmRun, photoBytes, storedPhotoBytes, now = new Date(), rehearsal }) {
  check(manifest?.kind === 'sit-staging-web-fixture-adapter' && manifest.schemaVersion === 1
    && ['activate', 'cleanup'].includes(manifest.operation), 'fixture_adapter_manifest_invalid');
  check(sha(Buffer.from(JSON.stringify(manifest))) === manifestHash, 'fixture_adapter_manifest_binding');
  check(manifest.sourceCommit === source.commit && /^[a-f0-9]{40}$/u.test(source.commit)
    && fixtureDigest(manifest.sourceHashes) === fixtureDigest(source.hashes)
    && source.schemaCount === 98 && manifest.schemaCount === 98
    && manifest.ledgerDigest === source.ledgerDigest, 'fixture_adapter_source_drift');
  validateFixtureManifest(manifest.preflight, now, rehearsal);
  validateFixtureEnvironment(manifest.preflight, environment, rehearsal);
  check(!environment.SIT_WEB_FIXTURE_EXECUTE && !environment.SIT_WEB_FIXTURE_CONFIRM,
    'fixture_adapter_env_execute_forbidden');
  check(execute === false || (execute === true && confirmSource === manifest.sourceCommit
    && confirmRun === manifest.preflight.runId), 'fixture_adapter_confirmation_required');
  check(execute || (confirmSource === undefined && confirmRun === undefined), 'fixture_adapter_unexpected_confirmation');
  check(fixturePhotoBytesValid(manifest.preflight.photo, photoBytes)
    && Buffer.isBuffer(storedPhotoBytes) && photoBytes.equals(storedPhotoBytes), 'fixture_adapter_stored_photo_drift');
  check(manifest.uploadDirectory === resolve(environment.UPLOAD_DIR ?? '/data/uploads'), 'fixture_adapter_media_root_drift');
  if (manifest.operation === 'cleanup') check(/^[a-f0-9]{64}$/u.test(manifest.activationDigest ?? ''),
    'fixture_adapter_activation_binding_required');
}

// The adapter never replaces media. Both the existing file and upload row must
// already bind the supplied illustration. Parents cannot be symlinks.
export function readAdapterStoredPhoto(manifest, environment) {
  const directory = resolve(environment.UPLOAD_DIR ?? '/data/uploads');
  check(directory === manifest.uploadDirectory && directory !== '/', 'fixture_adapter_media_root_drift');
  for (let path = directory; ; path = dirname(path)) {
    const stat = lstatSync(path);
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'fixture_adapter_media_path_unsafe');
    if (path === dirname(path)) break;
  }
  const name = manifest.preflight.uploadName;
  check(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/u.test(name), 'fixture_adapter_media_path_unsafe');
  return readStablePrivateFile(resolve(directory, name), { encoding: null, expectedUid: process.getuid(),
    mode: 0o022, minBytes: 4, maxBytes: 8388608 });
}

const ownState = (row) => Object.fromEntries(['title', 'description', 'city', 'country', 'payload',
  'is_active', 'status'].map((key) => [key, row[key] ?? null]));
const stableListing = ({ updated_at, catalog_revision, ...row }) => row;
const scopeDigest = (m) => fixtureDigest({ runId: m.runId, roles: m.roles, listingId: m.listingId,
  uploadName: m.uploadName, photo: m.photo, availabilityDigest: m.availabilityDigest });
const snapshotIdentity = (snapshot, m) => {
  check(snapshot.users.length === 2 && snapshot.listing.length === 1 && snapshot.upload.length === 1,
    'fixture_adapter_rows_missing');
  for (const role of m.roles) {
    const user = snapshot.users.find((u) => u.id === role.userId);
    check(user?.profile?.syntheticOnly === true && user.profile.syntheticMarker === role.syntheticMarker
      && hasSyntheticFixtureContact(user)
      && user.role === 'user' && user.account_status === 'active' && user.deactivated_at === null,
    'fixture_adapter_synthetic_owner_drift');
  }
  check(snapshot.identities?.length === 0 && snapshot.push?.length === 0,
    'fixture_adapter_external_identity_blocked');
  const row = snapshot.listing[0]; const upload = snapshot.upload[0];
  check(row.id === m.listingId && row.owner_id === m.roles[0].userId
    && row.private_status_confirmed_at === null && row.private_pilot_region_code !== 'heilbronn'
    && row.moderation_status === 'active' && row.catalog_version === 1,
  'fixture_adapter_listing_drift');
  check(upload.storage_name === m.uploadName && upload.owner_id === row.owner_id && upload.listing_id === row.id
    && upload.purpose === 'listing_image' && upload.visibility === 'public' && upload.content_scan_status === 'passed'
    && upload.mime_type === m.photo.mimeType && upload.content_sha256 === m.photo.sha256
    && (m.photo.classification !== 'synthetic_programmatic_placeholder' || Number(upload.byte_size) === m.photo.byteSize),
  'fixture_adapter_media_row_drift');
  check(fixtureDigest({ rules: snapshot.rules, blocks: snapshot.blocks }) === m.availabilityDigest,
    'fixture_adapter_availability_drift');
};

async function schema(client, manifest) {
  const rows = (await client.query('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
  check(rows.length === manifest.schemaCount && fixtureDigest(rows) === manifest.ledgerDigest,
    'fixture_adapter_schema_drift');
}

// Enumerate every direct FK to the protected principals/listing/upload from the
// bound schema instead of guessing a partial booking/payment/message inventory.
// Root FOR UPDATE locks prevent concurrent FK dependants during the write phase.
// Only these exact edges have separate scope/lifecycle validation below or in
// the snapshot/revocation checks. Other columns of the same table are dependants.
const scopedEdges = new Set([
  'listings.owner_id.users',
  'uploads.owner_id.users', 'uploads.listing_id.listings',
  'audit_log.actor_id.users', // append-only history is retained, never restored/deleted
  'auth_sessions.user_id.users', 'refresh_tokens.user_id.users',
  'listing_availability_rules.listing_id.listings',
  'listing_availability_blocks.listing_id.listings',
  'listing_availability_blocks.created_by.users',
]);
export async function readAdapterDependencies(client, m, snapshot) {
  const edges = (await client.query(`SELECT child.relname AS table_name, child_col.attname AS column_name,
      parent.relname AS parent_table
    FROM pg_constraint c JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = c.conkey[1]
    JOIN pg_attribute parent_col ON parent_col.attrelid = parent.oid AND parent_col.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND ns.nspname = 'public'
      AND parent.relname IN ('users', 'listings', 'uploads') AND parent_col.attname = 'id'
      AND cardinality(c.conkey) = 1 ORDER BY child.relname, child_col.attname, parent.relname`)).rows;
  check(edges.length > 0, 'fixture_adapter_dependency_inventory_missing');
  const counts = {};
  for (const edge of edges) {
    check(/^[a-z][a-z0-9_]*$/u.test(edge.table_name) && /^[a-z][a-z0-9_]*$/u.test(edge.column_name)
      && ['users', 'listings', 'uploads'].includes(edge.parent_table), 'fixture_adapter_dependency_identifier');
    if (scopedEdges.has(`${edge.table_name}.${edge.column_name}.${edge.parent_table}`)) continue;
    const ids = edge.parent_table === 'users' ? m.roles.map((r) => r.userId)
      : [edge.parent_table === 'listings' ? m.listingId : snapshot.upload[0].id];
    const count = (await client.query(`SELECT count(*)::int AS count FROM "${edge.table_name}"
      WHERE "${edge.column_name}"::text = ANY($1::text[])`, [ids])).rows[0]?.count;
    check(Number.isInteger(count) && count >= 0, 'fixture_adapter_dependency_readback');
    counts[`${edge.table_name}.${edge.column_name}.${edge.parent_table}`] = count;
  }
  // Exact root-edge exceptions still reject foreign objects. Availability on
  // this listing is snapshot/digest bound; blocks authored elsewhere are not.
  const foreign = (await client.query(`SELECT
    (SELECT count(*) FROM listings WHERE owner_id = ANY($1::text[]) AND id <> $2)::int AS listings,
    (SELECT count(*) FROM uploads
      WHERE (owner_id = ANY($1::text[]) OR listing_id = $2)
        AND NOT (id = $4::uuid AND storage_name = $3 AND owner_id = $5 AND listing_id = $2))::int AS uploads,
    (SELECT count(*) FROM listing_availability_blocks
      WHERE created_by = ANY($1::text[]) AND listing_id <> $2)::int AS availability_blocks`,
  [m.roles.map((r) => r.userId), m.listingId, m.uploadName, snapshot.upload[0].id, m.roles[0].userId])).rows[0];
  check(foreign && Number.isInteger(foreign.listings) && Number.isInteger(foreign.uploads)
    && Number.isInteger(foreign.availability_blocks),
    'fixture_adapter_dependency_readback');
  return { ...counts, foreignListings: foreign.listings, foreignUploads: foreign.uploads,
    foreignAvailabilityBlocks: foreign.availability_blocks };
}
const noDependencies = (counts) => check(Object.values(counts).every((n) => n === 0), 'fixture_adapter_dependencies_present');

async function auditRows(client, m) {
  return (await client.query(`SELECT action, metadata FROM audit_log
    WHERE resource_type = 'staging_web_fixture' AND resource_id = $1 AND request_id = $2 ORDER BY id`,
  [m.listingId, m.runId])).rows;
}
async function audit(client, m, phase, metadata) {
  await client.query(`INSERT INTO audit_log (actor_role, action, resource_type, resource_id, request_id,
    before_hash, after_hash, metadata) VALUES ('system', $1, 'staging_web_fixture', $2, $3, $4, $5, $6::jsonb)`,
  [action(phase), m.listingId, m.runId, metadata.beforeHash, metadata.afterHash, JSON.stringify(metadata)]);
}
async function lockRoots(client, m) {
  await client.query('SELECT id FROM users WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE', [m.roles.map((r) => r.userId)]);
  await client.query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [m.listingId]);
  await client.query('SELECT id FROM uploads WHERE storage_name = $1 FOR UPDATE', [m.uploadName]);
}
async function writeListing(client, m, current, desired) {
  const result = await client.query(`UPDATE listings SET title=$3, description=$4, city=$5, country=$6,
    payload=$7::jsonb, is_active=$8, status=$9, catalog_revision=catalog_revision+1
    WHERE id=$1 AND catalog_revision=$2 AND owner_id=$10 RETURNING *`,
  [m.listingId, current.catalog_revision, desired.title, desired.description, desired.city, desired.country,
    JSON.stringify(desired.payload), desired.is_active, desired.status, m.roles[0].userId]);
  check(result.rowCount === 1 && result.rows.length === 1, 'fixture_adapter_compare_and_set_failed');
  const expected = { ...current, ...desired };
  check(fixtureDigest(stableListing(result.rows[0])) === fixtureDigest(stableListing(expected)),
    'fixture_adapter_write_readback_drift');
  return result.rows[0];
}
async function transaction(client, operation) {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  let committing = false;
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const result = await operation(); committing = true;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { throw Error('fixture_adapter_rollback_failed'); }
    if (committing) throw Error('fixture_adapter_commit_outcome_unknown');
    throw error;
  }
}
async function verifyCommitted(client, manifest, expectedHash, phase) {
  await schema(client, manifest);
  const snapshot = await readFixtureSnapshot(client, manifest.preflight);
  snapshotIdentity(snapshot, manifest.preflight);
  check(fixtureDigest(stableListing(snapshot.listing[0])) === expectedHash,
    'fixture_adapter_committed_readback_drift');
  const events = await auditRows(client, manifest.preflight);
  check(events.filter((event) => event.action === action(phase)
    && event.metadata.afterHash === expectedHash).length === 1, 'fixture_adapter_audit_readback_drift');
  if (phase === 'cleaned') await verifyRevocation(client, manifest.preflight);
}
async function verifyRevocation(client, m) {
  const row = (await client.query(`SELECT
    (SELECT count(*) FROM auth_sessions WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL)::int AS sessions,
    (SELECT count(*) FROM refresh_tokens WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL)::int AS refresh`,
  [m.roles.map((r) => r.userId)])).rows[0];
  check(row?.sessions === 0 && row?.refresh === 0, 'fixture_adapter_session_revocation_readback');
}

export async function runFixtureAdapter(input) {
  validateAdapterInputs(input);
  const { manifest, manifestHash, client, environment, execute = false, photoBytes, now, rehearsal } = input;
  await validateFixturePhotoContent(manifest.preflight.photo, photoBytes);
  const m = manifest.preflight; const scope = scopeDigest(m);
  const key = `sit-web-fixture:${m.listingId}`;
  const locked = (await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [key])).rows[0]?.locked;
  check(locked === true, 'fixture_adapter_concurrent_run');
  try {
    await schema(client, manifest);
    let snapshot = await readFixtureSnapshot(client, m);
    snapshotIdentity(snapshot, m);
    let events = await auditRows(client, m);
    check(events.every((event) => event.metadata.scopeDigest === scope), 'fixture_adapter_run_collision');
    check(events.length <= 3 && events.every((event, index) =>
      event.action === action(['activated', 'hidden', 'cleaned'][index])), 'fixture_adapter_audit_ambiguous');
    const activated = events.filter((r) => r.action === action('activated'));
    check(activated.length <= 1, 'fixture_adapter_audit_ambiguous');
    const activation = activated[0]?.metadata;
    const counts = await readAdapterDependencies(client, m, snapshot);
    if (manifest.operation === 'activate') {
      await verifyRevocation(client, m);
      if (activation) {
        check(activation.manifestDigest === manifestHash && events.length === 1
          && fixtureDigest(stableListing(snapshot.listing[0])) === activation.afterHash,
        'fixture_adapter_replay_drift');
        noDependencies(counts);
        return result('already-prepared-runtime-still-blocked', manifest, activation.afterHash);
      }
      check(events.length === 0, 'fixture_adapter_run_collision');
      noDependencies(counts);
      // Repeat the existing read-only preflight on this same, locked session.
      await preflightWebFixture({ manifest: m, environment, client, photoBytes, now, rehearsal });
    } else {
      check(activation?.manifestDigest === manifest.activationDigest, 'fixture_adapter_activation_binding_required');
      check(fixtureDigest(snapshot) === m.snapshotDigest, 'fixture_snapshot_drift');
      check(fixtureDigest({ ...stableListing(snapshot.listing[0]), ...activation.before }) === activation.beforeHash,
        'fixture_adapter_before_image_drift');
      if (events.some((r) => r.action === action('cleaned'))) {
        const cleaned = events.find((r) => r.action === action('cleaned')).metadata;
        check(fixtureDigest(stableListing(snapshot.listing[0])) === cleaned.afterHash
          && snapshot.listing[0].is_active === false && snapshot.sessions.every((s) => s.revoked_at),
        'fixture_adapter_cleanup_replay_drift');
        noDependencies(counts);
        await verifyRevocation(client, m);
        return result('already-cleaned', manifest, cleaned.afterHash);
      }
    }
    if (!execute) {
      noDependencies(counts);
      return result('preflight-passed-no-mutation', manifest, null);
    }
    if (manifest.operation === 'activate') {
      const after = await transaction(client, async () => {
        await lockRoots(client, m); await schema(client, manifest);
        snapshot = await readFixtureSnapshot(client, m, { withinTransaction: true });
        validateFixtureSnapshot(m, snapshot); snapshotIdentity(snapshot, m);
        await verifyRevocation(client, m);
        noDependencies(await readAdapterDependencies(client, m, snapshot));
        check((await auditRows(client, m)).length === 0, 'fixture_adapter_run_collision');
        const before = snapshot.listing[0];
        const desired = { ...ownState(before), title: 'Synthetische Katalogfixture', description: fixtureNotice,
          city: 'Heilbronn', country: 'Deutschland', payload: { ...before.payload,
            title: 'Synthetische Katalogfixture', description: fixtureNotice, city: 'Heilbronn', country: 'Deutschland',
            photos: [`https://staging.shareittoo.com/api/v1/uploads/${m.uploadName}`],
            syntheticFixtureRun: m.runId, syntheticNotice: fixtureNotice } };
        const row = await writeListing(client, m, before, desired);
        await audit(client, m, 'activated', { scopeDigest: scope, manifestDigest: manifestHash,
          before: ownState(before), beforeHash: fixtureDigest(stableListing(before)),
          afterHash: fixtureDigest(stableListing(row)) });
        return row;
      });
      const digest = fixtureDigest(stableListing(after));
      await verifyCommitted(client, manifest, digest, 'activated');
      return result('database-prepared-runtime-still-blocked', manifest, digest);
    }
    // Visibility-off is its own durable safety checkpoint. A later dependency
    // or restoration failure must NOT roll back to a visible fixture.
    const hidden = events.find((r) => r.action === action('hidden'))?.metadata;
    await transaction(client, async () => {
      await lockRoots(client, m);
      snapshot = await readFixtureSnapshot(client, m, { withinTransaction: true }); snapshotIdentity(snapshot, m);
      check(fixtureDigest(snapshot) === m.snapshotDigest, 'fixture_snapshot_drift');
      const before = snapshot.listing[0];
      check(fixtureDigest(stableListing(before)) === (hidden?.afterHash ?? activation.afterHash),
        'fixture_adapter_cleanup_foreign_change');
      if (hidden) return;
      const row = await writeListing(client, m, before, { ...ownState(before), is_active: false, status: 'paused',
        payload: { ...before.payload, isActive: false, status: 'paused' } });
      await client.query(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at, now()),
        revoked_reason=COALESCE(revoked_reason, 'staging_fixture_cleanup') WHERE user_id=ANY($1::text[])`, [m.roles.map((r) => r.userId)]);
      await client.query(`UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()),
        revoked_reason=COALESCE(revoked_reason, 'staging_fixture_cleanup') WHERE user_id=ANY($1::text[])`, [m.roles.map((r) => r.userId)]);
      await audit(client, m, 'hidden', { scopeDigest: scope, beforeHash: fixtureDigest(stableListing(before)),
        afterHash: fixtureDigest(stableListing(row)) });
    });
    const after = await transaction(client, async () => {
      await lockRoots(client, m); await schema(client, manifest);
      snapshot = await readFixtureSnapshot(client, m, { withinTransaction: true }); snapshotIdentity(snapshot, m);
      events = await auditRows(client, m);
      const hiddenState = events.find((r) => r.action === action('hidden'))?.metadata;
      check(snapshot.listing[0].is_active === false
        && fixtureDigest(stableListing(snapshot.listing[0])) === hiddenState?.afterHash,
      'fixture_adapter_cleanup_foreign_change');
      noDependencies(await readAdapterDependencies(client, m, snapshot));
      const row = await writeListing(client, m, snapshot.listing[0], { ...activation.before,
        is_active: false, status: 'paused', payload: { ...activation.before.payload, isActive: false, status: 'paused' } });
      await audit(client, m, 'cleaned', { scopeDigest: scope, beforeHash: hiddenState.afterHash,
        afterHash: fixtureDigest(stableListing(row)) });
      await verifyRevocation(client, m);
      return row;
    });
    const digest = fixtureDigest(stableListing(after));
    await verifyCommitted(client, manifest, digest, 'cleaned');
    return result('cleaned-noncatalogued-audits-retained', manifest, digest);
  } finally {
    const unlocked = (await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked', [key])).rows[0]?.unlocked;
    check(unlocked === true, 'fixture_adapter_unlock_failed');
  }
}
function result(status, manifest, listingDigest) {
  const manifestDigest = sha(Buffer.from(JSON.stringify(manifest)));
  return { status, operation: manifest.operation, listingDigest, runtimeActivated: false,
    manifestDigest, activationDigest: manifest.operation === 'activate' ? manifestDigest : manifest.activationDigest,
    sourceCommit: manifest.sourceCommit, scopeDigest: scopeDigest(manifest.preflight),
    handoff: { kind: 'sit-web-fixture-runtime-handoff', activationAllowed: false,
      requiredSourceCommit: manifest.sourceCommit, requiresSeparateGreenReview: true,
      requiredFlag: 'SIT_STAGING_SYNTHETIC_CATALOG_ENABLED',
      requiredFlagValue: manifest.operation === 'activate' ? 'true' : 'false',
      noProductionOrProviderAuthority: true } };
}

export function parseAdapterArguments(args) {
  check(args.length === 2 || (args.length === 5 && args[2] === '--execute'), 'fixture_adapter_arguments');
  check(/^[a-f0-9]{64}$/u.test(args[1]), 'fixture_adapter_arguments');
  return { file: args[0], fileHash: args[1], execute: args.length === 5,
    confirmSource: args[3], confirmRun: args[4] };
}
async function main() {
  check(Number(process.versions.node.split('.')[0]) >= 22, 'fixture_adapter_node_version');
  const args = parseAdapterArguments(process.argv.slice(2));
  const bytes = readPrivateFixtureInput(args.file); check(sha(bytes) === args.fileHash, 'fixture_adapter_private_hash');
  const manifest = JSON.parse(bytes);
  const input = { ...args, manifest, manifestHash: sha(Buffer.from(JSON.stringify(manifest))),
    source: readAdapterSource(), environment: process.env,
    photoBytes: readPrivateFixtureInput(manifest.preflight.photo.file, { maxBytes: 8388608 }),
    storedPhotoBytes: readAdapterStoredPhoto(manifest, process.env) };
  validateAdapterInputs(input);
  const { Pool } = await import('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { const client = await pool.connect();
    try { process.stdout.write(`${JSON.stringify(await runFixtureAdapter({ ...input, client }))}\n`); }
    finally { client.release(); }
  } finally { await pool.end(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(() => {
  process.stderr.write('{"status":"failed","code":"fixture_adapter_failed_no_automatic_retry"}\n');
  process.exitCode = 1;
});
