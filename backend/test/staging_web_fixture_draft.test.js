import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { programmaticPlaceholder } from './fixtures/programmatic_placeholder.mjs';
import { generateFixtureDraft, fixtureDraftScope } from '../ops/staging_web_fixture_draft.mjs';
import { fixtureDigest, fixtureEnvironmentDigest } from '../ops/staging_web_fixture_preflight.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
test('draft preserves objectively bound WebP placeholder metadata and verifies real pixels', async () => {
  const f = fixture(); const { photo, bytes } = await programmaticPlaceholder();
  f.photo = photo; f.photoBytes = bytes;
  Object.assign(f.snapshot.upload[0], { mime_type: 'image/webp', byte_size: bytes.length, content_sha256: photo.sha256 });
  assert.deepEqual((await f.run()).preflight.photo, { ...photo, file: '/run/sit-fixture-input/photo.webp' });
  f.photo.rgbHex = '#FFFFFF'; await assert.rejects(f.run(), /placeholder_content_invalid/u);
});
function fixture() {
  const now = new Date(); const photoBytes = Buffer.from([255, 216, 255, 0, 3]);
  const photo = { classification: 'synthetic_ai_illustration', syntheticAi: true, generatedAt: '2026-01-01',
    toolIdentity: 'unit-test/v1', promptHash: 'a'.repeat(64), usageLicenseStatement: 'Synthetic fixture only',
    mimeType: 'image/jpeg', currentProductEvidence: false, sha256: hash(photoBytes) };
  const ledger = Array.from({ length: 98 }, (_, i) => ({ name: `${i}_test.up.sql`, checksum: 'b'.repeat(64) }));
  const source = { commit: 'c'.repeat(40), schemaCount: 98, ledgerDigest: fixtureDigest(ledger), hashes: { 'source': 'd'.repeat(64) } };
  const environment = { DEPLOYMENT_ENVIRONMENT: 'test', APP_COMMIT: 'e'.repeat(40),
    DATABASE_URL: 'postgres://shareittoo_green@sit-green-postgres-20260918011528-wp254/shareittoo_green',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: 'renter,owner',
    SIT_STAGING_PUBLIC_LISTING_IDS: 'listing', SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'photo.jpg',
    PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory' };
  const users = ['owner', 'renter'].map((id) => ({ id, email: `${id}@example.invalid`, phone_e164: null,
    profile: { syntheticOnly: true, syntheticMarker: 'test' }, role: 'user', account_status: 'active', deactivated_at: null,
    email_verified_at: now, private_use_confirmed_at: now, private_marketplace_review_status: 'clear' }));
  const snapshot = { users, listing: [{ id: 'listing', owner_id: 'owner', catalog_version: 1, is_active: true,
    status: 'active', moderation_status: 'active', category_id: 'cat3', subcategory: 'Sonstiges',
    private_status_confirmed_at: null, private_pilot_region_code: null }],
    upload: [{ storage_name: 'photo.jpg', owner_id: 'owner', listing_id: 'listing', purpose: 'listing_image', visibility: 'public', content_scan_status: 'passed' }],
    rules: [], blocks: [], bookings: [], requests: [], sessions: [], identities: [], push: [] };
  const f = { now, source, environment, photo, photoBytes, snapshot, ledger, calls: [], parameters: [], adapterCalls: [] };
  f.client = { query: async (sql, params = []) => {
    f.parameters.push(params);
    f.calls.push(sql); if (f.failAt === f.calls.length) throw Error('injected');
    if (sql.includes('FROM schema_migrations')) return { rows: f.ledger };
    if (sql.includes('current_database()')) return { rows: [{ name: 'shareittoo_green', username: 'shareittoo_green' }] };
    if (sql.startsWith('SELECT id, owner_id FROM listings')) return { rows: f.snapshot.listing };
    if (sql.startsWith('SELECT id, email, phone_e164, profile,')) return { rows: f.allowedUsers ?? f.snapshot.users };
    const table = /FROM (\w+)/u.exec(sql)?.[1];
    const key = { users: 'users', listings: 'listing', uploads: 'upload', listing_availability_rules: 'rules', listing_availability_blocks: 'blocks',
      bookings: 'bookings', rental_requests: 'requests', auth_sessions: 'sessions', auth_identities: 'identities', push_devices: 'push' }[table];
    return { rows: key ? f.snapshot[key] : [] };
  } };
  f.run = () => generateFixtureDraft({ ...f, readPhoto: () => f.photoBytes, adapterPreflight: async (input) => {
    f.adapterCalls.push(input); if (f.failAdapter) throw Error('dependency-failure');
    return { status: 'preflight-passed-no-mutation', runtimeActivated: false };
  } });
  return f;
}

for (const count of [3, 4]) test(`${count} eligible accounts select by allowlist order, not reordered SQL rows`, async () => {
  for (const reverse of [false, true]) {
    const f = fixture();
    const extras = Array.from({ length: count - 2 }, (_, i) => ({ ...f.snapshot.users[1],
      id: `extra-${i}`, email: `extra-${i}@example.invalid` }));
    f.allowedUsers = [...extras, ...f.snapshot.users]; if (reverse) f.allowedUsers.reverse();
    f.environment.SIT_STAGING_ALLOWED_USER_IDS = ['owner', 'renter', ...extras.map((r) => r.id)].join(',');
    const before = structuredClone(f.allowedUsers); const result = await f.run();
    assert.deepEqual(result.preflight.roles.map((r) => r.userId), ['owner', 'renter']);
    assert.equal(result.preflight.snapshotDigest, fixtureDigest(f.snapshot));
    const discovery = f.calls.findIndex((sql) => sql.startsWith('SELECT id, email,'));
    for (const extra of extras) {
      assert.ok(!JSON.stringify(f.parameters.slice(discovery + 1)).includes(extra.id));
      assert.ok(!JSON.stringify(f.adapterCalls[0].manifest).includes(extra.id));
    }
    assert.deepEqual(f.allowedUsers, before);
    // Change only the administrator's order: the new first eligible renter wins.
    f.environment.SIT_STAGING_ALLOWED_USER_IDS = ['extra-0', 'owner', 'renter', ...extras.slice(1).map((r) => r.id)].join(',');
    f.snapshot.users = [f.snapshot.users[0], extras[0]];
    assert.deepEqual((await f.run()).preflight.roles.map((r) => r.userId), ['owner', 'extra-0']);
  }
});

test('selected renter failure never retries another eligible account', async () => {
  const f = fixture(); f.allowedUsers = [...f.snapshot.users, { ...f.snapshot.users[1], id: 'extra', email: 'extra@example.invalid' }];
  f.environment.SIT_STAGING_ALLOWED_USER_IDS += ',extra'; f.failAdapter = true;
  await assert.rejects(f.run(), /dependency-failure/u);
  assert.equal(f.adapterCalls.length, 1);
  assert.deepEqual(f.adapterCalls[0].manifest.preflight.roles.map((r) => r.userId), ['owner', 'renter']);
});

test('draft derives owner/renter, complete snapshot/availability/env/source and repeats default adapter gate', async () => {
  const f = fixture(); const draft = await f.run();
  assert.deepEqual(draft.preflight.roles.map((r) => [r.role, r.userId]), [['owner', 'owner'], ['renter', 'renter']]);
  assert.equal(draft.preflight.snapshotDigest, fixtureDigest(f.snapshot));
  assert.equal(draft.preflight.availabilityDigest, fixtureDigest({ rules: [], blocks: [] }));
  assert.equal(draft.preflight.environmentDigest, fixtureEnvironmentDigest(f.environment));
  assert.equal(draft.preflight.runtimeCommit, f.environment.APP_COMMIT); assert.notEqual(draft.sourceCommit, draft.preflight.runtimeCommit);
  assert.equal(draft.preflight.photo.file, '/run/sit-fixture-input/photo.jpg');
  assert.equal(f.calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(f.calls.at(-1), 'ROLLBACK'); assert.ok(f.calls.every((sql) => /^(?:BEGIN|SELECT|SET LOCAL|ROLLBACK)\b/u.test(sql)));
  assert.ok(f.calls.every((sql) => !/password_hash/u.test(sql)));
  assert.equal(f.adapterCalls.length, 1); assert.equal(f.adapterCalls[0].execute, false);
  assert.equal(f.adapterCalls[0].client, f.client);
});

for (const [name, alter] of Object.entries({
  realEmail: (f) => { f.snapshot.users[0].email = 'real@example.com'; },
  telephone: (f) => { f.snapshot.users[0].phone_e164 = '+491234'; },
  missingRole: (f) => { f.snapshot.users.pop(); },
  noEligibleRenter: (f) => { f.snapshot.users[1].profile.syntheticOnly = false; },
  owner: (f) => { f.snapshot.listing[0].owner_id = 'foreign'; },
  uploadOwner: (f) => { f.snapshot.upload[0].owner_id = 'foreign'; },
  scan: (f) => { f.snapshot.upload[0].content_scan_status = 'pending'; },
  dependencies: (f) => { f.snapshot.bookings.push({ id: 'foreign' }); },
  identity: (f) => { f.snapshot.identities.push({ id: 'foreign' }); },
  session: (f) => { f.snapshot.sessions.push({ revoked_at: null }); },
  ledger: (f) => { f.ledger.pop(); },
  photo: (f) => { f.photoBytes = Buffer.from('wrong'); },
  adapterGate: (f) => { f.failAdapter = true; },
})) test(`draft rejects unsafe/ambiguous fresh readback: ${name}`, async () => {
  const f = fixture(); alter(f); await assert.rejects(f.run()); assert.equal(f.calls.at(-1), 'ROLLBACK');
});

for (const [name, alter] of Object.entries({
  production: (f) => { f.environment.DEPLOYMENT_ENVIRONMENT = 'production'; },
  payment: (f) => { f.environment.PAYMENT_TRANSPORT = 'stripe'; },
  execution: (f) => { f.environment.SIT_WEB_FIXTURE_EXECUTE = '1'; },
  multipleListings: (f) => { f.environment.SIT_STAGING_PUBLIC_LISTING_IDS += ',other'; },
  provenance: (f) => { delete f.photo.usageLicenseStatement; },
  provider: (f) => { f.environment.PUSH_TRANSPORT = 'fcm'; },
})) test(`draft rejects before DB: ${name}`, async () => {
  const f = fixture(); alter(f); await assert.rejects(f.run()); assert.deepEqual(f.calls, []);
});

test('each read failure and rollback failure returns no draft and cannot become a write', async () => {
  const ok = fixture(); await ok.run();
  for (let failAt = 1; failAt <= ok.calls.length; failAt++) {
    const f = fixture(); f.failAt = failAt; await assert.rejects(f.run());
    assert.equal(f.adapterCalls.length, 0);
    assert.ok(f.calls.every((sql) => /^(?:BEGIN|SELECT|SET LOCAL|ROLLBACK)\b/u.test(sql)));
    if (failAt > 1) assert.equal(f.calls.at(-1), 'ROLLBACK');
  }
});
