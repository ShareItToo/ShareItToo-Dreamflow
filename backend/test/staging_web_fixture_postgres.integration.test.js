import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/migrations.js';
import { adapterSources, runFixtureAdapter } from '../ops/staging_web_fixture_adapter.mjs';
import { fixtureDigest, fixtureEnvironmentDigest, fixtureNotice, fixtureTarget,
  isolatedFixtureRehearsal, readFixtureSnapshot } from '../ops/staging_web_fixture_preflight.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const databaseUrl = process.env.TEST_DATABASE_URL;
const database = { host: '127.0.0.1', name: 'sit_integration', user: 'sit_runner' };
const ledger = readdirSync(new URL('backend/sql/migrations/', root)).filter((p) => p.endsWith('.up.sql')).sort()
  .map((name) => ({ name, checksum: sha(read(`backend/sql/migrations/${name}`)) }));
const source = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim(),
  hashes: Object.fromEntries(adapterSources.map((path) => [path, sha(read(path))])),
  ledgerDigest: fixtureDigest(ledger), schemaCount: ledger.length };
// Illustration bytes are synthetic, never product evidence or a usable credential.
const photoBytes = Buffer.from([255, 216, 255, 0, 3]);
const own = (row) => Object.fromEntries(['title', 'description', 'city', 'country', 'payload', 'is_active', 'status']
  .map((key) => [key, row[key]]));

