import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  fixtureDigest, fixtureEnvironmentDigest, fixtureEnvironmentKeys,
  fixtureNotice, fixtureTarget, preflightWebFixture,
  readPrivateFixtureInput, validateFixtureManifest,
} from '../ops/staging_web_fixture_preflight.mjs';

const now = new Date('2026-09-30T12:00:00Z');
function fixture() {
  const photoBytes = Buffer.from([0xff, 0xd8, 0xff, 0, 1]);
  const roles = ['owner', 'renter'].map((role) => ({ role, userId: `synthetic-${role}`,
    syntheticMarker: 'synthetic-fixture-test' }));
  const snapshot = {
    users: roles.map((r) => ({ id: r.userId, role: 'user', account_status: 'active',
      deactivated_at: null, email_verified_at: now, private_use_confirmed_at: now,
      private_marketplace_review_status: 'clear', profile: { syntheticOnly: true,
        syntheticMarker: r.syntheticMarker } })),
    listing: [{ id: 'synthetic-listing', owner_id: roles[0].userId, catalog_version: 1,
      is_active: true, status: 'active', moderation_status: 'active', category_id: 'cat3',
      subcategory: 'Sonstiges', private_status_confirmed_at: null, private_pilot_region_code: null }],
    upload: [{ storage_name: 'fixture.jpg', owner_id: roles[0].userId, listing_id: 'synthetic-listing',
      purpose: 'listing_image', visibility: 'public', content_scan_status: 'passed' }],
    rules: [], blocks: [], bookings: [], requests: [], sessions: [], identities: [], push: [],
  };
  const environment = {
    DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: 'a'.repeat(40),
    DATABASE_URL: 'postgres://shareittoo_green@sit-green-postgres-20260918011528-wp254/shareittoo_green',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: roles.map((r) => r.userId).join(','),
    SIT_STAGING_PUBLIC_LISTING_IDS: 'synthetic-listing', SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'fixture.jpg',
    PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'disabled',
  };
  const manifest = { kind: 'sit-staging-web-two-role-preflight', schemaVersion: 1,
    target: fixtureTarget, runId: 'web-fixture-20260930-test', createdAt: now.toISOString(),
    runtimeCommit: environment.APP_COMMIT, environmentDigest: fixtureEnvironmentDigest(environment),
    snapshotDigest: fixtureDigest(snapshot), database: { host: 'sit-green-postgres-20260918011528-wp254',
      name: 'shareittoo_green', user: 'shareittoo_green' }, roles,
    listingId: 'synthetic-listing', uploadName: 'fixture.jpg', region: 'heilbronn',
    fixtureClass: 'synthetic_noncontractual_catalog_only', notice: fixtureNotice, realOffer: false,
    ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
    availabilityDigest: fixtureDigest({ rules: [], blocks: [] }),
    photo: { classification: 'authentic_non_ai', mimeType: 'image/jpeg',
      sha256: createHash('sha256').update(photoBytes).digest('hex'),
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
      creator: 'Synthetic test provenance', license: 'CC0-1.0', capturedAt: '2017-05-26',
      currentProductEvidence: false },
  };
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes('current_database()')) return { rows: [{ name: 'shareittoo_green', username: 'shareittoo_green' }] };
    const keys = { users: 'users', listings: 'listing', uploads: 'upload',
      listing_availability_rules: 'rules', listing_availability_blocks: 'blocks',
      bookings: 'bookings', rental_requests: 'requests', auth_sessions: 'sessions',
      auth_identities: 'identities', push_devices: 'push' };
    const table = /FROM (\w+)/u.exec(sql)?.[1];
    return { rows: table ? snapshot[keys[table]] : [] };
  } };
  return { manifest, environment, photoBytes, snapshot, client, calls, now };
}

test('positive preparation reads exact two roles; never claims executable or catalog mutation', async () => {
  const f = fixture(); const result = await preflightWebFixture(f);
  assert.equal(result.status, 'preflight-passed-no-mutation');
  assert.equal(result.executable, false);
  assert.equal(result.blocker, 'synthetic_catalog_activation_not_prepared');
  assert.equal(f.calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.calls.at(-1), 'ROLLBACK');
  assert.ok(f.calls.every((sql) => /^(SELECT|BEGIN|SET LOCAL|ROLLBACK)\b/u.test(sql)));
  assert.ok(!JSON.stringify(result).includes('synthetic-owner'));
});
test('execute is rejected before even querying database', async () => {
  const f = fixture();
  await assert.rejects(preflightWebFixture({ ...f, execute: true }), /mutation_adapter_not_approved/u);
  assert.deepEqual(f.calls, []);
});

