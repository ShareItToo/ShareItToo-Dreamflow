import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { programmaticPlaceholder } from './fixtures/programmatic_placeholder.mjs';
import { fixtureDigest, fixtureEnvironmentDigest, fixtureNotice, fixtureTarget,
  validateFixtureManifest, isolatedFixtureRehearsal } from '../ops/staging_web_fixture_preflight.mjs';
import { adapterSources, runFixtureAdapter, validateAdapterInputs, parseAdapterArguments,
  readAdapterSource } from '../ops/staging_web_fixture_adapter.mjs';

const now = new Date('2026-09-30T12:00:00Z');
const bytesHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copy = (value) => structuredClone(value);
test('adapter accepts only the typed stored WebP placeholder, rejects DB media drift before writes', async () => {
  const { photo, bytes } = await programmaticPlaceholder();
  for (const edit of [null, { mime_type: 'image/jpeg' }, { byte_size: bytes.length + 1 }, { content_sha256: '0'.repeat(64) }]) {
    const f = fixture(); f.photoBytes = bytes; f.storedPhotoBytes = bytes; f.manifest.preflight.photo = photo;
    Object.assign(f.state.snapshot.upload[0], { mime_type: 'image/webp', byte_size: bytes.length, content_sha256: photo.sha256 }, edit);
    f.manifest.preflight.snapshotDigest = fixtureDigest(f.state.snapshot); f.bind();
    if (edit) await assert.rejects(runFixtureAdapter(f), /media_row_drift/u);
    else assert.equal((await runFixtureAdapter(f)).status, 'preflight-passed-no-mutation');
    assert.equal(f.state.events.length, 0);
  }
});
function fixture() {
  const photoBytes = Buffer.from([255, 216, 255, 0, 3]);
  const roles = ['owner', 'renter'].map((role) => ({ role, userId: `synthetic-${role}`, syntheticMarker: 'synthetic-test' }));
  const snapshot = {
    users: roles.map((r) => ({ id: r.userId, role: 'user', account_status: 'active', deactivated_at: null,
      email: `${r.role}@example.invalid`, phone_e164: null,
      email_verified_at: now, private_use_confirmed_at: now, private_marketplace_review_status: 'clear',
      profile: { syntheticOnly: true, syntheticMarker: r.syntheticMarker } })),
    listing: [{ id: 'synthetic-listing', owner_id: roles[0].userId, catalog_version: 1, catalog_revision: 4,
      is_active: true, status: 'active', moderation_status: 'active', category_id: 'cat3', subcategory: 'Sonstiges',
      private_status_confirmed_at: null, private_pilot_region_code: null, title: 'Test', description: 'Test data',
      city: 'Excluded', country: 'Deutschland', payload: { id: 'synthetic-listing', title: 'Test', photos: [] }, updated_at: now }],
    upload: [{ id: '11111111-1111-4111-8111-111111111111', storage_name: 'fixture.jpg', owner_id: roles[0].userId,
      listing_id: 'synthetic-listing', purpose: 'listing_image', visibility: 'public', content_scan_status: 'passed',
      mime_type: 'image/jpeg', content_sha256: bytesHash(photoBytes) }],
    rules: [], blocks: [], bookings: [], requests: [], sessions: [], identities: [], push: [],
  };
  const environment = { DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: 'a'.repeat(40),
    DATABASE_URL: 'postgres://shareittoo_green@sit-green-postgres-20260918011528-wp254/shareittoo_green',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: roles.map((r) => r.userId).join(','),
    SIT_STAGING_PUBLIC_LISTING_IDS: 'synthetic-listing', SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'fixture.jpg',
    PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'disabled' };
  const ledger = Array.from({ length: 103 }, (_, i) => ({ name: `${String(i + 1).padStart(3, '0')}_fixture.up.sql`, checksum: 'a'.repeat(64) }));
  const source = { commit: 'b'.repeat(40), hashes: Object.fromEntries(adapterSources.map((p) => [p, 'c'.repeat(64)])),
    ledgerDigest: fixtureDigest(ledger), schemaCount: 103 };
  const preflight = { kind: 'sit-staging-web-two-role-preflight', schemaVersion: 1, target: fixtureTarget,
    runId: 'web-fixture-20260930-adapter', createdAt: now.toISOString(), runtimeCommit: environment.APP_COMMIT,
    environmentDigest: fixtureEnvironmentDigest(environment), snapshotDigest: fixtureDigest(snapshot),
    database: { host: 'sit-green-postgres-20260918011528-wp254', name: 'shareittoo_green', user: 'shareittoo_green' },
    roles, listingId: 'synthetic-listing', uploadName: 'fixture.jpg', region: 'heilbronn',
    fixtureClass: 'synthetic_noncontractual_catalog_only', notice: fixtureNotice,
    realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
    availabilityDigest: fixtureDigest({ rules: [], blocks: [] }), photo: { classification: 'authentic_non_ai',
      file: '/private/synthetic-fixture-input.jpg',
      mimeType: 'image/jpeg', sha256: bytesHash(photoBytes), currentProductEvidence: false,
      sourceUrl: 'https://example.invalid/illustration', creator: 'Synthetic fixture', license: 'CC0', capturedAt: '2017-01-01' } };
  const manifest = { kind: 'sit-staging-web-fixture-adapter', schemaVersion: 1, operation: 'activate',
    sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: 103, ledgerDigest: source.ledgerDigest,
    uploadDirectory: '/data/uploads', preflight };
  const f = { manifest, source, environment, photoBytes, storedPhotoBytes: Buffer.from(photoBytes), now,
    state: { snapshot, events: [], refresh: [], dependencyCount: 0 }, calls: [], failAt: null, rollbackFail: false };
  let saved; let mutatingTransaction = false;
  const tableKeys = { users: 'users', listings: 'listing', uploads: 'upload', listing_availability_rules: 'rules',
    listing_availability_blocks: 'blocks', bookings: 'bookings', rental_requests: 'requests', auth_sessions: 'sessions',
    auth_identities: 'identities', push_devices: 'push' };
  f.client = { async query(sql, params = []) {
    f.calls.push(sql);
    if (f.failAt === f.calls.length) throw Error('injected_query_failure');
    if (sql === 'ROLLBACK' && f.rollbackFail && mutatingTransaction) throw Error('injected_rollback_failure');
    if (sql.startsWith('BEGIN')) { saved = copy(f.state); mutatingTransaction = sql.includes('SERIALIZABLE'); return { rows: [] }; }
    if (sql === 'ROLLBACK') { if (saved) f.state = saved; saved = undefined; return { rows: [] }; }
    if (sql === 'COMMIT') { saved = undefined;
      if (f.commitResponseLost) throw Error('injected_commit_response_lost');
      return { rows: [] }; }
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: !f.locked }] };
    if (sql.includes('pg_advisory_unlock')) return { rows: [{ unlocked: !f.unlockFail }] };
    if (sql.includes('FROM schema_migrations')) return { rows: f.schemaDrift ? [] : ledger };
    if (sql.includes('current_database()')) return { rows: [{ name: 'shareittoo_green', username: 'shareittoo_green' }] };
    if (sql.includes('FROM pg_constraint')) return { rows: [
      { table_name: 'bookings', column_name: 'listing_id', parent_table: 'listings' },
      { table_name: 'messages', column_name: 'sender_id', parent_table: 'users' },
      { table_name: 'booking_condition_evidence', column_name: 'upload_id', parent_table: 'uploads' },
      ...['listings.owner_id.users', 'uploads.owner_id.users', 'uploads.listing_id.listings',
        'audit_log.actor_id.users', 'auth_sessions.user_id.users', 'refresh_tokens.user_id.users',
        'listing_availability_rules.listing_id.listings', 'listing_availability_blocks.listing_id.listings',
        'listing_availability_blocks.created_by.users', ...(f.state.extraEdges ?? [])].map((key) => {
        const [table_name, column_name, parent_table] = key.split('.');
        return { table_name, column_name, parent_table };
      }),
    ] };
    if (sql.includes('AS listings,')) {
      assert.match(sql, /owner_id = ANY\(\$1::text\[\]\) OR listing_id = \$2/u);
      assert.match(sql, /id = \$4::uuid AND storage_name = \$3 AND owner_id = \$5 AND listing_id = \$2/u);
      assert.match(sql, /created_by = ANY\(\$1::text\[\]\) AND listing_id <> \$2/u);
      const uploads = [f.state.snapshot.upload[0], ...(f.state.additionalUploads ?? [])];
      return { rows: [{ listings: 0, uploads: uploads.filter((u) =>
        (params[0].includes(u.owner_id) || u.listing_id === params[1])
        && !(u.id === params[3] && u.storage_name === params[2] && u.owner_id === params[4]
          && u.listing_id === params[1])).length,
        availability_blocks: [...f.state.snapshot.blocks, ...(f.state.otherBlocks ?? [])]
          .filter((b) => params[0].includes(b.created_by) && b.listing_id !== params[1]).length }] };
    }
    if (sql.includes('AS sessions,')) return { rows: [{ sessions: f.state.snapshot.sessions.filter((s) => !s.revoked_at).length,
      refresh: f.state.refresh.filter((s) => !s.revoked_at).length }] };
    if (sql.includes('count(*)::int AS count FROM')) {
      const table = /FROM "([a-z_]+)"/u.exec(sql)[1];
      const column = /WHERE "([a-z_]+)"/u.exec(sql)[1];
      return { rows: [{ count: f.state.edgeCounts?.[`${table}.${column}`] ?? f.state.dependencyCount }] };
    }
    if (sql.includes('FROM audit_log')) return { rows: copy(f.state.events) };
    if (sql.startsWith('INSERT INTO audit_log')) {
      f.state.events.push({ action: params[0], metadata: JSON.parse(params[5]) }); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE listings')) {
      const row = f.state.snapshot.listing[0];
      if (f.casFail || row.catalog_revision !== params[1]) return { rows: [], rowCount: 0 };
      Object.assign(row, { title: params[2], description: params[3], city: params[4], country: params[5],
        payload: JSON.parse(params[6]), is_active: params[7], status: params[8], catalog_revision: row.catalog_revision + 1 });
      return { rows: [f.writeReadbackDrift ? { ...copy(row), city: 'unexpected' } : copy(row)], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE auth_sessions')) {
      f.state.snapshot.sessions.forEach((s) => { s.revoked_at ??= now; }); return { rows: [] };
    }
    if (sql.startsWith('UPDATE refresh_tokens')) {
      f.state.refresh.forEach((s) => { s.revoked_at ??= now; }); return { rows: [] };
    }
    if (sql.includes('FOR UPDATE') || sql.startsWith('SET LOCAL')) return { rows: [] };
    const table = /FROM (\w+)/u.exec(sql)?.[1];
    if (tableKeys[table]) return { rows: copy(f.state.snapshot[tableKeys[table]]) };
    throw Error(`unmodeled_test_query:${sql}`);
  } };
  f.bind = () => { f.manifestHash = bytesHash(Buffer.from(JSON.stringify(f.manifest))); return f; };
  f.executionInput = () => ({ ...f.bind(), execute: true, confirmSource: f.manifest.sourceCommit,
    confirmRun: f.manifest.preflight.runId });
  // A NEW, explicitly rebound cleanup manifest; scope/run stay immutable while
  // freshness/runtime/environment/current snapshot are independently captured.
  f.prepareCleanupManifest = (activationDigest) => {
    f.manifest = { ...copy(f.manifest), operation: 'cleanup', activationDigest,
      preflight: { ...copy(f.manifest.preflight), createdAt: f.now.toISOString(),
        runtimeCommit: f.environment.APP_COMMIT, environmentDigest: fixtureEnvironmentDigest(f.environment),
        snapshotDigest: fixtureDigest(f.state.snapshot) } };
    return f.bind();
  };
  return f.bind();
}