async function seed(client) {
  const runId = `web-fixture-${randomUUID()}`;
  const roles = ['owner', 'renter'].map((role) => ({ role, userId: randomUUID(), syntheticMarker: runId }));
  for (const role of roles) await client.query(`INSERT INTO users (id, email, profile, role, account_status,
    email_verified_at, private_use_confirmed_at, private_marketplace_review_status, phone_e164)
    VALUES ($1,$2,$3::jsonb,'user','active',now(),now(),'clear',NULL)`,
  [role.userId, `${role.userId}@example.invalid`, JSON.stringify({ syntheticOnly: true, syntheticMarker: runId })]);
  const listingId = randomUUID(); const uploadName = `${randomUUID()}.jpg`;
  await client.query(`INSERT INTO listings (id,owner_id,payload,is_active,catalog_version,catalog_revision,
    status,currency,price_per_day_minor,title,description,category_id,subcategory,condition,
    location_text,city,country,latitude,longitude,min_days,max_days,protection_model)
    VALUES ($1,$2,$3::jsonb,true,1,1,'active','EUR',100,'Illustration only','Invented test fixture only',
      'cat3','Sonstiges','good','Synthetic','Synthetic','Deutschland',49,9,1,30,'none')`,
  [listingId, roles[0].userId, JSON.stringify({ title: 'Illustration only', photos: [], syntheticOnly: true })]);
  await client.query(`INSERT INTO uploads (owner_id,storage_name,mime_type,byte_size,purpose,visibility,
    listing_id,content_sha256,content_scan_status) VALUES ($1,$2,'image/jpeg',$3,'listing_image','public',$4,$5,'passed')`,
  [roles[0].userId, uploadName, photoBytes.length, listingId, sha(photoBytes)]);
  // Bound availability is merely synthetic display data, not real availability.
  await client.query(`INSERT INTO listing_availability_rules (listing_id,weekday,local_start,local_end)
    VALUES ($1,1,'09:00','10:00')`, [listingId]);
  await client.query(`INSERT INTO listing_availability_blocks (listing_id,created_by,starts_at,ends_at)
    VALUES ($1,$2,'2099-01-01','2099-01-02')`, [listingId, roles[0].userId]);
  const environment = { DEPLOYMENT_ENVIRONMENT: 'test', NODE_ENV: 'test', APP_COMMIT: source.commit,
    DATABASE_URL: databaseUrl, SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_ALLOWED_USER_IDS: roles.map((r) => r.userId).join(','),
    SIT_STAGING_PUBLIC_LISTING_IDS: listingId, SIT_STAGING_PUBLIC_UPLOAD_NAMES: uploadName,
    PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'false',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', MAIL_TRANSPORT: 'disabled', PUSH_TRANSPORT: 'disabled' };
  const preflight = { kind: 'sit-staging-web-two-role-preflight', schemaVersion: 1, target: fixtureTarget,
    runId, roles, listingId, uploadName, database, region: 'heilbronn', createdAt: new Date().toISOString(),
    runtimeCommit: source.commit, environmentDigest: fixtureEnvironmentDigest(environment),
    fixtureClass: 'synthetic_noncontractual_catalog_only', notice: fixtureNotice,
    realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
    photo: { classification: 'synthetic_ai_illustration', syntheticAi: true, generatedAt: '2026-01-01',
      toolIdentity: 'deterministic-test-byte-fixture/v1 (not a product photograph)', promptHash: sha('synthetic bytes'),
      usageLicenseStatement: 'Repository-owned synthetic test bytes only', currentProductEvidence: false,
      mimeType: 'image/jpeg', sha256: sha(photoBytes) } };
  const snapshot = await readFixtureSnapshot(client, preflight);
  preflight.snapshotDigest = fixtureDigest(snapshot);
  preflight.availabilityDigest = fixtureDigest({ rules: snapshot.rules, blocks: snapshot.blocks });
  return { manifest: { kind: 'sit-staging-web-fixture-adapter', schemaVersion: 1, operation: 'activate',
    sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: 98, ledgerDigest: source.ledgerDigest,
    uploadDirectory: '/data/uploads', preflight }, source, environment, photoBytes, storedPhotoBytes: photoBytes,
  client, rehearsal: isolatedFixtureRehearsal };
}
const bind = (f, execute = true) => ({ ...f, manifestHash: sha(JSON.stringify(f.manifest)), execute,
  ...(execute ? { confirmSource: source.commit, confirmRun: f.manifest.preflight.runId } : {}) });
async function cleanupManifest(f, activationDigest) {
  const preflight = { ...f.manifest.preflight, createdAt: new Date().toISOString(),
    snapshotDigest: fixtureDigest(await readFixtureSnapshot(f.client, f.manifest.preflight)) };
  return { ...f, manifest: { ...f.manifest, operation: 'cleanup', activationDigest, preflight } };
}
const events = async (f) => (await f.client.query(`SELECT * FROM audit_log
  WHERE resource_type='staging_web_fixture' AND resource_id=$1 ORDER BY id`, [f.manifest.preflight.listingId])).rows;
async function sessions(f) {
  const ids = [];
  for (const role of f.manifest.preflight.roles) {
    const id = randomUUID(); ids.push(id);
    await f.client.query('INSERT INTO auth_sessions (id,user_id,device_label) VALUES ($1,$2,$3)',
      [id, role.userId, 'Synthetic rehearsal']);
    await f.client.query(`INSERT INTO refresh_tokens (user_id,session_id,token_hash,expires_at)
      VALUES ($1,$2,$3,now()+interval '1 hour')`, [role.userId, id, sha(randomUUID())]);
  }
  return ids;
}

test('PG16 fixture adapter uses real schema, transactions, triggers and two clients',
  { skip: !databaseUrl, timeout: 120000 }, async (t) => {
    // Reject foreign targets BEFORE any connection or DDL; no inherited DATABASE_URL.
    const url = new URL(databaseUrl);
    assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, database.host);
    assert.equal(url.pathname, `/${database.name}`); assert.equal(url.username, database.user);
    assert.ok(Number(url.port) > 0); assert.equal(url.password + url.search + url.hash, '');
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
    let client; let other;
    try {
      client = await pool.connect(); other = await pool.connect();
      assert.equal(Math.floor(Number((await client.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 16);
      await pool.query(read('backend/sql/schema.sql').toString());
      await runMigrations(pool);
      assert.equal(ledger.length, 98);
      assert.deepEqual((await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows, ledger);

      await t.test('default is read-only; activate/cleanup/replays retain truth and append-only audits', async () => {
        const f = await seed(client); const m = f.manifest.preflight;
        const before = await readFixtureSnapshot(client, m);
        assert.equal((await runFixtureAdapter(bind(f, false))).status, 'preflight-passed-no-mutation');
        assert.deepEqual(await readFixtureSnapshot(client, m), before); assert.equal((await events(f)).length, 0);
        const result = await runFixtureAdapter(bind(f));
        assert.equal(result.status, 'database-prepared-runtime-still-blocked'); assert.equal(result.runtimeActivated, false);
        assert.equal(result.handoff.activationAllowed, false); assert.equal(result.activationDigest, sha(JSON.stringify(f.manifest)));
        const after = await readFixtureSnapshot(client, m);
        for (const key of Object.keys(before).filter((key) => key !== 'listing')) assert.deepEqual(after[key], before[key]);
        const allowed = ['title', 'description', 'city', 'country', 'payload', 'catalog_revision', 'updated_at'];
        for (const key of Object.keys(before.listing[0]).filter((key) => !allowed.includes(key))) {
          assert.deepEqual(after.listing[0][key], before.listing[0][key], `unexpected column change: ${key}`);
        }
        assert.equal(after.listing[0].catalog_version, 1); assert.equal(after.listing[0].catalog_revision, 2);
        assert.equal(after.listing[0].description, fixtureNotice);
        assert.equal((await runFixtureAdapter(bind(f))).status, 'already-prepared-runtime-still-blocked');
        await sessions(f);
        await assert.rejects(runFixtureAdapter(bind(f)), /fixture_adapter_session_revocation_readback/u);
        const cleanup = await cleanupManifest(f, result.activationDigest);
        const cleaned = await runFixtureAdapter(bind(cleanup));
        assert.equal(cleaned.status, 'cleaned-noncatalogued-audits-retained'); assert.equal(cleaned.runtimeActivated, false);
        assert.equal(cleaned.activationDigest, result.activationDigest); assert.equal(cleaned.handoff.requiredFlagValue, 'false');
        const final = await readFixtureSnapshot(client, m);
        assert.deepEqual(own(final.listing[0]), { ...own(before.listing[0]), is_active: false, status: 'paused',
          payload: { ...before.listing[0].payload, isActive: false, status: 'paused' } });
        assert.deepEqual(final.users, before.users); assert.deepEqual(final.upload, before.upload);
        assert.deepEqual(final.rules, before.rules); assert.deepEqual(final.blocks, before.blocks);
        assert.ok(final.sessions.length === 2 && final.sessions.every((s) => s.revoked_at && s.revoked_reason === 'staging_fixture_cleanup'));
        const refresh = (await client.query('SELECT revoked_at,revoked_reason FROM refresh_tokens WHERE user_id=ANY($1::text[])',
          [m.roles.map((r) => r.userId)])).rows;
        assert.ok(refresh.length === 2 && refresh.every((r) => r.revoked_at && r.revoked_reason === 'staging_fixture_cleanup'));
        assert.deepEqual((await events(f)).map((e) => e.action), ['activated', 'hidden', 'cleaned'].map((s) => `staging_web_fixture.${s}`));
        await assert.rejects(client.query('UPDATE audit_log SET action=action WHERE resource_id=$1', [m.listingId]), { code: '55000' });
        assert.equal((await runFixtureAdapter(bind(await cleanupManifest(cleanup, result.activationDigest)))).status, 'already-cleaned');
        assert.equal((await events(f)).length, 3);
        assert.equal(f.environment.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED, 'false');
      });

      await t.test('real FK inventory catches foreign moderation and created-by availability edges', async () => {
        const f = await seed(client); const foreign = await seed(client);
        await client.query('UPDATE listings SET moderated_by=$1 WHERE id=$2',
          [f.manifest.preflight.roles[0].userId, foreign.manifest.preflight.listingId]);
        await assert.rejects(runFixtureAdapter(bind(f)), /fixture_adapter_dependencies_present/u);
        await client.query('UPDATE listings SET moderated_by=NULL WHERE id=$1', [foreign.manifest.preflight.listingId]);
        await client.query('UPDATE listing_availability_blocks SET created_by=$1 WHERE listing_id=$2',
          [f.manifest.preflight.roles[1].userId, foreign.manifest.preflight.listingId]);
        await assert.rejects(runFixtureAdapter(bind(f)), /fixture_adapter_dependencies_present/u);
        assert.equal((await events(f)).length, 0);
        await assert.rejects(client.query('INSERT INTO uploads (owner_id,storage_name,mime_type,byte_size) VALUES ($1,$2,$3,5)',
          [randomUUID(), `${randomUUID()}.jpg`, 'image/jpeg']), { code: '23503' });
      });

      await t.test('foreign edit blocks cleanup without overwriting it', async () => {
        const f = await seed(client); const activated = await runFixtureAdapter(bind(f));
        await client.query('UPDATE listings SET title=$1,catalog_revision=catalog_revision+1 WHERE id=$2',
          ['Independent edit retained', f.manifest.preflight.listingId]);
        const changed = await readFixtureSnapshot(client, f.manifest.preflight);
        await assert.rejects(runFixtureAdapter(bind(await cleanupManifest(f, activated.activationDigest))), /fixture_adapter_cleanup_foreign_change/u);
        assert.deepEqual(await readFixtureSnapshot(client, f.manifest.preflight), changed);
        assert.equal((await events(f)).length, 1);
      });

      await t.test('dependency appearing after activation leaves committed hidden/revoked checkpoint', async () => {
        const f = await seed(client); const foreign = await seed(client);
        const activated = await runFixtureAdapter(bind(f)); await sessions(f);
        await client.query('UPDATE listings SET moderated_by=$1 WHERE id=$2',
          [f.manifest.preflight.roles[0].userId, foreign.manifest.preflight.listingId]);
        await assert.rejects(runFixtureAdapter(bind(await cleanupManifest(f, activated.activationDigest))), /fixture_adapter_dependencies_present/u);
        const hidden = await readFixtureSnapshot(client, f.manifest.preflight);
        assert.equal(hidden.listing[0].is_active, false); assert.equal(hidden.listing[0].status, 'paused');
        assert.ok(hidden.sessions.every((s) => s.revoked_at));
        assert.deepEqual((await events(f)).map((e) => e.action), ['staging_web_fixture.activated', 'staging_web_fixture.hidden']);
        assert.equal(Number((await client.query('SELECT count(*) FROM refresh_tokens WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL',
          [f.manifest.preflight.roles.map((r) => r.userId)])).rows[0].count), 0);
      });

      await t.test('two real clients contend on the same session advisory lock, then recover', async () => {
        const f = await seed(client); const key = `sit-web-fixture:${f.manifest.preflight.listingId}`;
        const before = await readFixtureSnapshot(client, f.manifest.preflight);
        await other.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key]);
        try { await assert.rejects(runFixtureAdapter(bind(f)), /fixture_adapter_concurrent_run/u); }
        finally { assert.equal((await other.query('SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked', [key])).rows[0].unlocked, true); }
        assert.deepEqual(await readFixtureSnapshot(client, f.manifest.preflight), before);
        assert.equal((await runFixtureAdapter(bind(f, false))).status, 'preflight-passed-no-mutation');
        assert.equal((await events(f)).length, 0);
      });

      await t.test('real statement failure rolls back listing and audit, and releases advisory lock', async () => {
        const f = await seed(client); const before = await readFixtureSnapshot(client, f.manifest.preflight);
        // SQL executes on PG, including its failed-transaction state; no mocked rows.
        const injectingClient = { async query(sql, params) {
          if (sql.startsWith('INSERT INTO audit_log')) await client.query('SELECT 1/0');
          return client.query(sql, params);
        } };
        await assert.rejects(runFixtureAdapter(bind({ ...f, client: injectingClient })), { code: '22012' });
        assert.deepEqual(await readFixtureSnapshot(client, f.manifest.preflight), before);
        assert.equal((await events(f)).length, 0);
        assert.equal((await runFixtureAdapter(bind({ ...f, client: other }, false))).status, 'preflight-passed-no-mutation');
      });
    } finally {
      // Never DELETE append-only history. The owning runner stops/removes the
      // complete ephemeral cluster, on success AND on any failed child test.
      client?.release(); other?.release(); await pool.end();
    }
  });