for (const [name, edit] of Object.entries({
  production: (f) => { f.environment.DEPLOYMENT_ENVIRONMENT = 'production'; },
  foreignDatabase: (f) => { f.environment.DATABASE_URL = 'postgres://shareittoo_green@foreign/shareittoo_green'; },
  runtimeDrift: (f) => { f.environment.APP_COMMIT = 'b'.repeat(40); },
  missingRole: (f) => { f.environment.SIT_STAGING_ALLOWED_USER_IDS = 'synthetic-owner'; },
  extraGuest: (f) => { f.environment.SIT_STAGING_PUBLIC_LISTING_IDS += ',extra'; },
  wrongUpload: (f) => { f.environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES = 'foreign.jpg'; },
  region: (f) => { f.manifest.region = 'berlin'; },
  publicRegistrationLane: (f) => { f.environment.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED = 'true'; },
  mail: (f) => { f.environment.MAIL_TRANSPORT = 'smtp'; },
  push: (f) => { f.environment.PUSH_TRANSPORT = 'fcm'; },
  payment: (f) => { f.environment.PAYMENT_TRANSPORT = 'stripe'; },
  liveMode: (f) => { f.environment.STRIPE_LIVEMODE = 'true'; },
  duplicateRole: (f) => { f.manifest.roles[1].userId = f.manifest.roles[0].userId; },
  stale: (f) => { f.manifest.createdAt = '2026-09-29T12:00:00Z'; },
  future: (f) => { f.manifest.createdAt = '2026-10-01T12:00:00Z'; },
  inventedCurrentPhoto: (f) => { f.manifest.photo.currentProductEvidence = true; },
  generatedPhoto: (f) => { f.manifest.photo.classification = 'generated'; },
  missingLicense: (f) => { f.manifest.photo.license = ''; },
  insecurePhotoSource: (f) => { f.manifest.photo.sourceUrl = 'http://example.invalid/photo'; },
  sourceCredentials: (f) => { f.manifest.photo.sourceUrl = 'https://user:private@example.invalid/photo'; },
  alteredBytes: (f) => { f.photoBytes[3] = 2; },
  realOffer: (f) => { f.manifest.realOffer = true; },
  declaration: (f) => { f.manifest.ownerDeclaration = true; },
  booking: (f) => { f.manifest.bookingAllowed = true; },
  fixturePayment: (f) => { f.manifest.paymentAllowed = true; },
  notice: (f) => { f.manifest.notice = ''; },
})) test(`preflight rejects ${name} before SQL`, async () => {
  const f = fixture(); edit(f);
  // For explicit unsafe settings, also test a freshly bound (not just stale) manifest.
  f.manifest.environmentDigest = fixtureEnvironmentDigest(f.environment);
  await assert.rejects(preflightWebFixture(f)); assert.deepEqual(f.calls, []);
});