function localRehearsal() {
  const f = fixture(); f.rehearsal = isolatedFixtureRehearsal;
  f.manifest.preflight.database = { host: '127.0.0.1', name: 'sit_integration', user: 'sit_runner' };
  f.environment.DATABASE_URL = 'postgresql://sit_runner@127.0.0.1:15432/sit_integration';
  f.environment.NODE_ENV = 'test';
  f.manifest.preflight.environmentDigest = fixtureEnvironmentDigest(f.environment);
  return f.bind();
}
test('isolated rehearsal accepts only explicit local test identity; default binding is unchanged', () => {
  const f = localRehearsal(); validateAdapterInputs(f);
  assert.throws(() => validateAdapterInputs({ ...f, rehearsal: undefined }), /fixture_database_invalid/u);
  for (const rehearsal of [true, 'isolated-fixture-pg16-rehearsal', {}, Symbol('isolated-fixture-pg16-rehearsal')]) {
    assert.throws(() => validateAdapterInputs({ ...f, rehearsal }), /fixture_rehearsal_binding_invalid/u);
  }
  for (const value of [undefined, '', 'test']) {
    const accepted = localRehearsal();
    if (value === undefined) delete accepted.environment.NODE_ENV; else accepted.environment.NODE_ENV = value;
    accepted.manifest.preflight.environmentDigest = fixtureEnvironmentDigest(accepted.environment);
    validateAdapterInputs(accepted.bind());
  }
});
for (const [key, value] of [
  ['DEPLOYMENT_ENVIRONMENT', 'staging'], ['DEPLOYMENT_ENVIRONMENT', 'production'], ['NODE_ENV', 'production'],
  ['DATABASE_URL', 'postgresql://sit_runner@localhost:15432/sit_integration'],
  ['DATABASE_URL', 'postgresql://sit_runner@0.0.0.0:15432/sit_integration'],
  ['DATABASE_URL', 'postgresql://sit_runner@127.0.0.2:15432/sit_integration'],
  ['DATABASE_URL', 'postgresql://sit_runner@127.0.0.1/sit_integration'],
  ['DATABASE_URL', 'postgresql://sit_runner@127.0.0.1:15432/other'],
  ['DATABASE_URL', 'postgresql://other@127.0.0.1:15432/sit_integration'],
  ['DATABASE_URL', 'postgresql://sit_runner:synthetic@127.0.0.1:15432/sit_integration'],
  ['DATABASE_URL', 'postgresql://sit_runner@127.0.0.1:15432/sit_integration?host=elsewhere'],
  ['DATABASE_URL', 'postgresql://sit_runner@127.0.0.1:15432/sit_integration#ignored'],
  ['PAYMENT_TRANSPORT', 'stripe'], ['STRIPE_LIVEMODE', 'true'],
  ['SIT_STAGING_SYNTHETIC_CATALOG_ENABLED', 'true'], ['SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'true'],
  ['MAIL_TRANSPORT', 'smtp'], ['PUSH_TRANSPORT', 'firebase'],
]) test(`rehearsal does not admit unsafe environment: ${key}=${value}`, () => {
  const f = localRehearsal(); f.environment[key] = value;
  f.manifest.preflight.environmentDigest = fixtureEnvironmentDigest(f.environment);
  const expected = key === 'DEPLOYMENT_ENVIRONMENT' && value === 'production'
    ? /^Error: staging access gate configuration is forbidden in production$/u
    : /fixture_(rehearsal_binding_invalid|database_invalid|effect_boundary_unsafe|runtime_drift|access_scope_drift)/u;
  assert.throws(() => validateAdapterInputs(f.bind()), expected);
});
for (const key of ['host', 'name', 'user']) test(`rehearsal rejects non-exact manifest database ${key}`, () => {
  const f = localRehearsal(); f.manifest.preflight.database[key] = 'other';
  assert.throws(() => validateAdapterInputs(f.bind()), /fixture_database_invalid/u);
});
test('neither CLI can obtain or pass rehearsal capability from arguments/environment/manifest', () => {
  for (const file of ['staging_web_fixture_preflight.mjs', 'staging_web_fixture_adapter.mjs']) {
    const sourceText = readFileSync(new URL(`../ops/${file}`, import.meta.url), 'utf8');
    const main = sourceText.slice(sourceText.indexOf('async function main()'));
    assert.doesNotMatch(main, /rehearsal|isolatedFixtureRehearsal|\.\.\.manifest|\.\.\.process\.env/u);
    assert.match(main, /validate(FixtureManifest|AdapterInputs)\(/u);
    if (file.includes('_adapter.')) {
      assert.deepEqual(Object.keys(parseAdapterArguments(['/private/fixture.json', 'a'.repeat(64)])),
        ['file', 'fileHash', 'execute', 'confirmSource', 'confirmRun']);
      assert.match(main, /source: readAdapterSource\(\)/u);
    }
  }
});

test('default preflight repeats canonical read-only preflight on one session and produces no writes', async () => {
  const f = fixture(); const initial = copy(f.state);
  const result = await runFixtureAdapter(f);
  assert.equal(result.status, 'preflight-passed-no-mutation'); assert.equal(result.runtimeActivated, false);
  assert.equal(result.handoff.activationAllowed, false); assert.deepEqual(f.state, initial);
  assert.ok(f.calls.filter((q) => q.startsWith('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')).length >= 2);
  assert.ok(f.calls.every((q) => /^(SELECT|BEGIN|SET LOCAL|ROLLBACK)/u.test(q)));
});
test('exact staging environment is accepted alongside test, with a freshly bound digest', async () => {
  const f = fixture(); f.environment.DEPLOYMENT_ENVIRONMENT = 'staging';
  f.manifest.preflight.environmentDigest = fixtureEnvironmentDigest(f.environment); f.bind();
  assert.equal((await runFixtureAdapter(f)).status, 'preflight-passed-no-mutation');
});
test('confirmed preparation commits exact CAS plus before-image audit, never publication/region proof', async () => {
  const f = fixture(); const before = copy(f.state.snapshot.listing[0]);
  const result = await runFixtureAdapter(f.executionInput());
  const row = f.state.snapshot.listing[0];
  assert.equal(result.status, 'database-prepared-runtime-still-blocked');
  assert.equal(result.manifestDigest, f.manifestHash); assert.equal(result.activationDigest, f.manifestHash);
  assert.equal(row.city, 'Heilbronn'); assert.equal(row.payload.syntheticNotice, fixtureNotice);
  assert.equal(row.private_status_confirmed_at, null); assert.equal(row.private_pilot_region_code, null);
  assert.equal(row.category_id, before.category_id); assert.equal(f.state.events.length, 1);
  assert.equal(f.state.events[0].metadata.before.city, before.city);
  assert.ok(f.calls.includes('COMMIT')); assert.equal(result.handoff.activationAllowed, false);
  for (const privateValue of ['synthetic-owner', 'synthetic-renter', 'synthetic-listing',
    f.manifest.preflight.photo.file, f.environment.DATABASE_URL]) assert.ok(!JSON.stringify(result).includes(privateValue));
  const stable = copy(f.state); assert.equal((await runFixtureAdapter(f.executionInput())).status, 'already-prepared-runtime-still-blocked');
  assert.deepEqual(f.state, stable);
});
test('cleanup hides first, revokes sessions, restores owned fields without reactivation, retains audit; replay is read-only', async () => {
  const f = fixture(); const original = copy(f.state.snapshot.listing[0]); const activation = f.manifestHash;
  await runFixtureAdapter(f.executionInput()); f.state.snapshot.sessions.push({ id: 'session', revoked_at: null });
  f.state.refresh.push({ id: 'refresh', revoked_at: null });
  const originalSnapshot = f.manifest.preflight.snapshotDigest;
  f.prepareCleanupManifest(activation);
  assert.notEqual(f.manifest.preflight.snapshotDigest, originalSnapshot);
  assert.equal(fixtureDigest(f.state.snapshot), f.manifest.preflight.snapshotDigest);
  const result = await runFixtureAdapter(f.executionInput());
  assert.equal(result.status, 'cleaned-noncatalogued-audits-retained');
  assert.equal(result.activationDigest, activation); assert.equal(result.manifestDigest, f.manifestHash);
  const row = f.state.snapshot.listing[0]; assert.equal(row.is_active, false); assert.equal(row.status, 'paused');
  assert.equal(row.city, original.city); assert.equal(row.payload.syntheticFixtureRun, undefined);
  assert.ok(f.state.snapshot.sessions[0].revoked_at); assert.ok(f.state.refresh[0].revoked_at);
  assert.equal(f.state.events.length, 3); f.prepareCleanupManifest(activation);
  const stable = copy(f.state); assert.equal((await runFixtureAdapter(f.executionInput())).status, 'already-cleaned');
  assert.deepEqual(f.state, stable);
});
test('active refresh token blocks preparation even with no active auth session', async () => {
  const f = fixture(); f.state.refresh.push({ id: 'active-refresh', revoked_at: null });
  await assert.rejects(runFixtureAdapter(f.executionInput()), /session_revocation_readback/u);
  assert.equal(f.state.events.length, 0); assert.ok(!f.calls.some((q) => q.startsWith('UPDATE')));
});
test('foreign-owner upload on exact fixture listing is a dependency, not an exempt upload', async () => {
  const f = fixture(); f.state.additionalUploads = [{ id: '22222222-2222-4222-8222-222222222222',
    owner_id: 'foreign-owner', listing_id: f.manifest.preflight.listingId, storage_name: 'foreign.jpg' }];
  await assert.rejects(runFixtureAdapter(f.executionInput()), /dependencies_present/u);
  assert.ok(!f.calls.some((q) => q.startsWith('UPDATE')));
});
for (const edge of ['listings.moderated_by.users', 'listings.unknown_actor.users',
  'listing_availability_blocks.unknown_actor.users', 'uploads.unknown_listing.listings']) {
  test(`additional edge ${edge} is counted even on a scoped table`, async () => {
    const f = fixture(); f.state.extraEdges = [edge];
    f.state.edgeCounts = { [edge.split('.').slice(0, 2).join('.')]: 1 };
    await assert.rejects(runFixtureAdapter(f.executionInput()), /dependencies_present/u);
    assert.ok(!f.calls.some((q) => q.startsWith('UPDATE')));
  });
}
test('availability authored by a fixture principal for a foreign listing blocks activation', async () => {
  const f = fixture(); f.state.otherBlocks = [{ created_by: 'synthetic-owner', listing_id: 'foreign-listing' }];
  await assert.rejects(runFixtureAdapter(f.executionInput()), /dependencies_present/u);
  assert.ok(!f.calls.some((q) => q.startsWith('UPDATE')));
});
test('exact fixture availability and root edges remain allowed only with snapshot binding', async () => {
  const f = fixture(); f.state.snapshot.blocks.push({ id: 'bound-block', listing_id: 'synthetic-listing', created_by: 'synthetic-owner' });
  f.manifest.preflight.availabilityDigest = fixtureDigest({ rules: f.state.snapshot.rules, blocks: f.state.snapshot.blocks });
  f.manifest.preflight.snapshotDigest = fixtureDigest(f.state.snapshot); f.bind();
  assert.equal((await runFixtureAdapter(f)).status, 'preflight-passed-no-mutation');
  assert.ok(!f.calls.some((q) => q.includes('count(*)::int AS count FROM "audit_log"')));
  assert.ok(!f.calls.some((q) => q.includes('count(*)::int AS count FROM "auth_sessions"')));
});
test('revoked refresh token does not reactivate during preparation or cleanup', async () => {
  const f = fixture(); f.state.refresh.push({ id: 'revoked-refresh', revoked_at: now });
  const activation = f.manifestHash; await runFixtureAdapter(f.executionInput()); f.prepareCleanupManifest(activation);
  await runFixtureAdapter(f.executionInput()); assert.deepEqual(f.state.refresh[0].revoked_at, now);
});
test('new dependants refuse restore but retain committed hidden state and revocation checkpoint', async () => {
  const f = fixture(); const activation = f.manifestHash; await runFixtureAdapter(f.executionInput());
  f.state.dependencyCount = 1; f.prepareCleanupManifest(activation);
  await assert.rejects(runFixtureAdapter(f.executionInput()), /dependencies_present/u);
  assert.equal(f.state.snapshot.listing[0].is_active, false);
  assert.deepEqual(f.state.events.map((e) => e.action), ['staging_web_fixture.activated', 'staging_web_fixture.hidden']);
});
for (const [name, edit] of Object.entries({
  production: (f) => { f.environment.DEPLOYMENT_ENVIRONMENT = 'production'; },
  source: (f) => { f.manifest.sourceCommit = 'c'.repeat(40); },
  sourceBytes: (f) => { f.manifest.sourceHashes = {}; },
  schema: (f) => { f.manifest.schemaCount = 97; },
  photo: (f) => { f.storedPhotoBytes = Buffer.from([1, 2, 3, 4]); },
  mediaRoot: (f) => { f.environment.UPLOAD_DIR = '/foreign'; },
  stripe: (f) => { f.environment.PAYMENT_TRANSPORT = 'stripe'; },
  registration: (f) => { f.environment.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED = 'true'; },
  runtimeFlag: (f) => { f.environment.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED = 'true'; },
  effect: (f) => { f.environment.PUSH_TRANSPORT = 'fcm'; },
  principal: (f) => { f.manifest.preflight.roles[0].userId = 'foreign'; },
})) test(`adapter rejects ${name} before SQL`, async () => {
  const f = fixture(); edit(f); f.manifest.preflight.environmentDigest = fixtureEnvironmentDigest(f.environment); f.bind();
  await assert.rejects(runFixtureAdapter(f)); assert.deepEqual(f.calls, []);
});
test('execution needs both exact confirmations; CLI has no implicit mutation mode', async () => {
  for (const args of [[], ['x'], ['x', 'a'.repeat(64), '--execute'], ['x', 'a'.repeat(64), '--other', 'x', 'y']]) {
    assert.throws(() => parseAdapterArguments(args));
  }
  assert.equal(parseAdapterArguments(['/private/manifest', 'a'.repeat(64)]).execute, false);
  const f = fixture();
  for (const fields of [{}, { confirmSource: f.source.commit }, { confirmRun: f.manifest.preflight.runId },
    { confirmSource: f.source.commit, confirmRun: 'foreign' }]) {
    await assert.rejects(runFixtureAdapter({ ...f, execute: true, ...fields }), /confirmation_required/u);
  }
  assert.deepEqual(f.calls, []);
});
test('concurrent run, DB schema mismatch, CAS and rollback failure never report PASS', async () => {
  for (const [key, error] of [['locked', /concurrent_run/u], ['schemaDrift', /schema_drift/u],
    ['casFail', /compare_and_set_failed/u], ['unlockFail', /unlock_failed/u]]) {
    const f = fixture(); f[key] = true; await assert.rejects(runFixtureAdapter(f.executionInput()), error);
  }
  const f = fixture(); f.casFail = true; f.rollbackFail = true;
  await assert.rejects(runFixtureAdapter(f.executionInput()), /rollback_failed/u);
});
test('every forward query failure rolls back uncommitted preparation without false success', async () => {
  const success = fixture(); await runFixtureAdapter(success.executionInput());
  const commit = success.calls.indexOf('COMMIT') + 1;
  for (let index = 1; index <= commit; index += 1) {
    const f = fixture(); const before = copy(f.state); f.failAt = index;
    await assert.rejects(runFixtureAdapter(f.executionInput()), undefined, `query ${index}`);
    assert.deepEqual(f.state, before, `query ${index}`);
  }
});
test('cleanup foreign listing edits cannot be overwritten', async () => {
  const f = fixture(); const activation = f.manifestHash; await runFixtureAdapter(f.executionInput());
  f.state.snapshot.listing[0].title = 'foreign edit'; f.prepareCleanupManifest(activation);
  await assert.rejects(runFixtureAdapter(f.executionInput()), /cleanup_foreign_change/u);
  assert.equal(f.state.snapshot.listing[0].title, 'foreign edit');
});
for (const [name, edit] of Object.entries({
  run: (f) => { f.manifest.preflight.runId = 'web-fixture-foreign-run'; },
  scope: (f) => { f.manifest.preflight.photo.license = 'different license'; },
  stale: (f) => { f.manifest.preflight.createdAt = '2026-09-29T12:00:00Z'; },
  activationDigest: (f) => { f.manifest.activationDigest = 'a'.repeat(64); },
  snapshot: (f) => { f.manifest.preflight.snapshotDigest = 'a'.repeat(64); },
  afterHash: (f) => { f.state.events[0].metadata.afterHash = 'a'.repeat(64); },
})) test(`fresh cleanup manifest rejects changed ${name}`, async () => {
  const f = fixture(); const activation = f.manifestHash; await runFixtureAdapter(f.executionInput());
  f.prepareCleanupManifest(activation); edit(f); f.bind(); const before = copy(f.state);
  await assert.rejects(runFixtureAdapter(f.executionInput())); assert.deepEqual(f.state, before);
});
for (const type of ['session', 'refresh']) test(`activation replay cannot hand off with active ${type}`, async () => {
  const f = fixture(); await runFixtureAdapter(f.executionInput());
  if (type === 'session') f.state.snapshot.sessions.push({ revoked_at: null });
  else f.state.refresh.push({ revoked_at: null });
  await assert.rejects(runFixtureAdapter(f.executionInput()), /session_revocation_readback/u);
});
test('every cleanup query fault either preserves prestate or the durable hidden checkpoint; no false PASS', async () => {
  const baseline = fixture(); const activation = baseline.manifestHash;
  await runFixtureAdapter(baseline.executionInput()); baseline.prepareCleanupManifest(activation);
  baseline.calls.length = 0; await runFixtureAdapter(baseline.executionInput());
  const firstCommit = baseline.calls.indexOf('COMMIT') + 1;
  for (let index = 1; index <= baseline.calls.length; index += 1) {
    const f = fixture(); const digest = f.manifestHash; await runFixtureAdapter(f.executionInput());
    f.prepareCleanupManifest(digest); f.calls.length = 0; f.failAt = index;
    await assert.rejects(runFixtureAdapter(f.executionInput()), undefined, `cleanup query ${index}`);
    if (index > firstCommit) {
      assert.equal(f.state.snapshot.listing[0].is_active, false, `cleanup query ${index}`);
      assert.ok(f.state.events.some((e) => e.action === 'staging_web_fixture.hidden'));
    } else assert.equal(f.state.events.length, 1);
  }
});
test('post-commit preparation readback failure reports failure without claiming rollback of committed state', async () => {
  const baseline = fixture(); await runFixtureAdapter(baseline.executionInput());
  const f = fixture(); f.failAt = baseline.calls.indexOf('COMMIT') + 2;
  await assert.rejects(runFixtureAdapter(f.executionInput()));
  assert.equal(f.state.events.length, 1);
  assert.equal(f.state.snapshot.listing[0].city, 'Heilbronn');
});
test('lost COMMIT response preserves unknown outcome and never falsely claims rollback or success', async () => {
  const f = fixture(); f.commitResponseLost = true;
  await assert.rejects(runFixtureAdapter(f.executionInput()), /commit_outcome_unknown/u);
  assert.equal(f.state.events.length, 1); assert.equal(f.state.snapshot.listing[0].city, 'Heilbronn');
});
test('wrong RETURNING bytes roll back activation instead of accepting a row-count-only proof', async () => {
  const f = fixture(); const before = copy(f.state); f.writeReadbackDrift = true;
  await assert.rejects(runFixtureAdapter(f.executionInput()), /write_readback_drift/u);
  assert.deepEqual(f.state, before);
});
test('source contains only bounded listing/session/audit mutations; no provider/file/password writes', () => {
  const source = readFileSync(new URL('../ops/staging_web_fixture_adapter.mjs', import.meta.url), 'utf8');
  assert.ok(!/\b(fetch|writeFile|unlink|spawn)\s*\(/u.test(source));
  assert.ok(!/UPDATE\s+(?:users|uploads|bookings|payments)|DELETE\s+FROM|password_hash\s*=/iu.test(source));
  assert.match(source, /FOR UPDATE/u); assert.match(source, /catalog_revision=catalog_revision\+1/u);
  assert.match(source, /readPrivateFixtureInput\(args.file\)/u);
  assert.match(source, /readStablePrivateFile\(resolve\(directory, name\)/u);
  assert.match(readAdapterSource.toString(), /git\('status', '--porcelain'\) === ''/u);
});
for (const role of [0, 1]) {
  for (const [field, value] of [['email', 'fixture@example.com'], ['email', 'fixture@sub.example.invalid'],
    ['email', 'FIXTURE@example.invalid'], ['phone_e164', '+490000000000']]) {
    test(`role ${role} rejects non-synthetic ${field} contact`, async () => {
      const f = fixture(); f.state.snapshot.users[role][field] = value;
      f.manifest.preflight.snapshotDigest = fixtureDigest(f.state.snapshot); f.bind();
      await assert.rejects(runFixtureAdapter(f.executionInput()), /synthetic_owner_drift/u);
      assert.ok(!f.calls.some((q) => q.startsWith('UPDATE')));
    });
  }
}
test('user snapshot never selects password material and output never includes contacts or profiles', async () => {
  const f = fixture(); const output = JSON.stringify(await runFixtureAdapter(f));
  const queries = f.calls.filter((q) => /FROM users/u.test(q));
  assert.ok(queries.length > 0);
  assert.ok(queries.every((q) => !q.includes('SELECT *') && !q.includes('password_hash')));
  for (const user of f.state.snapshot.users) {
    assert.ok(!output.includes(user.email)); assert.ok(!output.includes(JSON.stringify(user.profile)));
  }
});

function aiPhoto(photo) {
  const { sourceUrl, creator, license, capturedAt, ...common } = photo;
  return { ...common, classification: 'synthetic_ai_illustration', syntheticAi: true,
    generatedAt: now.toISOString(), toolIdentity: 'Synthetic fixture generator/version-1',
    promptHash: 'a'.repeat(64), usageLicenseStatement: 'Synthetic test-only licensed illustration' };
}
test('fixture accepts authentic and separately typed AI provenance without current-product claim', () => {
  const f = fixture(); validateFixtureManifest(f.manifest.preflight, now);
  f.manifest.preflight.photo = aiPhoto(f.manifest.preflight.photo);
  validateFixtureManifest(f.manifest.preflight, now);
  f.manifest.preflight.photo.sourceUrl = 'https://example.invalid/optional-generated-source';
  validateFixtureManifest(f.manifest.preflight, now);
});
for (const key of ['syntheticAi', 'generatedAt', 'toolIdentity', 'promptHash', 'usageLicenseStatement']) {
  test(`AI fixture rejects missing ${key}`, () => {
    const f = fixture(); f.manifest.preflight.photo = aiPhoto(f.manifest.preflight.photo);
    delete f.manifest.preflight.photo[key]; assert.throws(() => validateFixtureManifest(f.manifest.preflight, now));
  });
}
test('provenance field mix, unknown fields, raw prompts and invented product evidence fail closed', () => {
  for (const [kind, key, value] of [['ai', 'capturedAt', '2017-01-01'], ['ai', 'creator', 'invented'],
    ['authentic', 'syntheticAi', true], ['ai', 'prompt', 'unnecessary raw prompt'],
    ['ai', 'currentProductEvidence', true], ['ai', 'sourceUrl', 'http://example.invalid']]) {
    const f = fixture(); const m = f.manifest.preflight;
    if (kind === 'ai') m.photo = aiPhoto(m.photo);
    m.photo[key] = value; assert.throws(() => validateFixtureManifest(m, now));
  }
});
