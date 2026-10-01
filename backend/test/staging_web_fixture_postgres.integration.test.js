import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { runMigrations } from '../src/migrations.js';
import { adapterSources, runFixtureAdapter } from '../ops/staging_web_fixture_adapter.mjs';
import { generateFixtureDraft } from '../ops/staging_web_fixture_draft.mjs';
import { programmaticPlaceholder } from './fixtures/programmatic_placeholder.mjs';
import { bootstrapFileStore, buildFixtureBootstrapManifest, dedicatedFixture, runFixtureBootstrap,
  fixtureBootstrapHandoff } from '../ops/staging_web_fixture_bootstrap.mjs';
import { createFixtureLoginProofStore, loginProofMarker } from '../ops/staging_web_fixture_login_verifier.mjs';
import { assertCatalogActivationState,
  requiredLoginProofMarkerSha256,
  catalogActivationStateSql } from '../ops/staging_web_fixture_catalog_activation.mjs';
import { assertFixtureSeedReadback,
  fixtureSeedReadbackSql } from '../ops/staging_web_fixture_env_transition.mjs';
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
    sourceCommit: source.commit, sourceHashes: source.hashes, schemaCount: 102, ledgerDigest: source.ledgerDigest,
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
      assert.equal(ledger.length, 102);
      assert.deepEqual((await client.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows, ledger);

      await t.test('dedicated seed/login proof use real credential attest, scoped reconcile, rollback and cleanup', async () => {
        const old = await seed(client);
        await client.query('UPDATE users SET email=$1 WHERE id=$2', ['untouched@example.com', old.manifest.preflight.roles[0].userId]);
        const oldBefore = await readFixtureSnapshot(client, old.manifest.preflight);
        const directory = realpathSync(mkdtempSync(join(tmpdir(), 'sit-seed-pg-')));
        try {
          const media = await programmaticPlaceholder();
          const passwords = ['OwnerSyntheticTestOnlyPassword-123456789', 'RenterSyntheticTestOnlyPassword-987654321'];
          const manifest = buildFixtureBootstrapManifest({ source, environment: old.environment, photo: media.photo, passwords,
            runId: 'web-fixture-dedicated-pg-test' });
          const files = bootstrapFileStore(directory, manifest);
          const input = { manifest, source, environment: old.environment, passwords, photoBytes: media.bytes,
            client, files, rehearsal: isolatedFixtureRehearsal };
          const execute = { execute: true, confirmSource: source.commit, confirmRun: manifest.preflight.runId };
          const count = async () => Number((await client.query('SELECT count(*) FROM users WHERE id=ANY($1::text[])',
            [[dedicatedFixture.owner, dedicatedFixture.renter]])).rows[0].count);
          assert.equal((await runFixtureBootstrap(input)).status, 'preflight-passed-no-mutation');
          assert.equal(await count(), 0); assert.equal(files.inspect(), 'absent');
          await other.query('SELECT pg_advisory_lock(hashtextextended($1,0))', ['sit-dedicated-web-fixture-bootstrap-v1']);
          try { await assert.rejects(runFixtureBootstrap(input), /concurrent/u); }
          finally { await other.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', ['sit-dedicated-web-fixture-bootstrap-v1']); }
          for (const [id, email] of [[dedicatedFixture.owner, 'foreign-contact@example.com'],
            ['collision-test-only', `${dedicatedFixture.owner}@example.invalid`]]) {
            await client.query('INSERT INTO users (id,email) VALUES ($1,$2)', [id, email]);
            const before = (await client.query('SELECT * FROM users WHERE id=$1', [id])).rows;
            await assert.rejects(runFixtureBootstrap({ ...input, ...execute }), /existing_not_exact|collision/u);
            assert.deepEqual((await client.query('SELECT * FROM users WHERE id=$1', [id])).rows, before);
            assert.equal(files.inspect(), 'absent');
            await client.query('DELETE FROM users WHERE id=$1', [id]); // Own isolated collision fixture only.
          }
          for (const match of ['INSERT INTO users', 'INSERT INTO listings', 'INSERT INTO uploads', 'INSERT INTO audit_log']) {
            const faultClient = { query: (sql, params) => { if (sql.includes(match)) throw Error('injected'); return client.query(sql, params); } };
            await assert.rejects(runFixtureBootstrap({ ...input, ...execute, client: faultClient }), /injected/u);
            assert.equal(await count(), 0); assert.equal(files.inspect(), 'absent');
          }
          let lost = false;
          const unknownClient = { query: async (sql, params) => {
            const result = await client.query(sql, params); if (sql === 'COMMIT' && !lost) { lost = true; throw Error('lost-response'); } return result;
          } };
          await assert.rejects(runFixtureBootstrap({ ...input, ...execute, client: unknownClient }), /commit_unknown_file_retained/u);
          assert.equal(await count(), 2); assert.equal(files.inspect(), 'owned');
          assert.equal((await runFixtureBootstrap({ ...input, ...execute })).status, 'dedicated-seed-already-prepared-runtime-blocked');

          const proofMarker = loginProofMarker(manifest.preflight.runId, sha(randomUUID()).slice(0, 32));
          const proofStore = createFixtureLoginProofStore(client, { runId: manifest.preflight.runId, marker: proofMarker });
          const proofCredentials = { accounts: [dedicatedFixture.owner, dedicatedFixture.renter].map((id, index) => ({
            id, email: `${id}@example.invalid`, password: passwords[index],
          })) };
          const principalsBefore = (await client.query(`SELECT id,email,password_hash,role,account_status,
            deactivated_at,profile,failed_login_attempts,login_locked_until FROM users
            WHERE id=ANY($1::text[]) ORDER BY id`, [[dedicatedFixture.owner, dedicatedFixture.renter]])).rows;
          assert.deepEqual(await proofStore.attest(manifest), { schemaCount: 102, ledgerDigest: source.ledgerDigest });
          assert.deepEqual(await proofStore.attestCredentials(proofCredentials), { credentialsAttested: 2 });
          assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'off');
          assert.deepEqual((await client.query(`SELECT id,email,password_hash,role,account_status,
            deactivated_at,profile,failed_login_attempts,login_locked_until FROM users
            WHERE id=ANY($1::text[]) ORDER BY id`, [[dedicatedFixture.owner, dedicatedFixture.renter]])).rows,
          principalsBefore);
          const proofBefore = await proofStore.snapshot({ readOnly: true });
          assert.equal(proofBefore.users, 2); assert.equal(proofBefore.seedAudits, 1);
          assert.equal(proofBefore.activeSessions, 0); assert.equal(proofBefore.activeRefreshTokens, 0);

          const ownedSessionIds = [randomUUID(), randomUUID()];
          for (let index = 0; index < ownedSessionIds.length; index++) {
            await client.query(`INSERT INTO auth_sessions (id,user_id,device_label,user_agent)
              VALUES ($1,$2,'Bounded login proof integration',$3)`,
            [ownedSessionIds[index], proofCredentials.accounts[index].id, proofMarker]);
            await client.query(`INSERT INTO refresh_tokens
              (user_id,session_id,family_id,token_hash,expires_at,user_agent)
              VALUES ($1,$2,$2,$3,now()+interval '1 hour',$4)`,
            [proofCredentials.accounts[index].id, ownedSessionIds[index], sha(randomUUID()), proofMarker]);
          }
          assert.deepEqual(await proofStore.reconcile(), { matchedSessions: 2 });
          const ownedReadback = (await client.query(`SELECT session.id,session.revoked_reason,
            token.revoked_reason AS refresh_reason FROM auth_sessions AS session
            JOIN refresh_tokens AS token ON token.session_id=session.id
            WHERE session.id=ANY($1::uuid[]) ORDER BY session.id`, [ownedSessionIds])).rows;
          assert.equal(ownedReadback.length, 2);
          assert.ok(ownedReadback.every((row) => row.revoked_reason === 'staging_fixture_login_proof'
            && row.refresh_reason === 'staging_fixture_login_proof'));
          const proofAfter = await proofStore.snapshot({ readOnly: true });
          assert.equal(proofAfter.markerSessions, 2); assert.equal(proofAfter.markerRefreshTokens, 2);
          assert.equal(proofAfter.markerActiveSessions, 0); assert.equal(proofAfter.markerActiveRefreshTokens, 0);
          assert.equal(proofAfter.identityDigest, proofBefore.identityDigest);
          assert.equal(proofAfter.catalogDigest, proofBefore.catalogDigest);
          assert.equal(proofAfter.totalSessions, 2); assert.equal(proofAfter.totalRefreshTokens, 2);
          assert.equal(proofAfter.historyDigest, proofBefore.historyDigest);

          // A new marker sees the retained first run as immutable history.
          const repeatMarker = loginProofMarker(manifest.preflight.runId, sha(randomUUID()).slice(0, 32));
          const repeatStore = createFixtureLoginProofStore(client, { runId: manifest.preflight.runId, marker: repeatMarker });
          const repeatBefore = await repeatStore.snapshot({ readOnly: true });
          assert.equal(repeatBefore.markerSessions, 0); assert.equal(repeatBefore.markerRefreshTokens, 0);
          assert.equal(repeatBefore.totalSessions, 2); assert.equal(repeatBefore.totalRefreshTokens, 2);
          assert.notEqual(repeatBefore.historyDigest, proofBefore.historyDigest);
          const repeatSessionIds = [randomUUID(), randomUUID()];
          for (let index = 0; index < repeatSessionIds.length; index++) {
            await client.query(`INSERT INTO auth_sessions (id,user_id,device_label,user_agent)
              VALUES ($1,$2,'Repeated login proof integration',$3)`,
            [repeatSessionIds[index], proofCredentials.accounts[index].id, repeatMarker]);
            await client.query(`INSERT INTO refresh_tokens
              (user_id,session_id,family_id,token_hash,expires_at,user_agent)
              VALUES ($1,$2,$2,$3,now()+interval '1 hour',$4)`,
            [proofCredentials.accounts[index].id, repeatSessionIds[index], sha(randomUUID()), repeatMarker]);
          }
          assert.deepEqual(await repeatStore.reconcile(), { matchedSessions: 2 });
          const repeatAfter = await repeatStore.snapshot({ readOnly: true });
          assert.equal(repeatAfter.totalSessions, 4); assert.equal(repeatAfter.totalRefreshTokens, 4);
          assert.equal(repeatAfter.markerSessions, 2); assert.equal(repeatAfter.markerRefreshTokens, 2);
          assert.equal(repeatAfter.activeSessions, 0); assert.equal(repeatAfter.activeRefreshTokens, 0);
          assert.equal(repeatAfter.historyDigest, repeatBefore.historyDigest);
          assert.equal(repeatAfter.identityDigest, repeatBefore.identityDigest);
          assert.equal(repeatAfter.catalogDigest, repeatBefore.catalogDigest);
          // Existing test teardown removes only sessions created by this isolated test.
          ownedSessionIds.push(...repeatSessionIds);

          const ambiguousMarker = loginProofMarker(manifest.preflight.runId, sha(randomUUID()).slice(0, 32));
          const foreignUserId = `fixture-login-proof-foreign-${randomUUID()}`;
          const scopedSessionId = randomUUID(); const foreignSessionId = randomUUID();
          await client.query(`INSERT INTO users (id,email,profile,role,account_status)
            VALUES ($1,$2,'{}'::jsonb,'user','active')`, [foreignUserId, `${foreignUserId}@example.invalid`]);
          for (const [sessionId, userId] of [[scopedSessionId, dedicatedFixture.owner], [foreignSessionId, foreignUserId]]) {
            await client.query(`INSERT INTO auth_sessions (id,user_id,device_label,user_agent)
              VALUES ($1,$2,'Foreign retention integration',$3)`, [sessionId, userId, ambiguousMarker]);
            await client.query(`INSERT INTO refresh_tokens
              (user_id,session_id,family_id,token_hash,expires_at,user_agent)
              VALUES ($1,$2,$2,$3,now()+interval '1 hour',$4)`,
            [userId, sessionId, sha(randomUUID()), ambiguousMarker]);
          }
          const ambiguousStore = createFixtureLoginProofStore(client,
            { runId: manifest.preflight.runId, marker: ambiguousMarker });
          await assert.rejects(ambiguousStore.reconcile(), /marker_ambiguous/u);
          const ambiguityReadback = (await client.query(`SELECT session.id,session.revoked_at,
            token.revoked_at AS refresh_revoked_at FROM auth_sessions AS session
            JOIN refresh_tokens AS token ON token.session_id=session.id
            WHERE session.id=ANY($1::uuid[]) ORDER BY session.id`, [[scopedSessionId, foreignSessionId]])).rows;
          assert.ok(ambiguityReadback.find((row) => row.id === scopedSessionId).revoked_at);
          assert.ok(ambiguityReadback.find((row) => row.id === scopedSessionId).refresh_revoked_at);
          assert.equal(ambiguityReadback.find((row) => row.id === foreignSessionId).revoked_at, null);
          assert.equal(ambiguityReadback.find((row) => row.id === foreignSessionId).refresh_revoked_at, null);
          await client.query('DELETE FROM auth_sessions WHERE id=ANY($1::uuid[])',
            [[...ownedSessionIds, scopedSessionId, foreignSessionId]]);
          await client.query('DELETE FROM users WHERE id=$1', [foreignUserId]);

          const handoff = fixtureBootstrapHandoff(manifest, old.environment);
          const projected = { ...old.environment, ...handoff.proposed };
          const draft = await generateFixtureDraft({ source, environment: projected, photo: media.photo, client,
            rehearsal: isolatedFixtureRehearsal, readPhoto: () => media.bytes });
          assert.deepEqual(draft.preflight.roles.map((r) => r.userId), [dedicatedFixture.owner, dedicatedFixture.renter]);
          const cleanup = { ...input, ...execute, manifest: { ...manifest, operation: 'cleanup' } };
          if (process.env.SIT_FIXTURE_BOOTSTRAP_REHEARSAL_CASE === 'used') {
            const dedicated = { client, manifest: { preflight: manifest.preflight } }; await sessions(dedicated);
            await assert.rejects(runFixtureBootstrap(cleanup), /used_seed_retained_hidden/u);
            const hidden = await readFixtureSnapshot(client, manifest.preflight);
            assert.equal(hidden.listing[0].is_active, false); assert.ok(hidden.sessions.every((s) => s.revoked_at));
            assert.equal(Number((await client.query('SELECT count(*) FROM users WHERE id=ANY($1::text[]) AND password_hash IS NOT NULL',
              [[dedicatedFixture.owner, dedicatedFixture.renter]])).rows[0].count), 0);
            assert.equal(Number((await client.query('SELECT count(*) FROM refresh_tokens WHERE user_id=ANY($1::text[]) AND revoked_at IS NULL',
              [[dedicatedFixture.owner, dedicatedFixture.renter]])).rows[0].count), 0);
            await assert.rejects(runFixtureBootstrap(cleanup), /used_seed_retained_hidden/u);
          } else {
            assert.equal((await runFixtureBootstrap(cleanup)).status, 'dedicated-seed-cleaned');
            assert.equal((await runFixtureBootstrap(cleanup)).status, 'dedicated-seed-cleaned');
            assert.equal(await count(), 0); assert.equal(files.inspect(), 'absent');
          }
          assert.deepEqual(await readFixtureSnapshot(client, old.manifest.preflight), oldBefore);
          assert.equal(Number((await client.query("SELECT count(*) FROM audit_log WHERE resource_type='staging_web_fixture_seed'")).rows[0].count),
            process.env.SIT_FIXTURE_BOOTSTRAP_REHEARSAL_CASE === 'used' ? 2 : 3);
        } finally { rmSync(directory, { recursive: true, force: true }); }
      });

      await t.test('fresh draft selects ordered pair from four eligible accounts, leaving extras outside scope', async () => {
        const f = await seed(client); const extra = await seed(client);
        const extraIds = extra.manifest.preflight.roles.map((r) => r.userId);
        f.environment.SIT_STAGING_ALLOWED_USER_IDS += `,${extraIds.join(',')}`;
        const before = await readFixtureSnapshot(client, f.manifest.preflight);
        const extraBefore = await readFixtureSnapshot(client, extra.manifest.preflight);
        const queries = []; const observed = { query: async (sql, params = []) => {
          queries.push({ sql, params }); return client.query(sql, params);
        } };
        const draft = () => generateFixtureDraft({ source, environment: f.environment,
          photo: f.manifest.preflight.photo, client: observed, rehearsal: isolatedFixtureRehearsal,
          readPhoto: () => photoBytes }); // Real default adapter preflight, no SQL mock.
        const result = await draft();
        assert.deepEqual(result.preflight.roles, f.manifest.preflight.roles);
        assert.equal(result.preflight.snapshotDigest, fixtureDigest(before));
        assert.equal(result.preflight.environmentDigest, fixtureEnvironmentDigest(f.environment));
        assert.equal(result.ledgerDigest, source.ledgerDigest);
        const discovery = queries.findIndex(({ sql }) => sql.startsWith('SELECT id, email,'));
        for (const id of extraIds) assert.ok(!JSON.stringify(queries.slice(discovery + 1).map((q) => q.params)).includes(id));
        assert.deepEqual(await readFixtureSnapshot(client, result.preflight), before);
        assert.deepEqual(await readFixtureSnapshot(client, extra.manifest.preflight), extraBefore);
        assert.equal((await events(extra)).length, 0);
        assert.equal((await events(f)).length, 0);
        assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'off');
        // A dependency of the selected renter fails; other eligible accounts
        // are never tried to make this draft pass.
        await client.query('UPDATE listings SET moderated_by=$1 WHERE id=$2',
          [f.manifest.preflight.roles[1].userId, extra.manifest.preflight.listingId]);
        await assert.rejects(draft(), /fixture_adapter_dependencies_present/u);
        assert.deepEqual(await readFixtureSnapshot(client, f.manifest.preflight), before);
        assert.equal((await events(f)).length, 0);
        assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only, 'off');
      });

      await t.test('real WebP placeholder draft/activation/cleanup bind media without runtime activation', async () => {
        const f = await seed(client); const media = await programmaticPlaceholder(); const m = f.manifest.preflight;
        const uploadName = m.uploadName.replace(/\.jpg$/u, '.webp');
        await client.query('UPDATE uploads SET storage_name=$1,mime_type=$2,byte_size=$3,content_sha256=$4 WHERE storage_name=$5',
          [uploadName, 'image/webp', media.bytes.length, media.photo.sha256, m.uploadName]);
        m.uploadName = uploadName; f.environment.SIT_STAGING_PUBLIC_UPLOAD_NAMES = uploadName;
        m.environmentDigest = fixtureEnvironmentDigest(f.environment); m.photo = { ...media.photo, file: '/run/sit-fixture-input/photo.webp' };
        f.photoBytes = media.bytes; f.storedPhotoBytes = media.bytes;
        const before = await readFixtureSnapshot(client, m); m.snapshotDigest = fixtureDigest(before);
        const draft = await generateFixtureDraft({ source, environment: f.environment, photo: media.photo,
          client, rehearsal: isolatedFixtureRehearsal, readPhoto: () => media.bytes });
        assert.equal(draft.preflight.photo.file, '/run/sit-fixture-input/photo.webp');
        assert.deepEqual(await readFixtureSnapshot(client, m), before); assert.equal((await events(f)).length, 0);
        await client.query('UPDATE uploads SET byte_size=byte_size+1 WHERE storage_name=$1', [uploadName]);
        await assert.rejects(runFixtureAdapter(bind(f, false)), /media_row_drift/u);
        await client.query('UPDATE uploads SET byte_size=byte_size-1 WHERE storage_name=$1', [uploadName]);
        const rebound = await readFixtureSnapshot(client, m); m.snapshotDigest = fixtureDigest(rebound);
        const activated = await runFixtureAdapter(bind(f)); assert.equal(activated.runtimeActivated, false);
        const cleaned = await runFixtureAdapter(bind(await cleanupManifest(f, activated.activationDigest)));
        assert.equal(cleaned.status, 'cleaned-noncatalogued-audits-retained'); assert.equal(cleaned.runtimeActivated, false);
        const after = await readFixtureSnapshot(client, m);
        assert.deepEqual(after.upload, rebound.upload);
        assert.equal(after.upload[0].content_sha256, media.photo.sha256); assert.equal(after.listing[0].is_active, false);
        assert.equal((await events(f)).length, 3);
      });

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

      await t.test('catalog activation attestation SQL runs on PG16/current schema and ignores foreign rows', async () => {
        const f = await seed(client); const activated = await runFixtureAdapter(bind(f));
        assert.equal(activated.status, 'database-prepared-runtime-still-blocked');
        const bootstrapRunId = `web-fixture-${randomUUID()}`;
        const seedScopeDigest = sha('catalog-activation-pg-seed-scope');
        const seedSnapshotDigest = sha('catalog-activation-pg-seed-snapshot');
        await client.query(`INSERT INTO audit_log
          (actor_role,action,resource_type,resource_id,request_id,metadata)
          VALUES ('system','staging_web_fixture_seed.seeded','staging_web_fixture_seed',$1,$2,$3::jsonb)`,
        [f.manifest.preflight.listingId, bootstrapRunId,
          JSON.stringify({ scope: seedScopeDigest, snapshotHash: seedSnapshotDigest })]);
        for (let priorProof = 0; priorProof < 2; priorProof++) {
          for (const role of f.manifest.preflight.roles) {
            const sessionId = randomUUID();
            await client.query(`INSERT INTO auth_sessions (id,user_id,device_label,user_agent,revoked_at)
              VALUES ($1,$2,$3,'Catalog-Attestation-Integration',now())`,
            [sessionId, role.userId, `Catalog attestation integration ${priorProof}`]);
            await client.query(`INSERT INTO refresh_tokens
              (user_id,session_id,family_id,token_hash,expires_at,user_agent,revoked_at)
              VALUES ($1,$2,$2,$3,now()+interval '1 hour','Catalog-Attestation-Integration',now())`,
            [role.userId, sessionId, sha(randomUUID())]);
            await client.query(`INSERT INTO audit_log
              (actor_id,actor_role,action,resource_type,resource_id,request_id)
              VALUES ($1,'user','auth.login','auth_session',$2,$3)`,
            [role.userId, sessionId, `catalog-attestation-${sessionId}`]);
          }
        }
        const m = f.manifest.preflight;
        const repeatMarker = loginProofMarker(bootstrapRunId, sha(randomUUID()).slice(0, 32));
        // Substitute only fixture IDs at the parameter boundary; run the real SQL.
        const substitutions = new Map([[dedicatedFixture.owner, m.roles[0].userId],
          [dedicatedFixture.renter, m.roles[1].userId], [dedicatedFixture.listing, m.listingId],
          [dedicatedFixture.upload, m.uploadName]]);
        const substitute = (value) => Array.isArray(value) ? value.map(substitute) : substitutions.get(value) ?? value;
        const historyStore = createFixtureLoginProofStore({ query: (query, params) =>
          client.query(query, params?.map(substitute)) }, { runId: bootstrapRunId, marker: repeatMarker });
        const historyBefore = await historyStore.snapshot({ readOnly: true });
        assert.deepEqual([historyBefore.totalSessions, historyBefore.totalRefreshTokens,
          historyBefore.totalLoginAudits, historyBefore.markerLoginAudits], [4, 4, 4, 0]);
        const sql = catalogActivationStateSql
          .replaceAll(requiredLoginProofMarkerSha256, sha(repeatMarker))
          .replaceAll(dedicatedFixture.owner, m.roles[0].userId)
          .replaceAll(dedicatedFixture.renter, m.roles[1].userId)
          .replaceAll(dedicatedFixture.listing, m.listingId)
          .replaceAll(dedicatedFixture.upload, m.uploadName);
        const readState = async () => (await client.query(sql)).rows[0]?.json_build_object;
        const proofBinding = { activationRunDigest: sha(m.runId), loginHistoryDigest: historyBefore.historyDigest,
          loginRetainedSessions: 6, loginRetainedRefresh: 6, loginTotalAudits: 6 };
        const counts = (value) => [value.retainedSessions, value.retainedRefresh, value.loginAudits,
          value.markerSessions, value.markerRefresh, value.markerLoginAudits];
        const markerSessions = [];
        for (const role of m.roles) {
          const sessionId = randomUUID();
          markerSessions.push({ userId: role.userId, sessionId });
          await client.query(`INSERT INTO auth_sessions (id,user_id,user_agent,revoked_at)
            VALUES ($1,$2,$3,now())`, [sessionId, role.userId, repeatMarker]);
          await client.query(`INSERT INTO refresh_tokens
            (user_id,session_id,family_id,token_hash,expires_at,user_agent,revoked_at)
            VALUES ($1,$2,$2,$3,now()+interval '1 hour',$4,now())`,
          [role.userId, sessionId, sha(randomUUID()), repeatMarker]);
        }
        const insertMarkerAudits = async (reassignRenter = false) => {
          for (const { userId, sessionId } of markerSessions) {
            const actorId = reassignRenter && userId === m.roles[1].userId ? m.roles[0].userId : userId;
            await client.query(`INSERT INTO audit_log (actor_id,actor_role,action,resource_type,resource_id)
              VALUES ($1,'user','auth.login','auth_session',$2)`, [actorId, sessionId]);
          }
        };
        // Audits are append-only: replay the same session events with the wrong
        // renter actor after a savepoint rollback, never disable audit triggers.
        await client.query('BEGIN');
        try {
          await client.query('SAVEPOINT marker_audit_assignment');
          await insertMarkerAudits();
          const correct = await readState();
          assertCatalogActivationState(JSON.stringify(correct), proofBinding);
          await client.query('ROLLBACK TO SAVEPOINT marker_audit_assignment');
          await insertMarkerAudits(true);
          const reassigned = await readState();
          assert.deepEqual(counts(reassigned), counts(correct));
          assert.deepEqual(counts(reassigned), [6, 6, 6, 2, 2, 2]);
          assert.equal(reassigned.historyDigest, correct.historyDigest);
          assert.equal(reassigned.markerPrincipals, 2);
          assert.equal(reassigned.markerAuditPrincipals, 1);
          assert.throws(() => assertCatalogActivationState(JSON.stringify(reassigned), proofBinding),
            /catalog_activation_database_state_invalid/u);
        } finally { await client.query('ROLLBACK'); }
        await insertMarkerAudits();
        const historyAfter = await historyStore.snapshot({ readOnly: true });
        assert.deepEqual([historyAfter.totalSessions, historyAfter.totalRefreshTokens,
          historyAfter.totalLoginAudits, historyAfter.markerLoginAudits], [6, 6, 6, 2]);
        assert.equal(historyAfter.historyDigest, historyBefore.historyDigest);
        assert.equal(historyAfter.identityDigest, historyBefore.identityDigest);
        assert.equal(historyAfter.catalogDigest, historyBefore.catalogDigest);
        assert.equal(historyAfter.activeSessions, 0); assert.equal(historyAfter.activeRefreshTokens, 0);
        const seedSql = fixtureSeedReadbackSql
          .replaceAll(dedicatedFixture.owner, m.roles[0].userId)
          .replaceAll(dedicatedFixture.renter, m.roles[1].userId)
          .replaceAll(dedicatedFixture.listing, m.listingId)
          .replaceAll(dedicatedFixture.upload, m.uploadName);
        const seedReadback = (await client.query(seedSql)).rows[0];
        assertFixtureSeedReadback(Object.values(seedReadback).join('|'), {
          seedScopeDigest, seedSnapshotDigest, bootstrapRunIdSha256: sha(bootstrapRunId),
        });
        const forbiddenRunHashInterpolation = `:${String.fromCharCode(39)}run_hash${String.fromCharCode(39)}`;
        assert.ok(!sql.includes(forbiddenRunHashInterpolation));
        const row = await readState();
        const attested = assertCatalogActivationState(JSON.stringify(row), proofBinding);
        assert.equal(attested.activationRunDigest, sha(m.runId));
        assert.notEqual(attested.activationRunDigest, sha(bootstrapRunId));
        assert.equal(attested.activeSessions, 0); assert.equal(attested.activeRefresh, 0);
        assert.equal(attested.mfaFactors, 0);
        assert.equal(attested.retainedSessions, 6); assert.equal(attested.retainedRefresh, 6);
        assert.equal(attested.historyDigest, historyAfter.historyDigest);
        assert.equal(attested.markerSessions, 2); assert.equal(attested.markerRefresh, 2);
        assert.equal(attested.markerLoginAudits, 2); assert.equal(attested.markerPrincipals, 2);
        assert.equal(attested.markerRefreshPrincipals, 2); assert.equal(attested.markerAuditPrincipals, 2);
        await client.query(`INSERT INTO mfa_totp_factors
          (user_id,encrypted_secret,status,enabled_at) VALUES ($1,'test-encrypted-secret','enabled',now())`,
        [m.roles[0].userId]);
        await assert.rejects(async () => assertCatalogActivationState(JSON.stringify(
          await readState()), proofBinding),
        /catalog_activation_database_state_invalid/u);
        await client.query('DELETE FROM mfa_totp_factors WHERE user_id=$1', [m.roles[0].userId]);
        const foreign = await seed(client);
        const foreignActivated = await runFixtureAdapter(bind(foreign));
        assert.equal(foreignActivated.status, 'database-prepared-runtime-still-blocked');
        await client.query(`INSERT INTO mfa_totp_factors
          (user_id,encrypted_secret,status,enabled_at) VALUES ($1,'foreign-encrypted-secret','enabled',now())`,
        [foreign.manifest.preflight.roles[0].userId]);
        const afterForeign = assertCatalogActivationState(JSON.stringify(await readState()), {
          ...proofBinding,
        });
        assert.deepEqual(afterForeign, attested);
        assert.equal((await readFixtureSnapshot(client, foreign.manifest.preflight)).users.length, 2);
        const expectRejectedState = async (mutate) => {
          await client.query('BEGIN');
          try {
            await mutate();
            await assert.rejects(async () => assertCatalogActivationState(JSON.stringify(await readState()), proofBinding),
              /catalog_activation_database_state_invalid/u);
          } finally { await client.query('ROLLBACK'); }
        };
        await expectRejectedState(() => client.query(`UPDATE listings
          SET payload=jsonb_set(payload,'{syntheticFixtureRun}',to_jsonb($1::text),true) WHERE id=$2`,
        [`web-fixture-${randomUUID()}`, m.listingId]));
        await expectRejectedState(() => client.query(`INSERT INTO audit_log
          (actor_role,action,resource_type,resource_id,request_id,metadata)
          VALUES ('system','staging_web_fixture.activated','staging_web_fixture',$1,$2,'{}'::jsonb)`,
        [m.listingId, `web-fixture-${randomUUID()}`]));
        await expectRejectedState(() => client.query(`UPDATE listings
          SET payload=jsonb_set(payload,'{syntheticFixtureRun}',to_jsonb('invalid'::text),true) WHERE id=$1`,
        [m.listingId]));
        await expectRejectedState(() => client.query(`UPDATE auth_sessions SET device_label='Changed prior proof'
          WHERE user_id=$1 AND user_agent='Catalog-Attestation-Integration'`, [m.roles[0].userId]));
        await expectRejectedState(() => client.query(`UPDATE auth_sessions SET user_agent='Changed current marker'
          WHERE user_id=$1 AND user_agent=$2`, [m.roles[0].userId, repeatMarker]));
        await expectRejectedState(() => client.query(`UPDATE auth_sessions SET revoked_at=NULL
          WHERE user_id=$1 AND user_agent=$2`, [m.roles[0].userId, repeatMarker]));
        await client.query('BEGIN');
        try {
          const changed = await client.query(`UPDATE refresh_tokens SET user_id=$1
            WHERE user_id=$2 AND user_agent=$3`, [m.roles[0].userId, m.roles[1].userId, repeatMarker]);
          assert.equal(changed.rowCount, 1);
          const reassigned = await readState();
          assert.deepEqual(counts(reassigned), counts(attested));
          assert.deepEqual(counts(reassigned), [6, 6, 6, 2, 2, 2]);
          assert.equal(reassigned.historyDigest, attested.historyDigest);
          assert.equal(reassigned.markerPrincipals, 2);
          assert.equal(reassigned.markerRefreshPrincipals, 1);
          assert.throws(() => assertCatalogActivationState(JSON.stringify(reassigned), proofBinding),
            /catalog_activation_database_state_invalid/u);
        } finally { await client.query('ROLLBACK'); }
        const cleaned = await runFixtureAdapter(bind(await cleanupManifest(f, activated.activationDigest)));
        assert.equal(cleaned.status, 'cleaned-noncatalogued-audits-retained');
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