for (const key of fixtureEnvironmentKeys) test(`environment binds ${key}, including absence/negative values`, async () => {
  const f = fixture(); const before = fixtureEnvironmentDigest(f.environment);
  f.environment[key] = `${f.environment[key] ?? ''}-drift`;
  assert.notEqual(fixtureEnvironmentDigest(f.environment), before);
  await assert.rejects(preflightWebFixture(f)); assert.deepEqual(f.calls, []);
  const absent = { ...f.environment }; delete absent[key];
  const empty = { ...absent, [key]: '' };
  const disabled = { ...absent, [key]: 'false' };
  assert.notEqual(fixtureEnvironmentDigest(absent), fixtureEnvironmentDigest(empty));
  assert.notEqual(fixtureEnvironmentDigest(empty), fixtureEnvironmentDigest(disabled));
});
test('shell metadata and environment insertion order never change security digest', async () => {
  const f = fixture();
  const reordered = Object.fromEntries(Object.entries(f.environment).reverse());
  assert.equal(fixtureEnvironmentDigest(reordered), f.manifest.environmentDigest);
  Object.assign(f.environment, { SHLVL: '12', PWD: '/different', _: '/different/node',
    PATH: '/shell/path', TERM: 'different', USER: 'different-shell-user' });
  assert.equal(fixtureEnvironmentDigest(f.environment), f.manifest.environmentDigest);
  assert.equal((await preflightWebFixture(f)).status, 'preflight-passed-no-mutation');
});
test('bound nonstring values fail rather than disappearing during JSON serialization', () => {
  assert.throws(() => fixtureEnvironmentDigest({ NODE_ENV: undefined }), /environment_value_invalid/u);
  assert.throws(() => fixtureEnvironmentDigest({ STRIPE_LIVEMODE: false }), /environment_value_invalid/u);
});
test('inventory contains all direct preflight and access-gate environment reads', () => {
  const source = readFileSync(new URL('../ops/staging_web_fixture_preflight.mjs', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/staging_access_gate.js', import.meta.url), 'utf8');
  for (const match of source.matchAll(/(?:environment|process\.env)\.([A-Z][A-Z0-9_]+)/gu)) {
    assert.ok(fixtureEnvironmentKeys.includes(match[1]), `unbound security input ${match[1]}`);
  }
});

for (const [name, edit] of Object.entries({
  realUser: (f) => { f.snapshot.users[0].profile.syntheticOnly = false; },
  markerDrift: (f) => { f.snapshot.users[1].profile.syntheticMarker = 'other'; },
  missingUser: (f) => { f.snapshot.users.pop(); },
  foreignOwner: (f) => { f.snapshot.listing[0].owner_id = 'foreign'; },
  unmoderated: (f) => { f.snapshot.listing[0].moderation_status = 'pending'; },
  wrongCategory: (f) => { f.snapshot.listing[0].category_id = 'vehicles'; },
  alreadyDeclared: (f) => { f.snapshot.listing[0].private_status_confirmed_at = now; },
  alreadyRegional: (f) => { f.snapshot.listing[0].private_pilot_region_code = 'heilbronn'; },
  foreignMedia: (f) => { f.snapshot.upload[0].owner_id = 'foreign'; },
  unscannedMedia: (f) => { f.snapshot.upload[0].content_scan_status = 'pending'; },
  bookingDependency: (f) => { f.snapshot.bookings.push({ id: 'bound' }); },
  requestDependency: (f) => { f.snapshot.requests.push({ id: 'bound' }); },
  providerIdentity: (f) => { f.snapshot.identities.push({ id: 'bound' }); },
  activeSession: (f) => { f.snapshot.sessions.push({ revoked_at: null }); },
  malformedSession: (f) => { f.snapshot.sessions.push({}); },
  pushDevice: (f) => { f.snapshot.push.push({ id: 'bound' }); },
  availabilityDrift: (f) => { f.snapshot.blocks.push({ id: 'changed' }); },
})) test(`snapshot rejects ${name} without mutation`, async () => {
  const f = fixture(); edit(f); f.manifest.snapshotDigest = fixtureDigest(f.snapshot);
  await assert.rejects(preflightWebFixture(f)); assert.equal(f.calls.at(-1), 'ROLLBACK');
});
test('unrelated row drift also fails the complete snapshot binding', async () => {
  const f = fixture(); f.snapshot.users[0].updated_at = now;
  await assert.rejects(preflightWebFixture(f), /snapshot_drift/u);
});
test('Date runtime values have same digest as persisted ISO values', () => {
  assert.equal(fixtureDigest({ a: now }), fixtureDigest({ a: now.toISOString() }));
});
for (let phase = 1; phase <= 12; phase += 1) test(`read fault ${phase} never emits PASS and rolls back`, async () => {
  const f = fixture(); const query = f.client.query; let index = 0;
  f.client.query = async (...args) => {
    if (index++ === phase) throw Error('injected-read-fault');
    return query(...args);
  };
  await assert.rejects(preflightWebFixture(f)); assert.equal(f.calls.at(-1), 'ROLLBACK');
});
test('rollback failure is failure, never preflight PASS', async () => {
  const f = fixture(); const query = f.client.query;
  f.client.query = async (sql) => { if (sql === 'ROLLBACK') throw Error('rollback-failed'); return query(sql); };
  await assert.rejects(preflightWebFixture(f), /rollback-failed/u);
});
test('BEGIN failure never reads rows or reports preparation success', async () => {
  const f = fixture(); let calls = 0;
  f.client.query = async () => { calls += 1; throw Error('begin-failed'); };
  await assert.rejects(preflightWebFixture(f), /begin-failed/u); assert.equal(calls, 1);
});
test('actual database identity mismatch rolls back before reading selected rows', async () => {
  const f = fixture(); const query = f.client.query;
  f.client.query = async (sql) => sql.includes('current_database()')
    ? { rows: [{ name: 'foreign', username: 'foreign' }] } : query(sql);
  await assert.rejects(preflightWebFixture(f), /database_identity_drift/u);
  assert.equal(f.calls.at(-1), 'ROLLBACK');
  assert.ok(!f.calls.some((sql) => sql.includes('FROM users')));
});
test('private input rejects repository files and relative paths without writing', () => {
  assert.throws(() => readPrivateFixtureInput('relative.json'));
  assert.throws(() => readPrivateFixtureInput(new URL('../package.json', import.meta.url).pathname));
});
test('CLI has no secret-bearing error output, execute path, or credential writes', () => {
  const source = readFileSync(new URL('../ops/staging_web_fixture_preflight.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('!process.env.SIT_WEB_FIXTURE_EXECUTE'));
  assert.ok(source.includes('!process.env.SIT_WEB_FIXTURE_CONFIRM'));
  assert.ok(!/writeFile|hashPassword|UPDATE users|UPDATE listings|fetch\(/u.test(source));
  assert.throws(() => validateFixtureManifest({}), /fixture_manifest_invalid/u);
});
