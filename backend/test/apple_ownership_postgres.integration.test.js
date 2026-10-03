import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  test('Apple ownership W4-D requires isolated PostgreSQL16', { skip: true }, () => {});
} else {
  test('Apple W4-D durable ledger, recovery, delivery, privacy and cleanup', async (t) => {
    Object.assign(process.env, {
      DATABASE_URL: databaseUrl,
      JWT_SECRET: `apple-w4d-${crypto.randomBytes(40).toString('hex')}`,
      DEPLOYMENT_ENVIRONMENT: 'test',
      PAYMENT_TRANSPORT: 'memory', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      IDENTITY_VERIFICATION_TRANSPORT: 'memory', FIREBASE_AUTH_ENABLED: 'false',
      MFA_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64url'),
    });
    const database = new pg.Pool({ connectionString: databaseUrl });
    assert.equal(Math.floor(Number((await database.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 16);
    await database.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
    const { runMigrations } = await import('../src/migrations.js');
    await runMigrations(database);
    const {
      acquireAppleOwnership,
      completeAppleMfaDelivery,
      deliverAppleOwnershipSession,
      drainAppleOwnershipCleanup,
      appleOwnershipInternals,
      prepareAppleOwnershipAccountDeletion,
      readAppleOwnershipStatus,
    } = await import('../src/apple_ownership.js');
    const { readAppleOwnershipConfiguration } = await import('../src/apple_ownership_config.js');
    const { buildAccountExport } = await import('../src/privacy_export.js');
    const { inspectRetentionInventory } = await import('../src/retention_inventory.js');
    const namespace = `apple-w4d-${crypto.randomUUID()}`;
    const userId = `${namespace}-owner`;
    const subject = `${namespace}-subject`;
    const firebaseUserId = `${namespace}-firebase`;
    const routeUserId = `${namespace}-route-owner`;
    const routeSubject = `${namespace}-route-subject`;
    const routeFirebaseUserId = `${namespace}-route-firebase`;
    const foreignUserId = `${namespace}-foreign-owner`;
    const foreignSubject = `${namespace}-foreign-subject`;
    const foreignFirebaseUserId = `${namespace}-foreign-firebase`;
    const configuration = readAppleOwnershipConfiguration({
      APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
      APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v1',
      APPLE_OWNERSHIP_WEB_TEST_USER_IDS: [userId, routeUserId, foreignUserId].join(','),
    }, {
      appleRevocation: {
        enabled: true,
        encryptionKey: Buffer.alloc(32, 8),
        clientId: 'com.shareittoo.synthetic',
        redirectUri: 'https://example.invalid/apple/callback',
      },
      firebaseProjectId: 'shareittoo-synthetic',
      coordinationKey: Buffer.alloc(32, 7),
    });
    const nowSeconds = () => Math.floor(Date.now() / 1000);
    const identity = () => ({
      provider: 'apple', subject, firebaseUserId,
      firebaseProjectId: configuration.firebaseProjectId,
      tokenIssuedAt: nowSeconds() - 5,
      tokenExpiresAt: nowSeconds() + 600,
      tokenAuthTime: nowSeconds() - 5,
    });
    const request = () => crypto.randomBytes(32).toString('base64url');
    const cleanup = async () => {
      const ids = [userId, routeUserId, foreignUserId];
      await database.query('DELETE FROM apple_ownership_deliveries WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM apple_ownership_materials WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM apple_ownership_attempts WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM apple_ownership_enrollments WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM refresh_tokens WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM auth_identities WHERE user_id=ANY($1::text[])', [ids]);
      await database.query('DELETE FROM users WHERE id=ANY($1::text[])', [ids]);
    };
    try {
      await database.query(
        `INSERT INTO users (
           id,email,profile,email_verified_at,terms_accepted_at,privacy_accepted_at,
           minimum_age_confirmed_at,private_use_confirmed_at
         ) VALUES ($1,$2,'{"displayName":"Synthetic Apple"}'::jsonb,now(),now(),now(),now(),now())`,
        [userId, `${userId}@example.invalid`],
      );
      for (const [id, appleSubject, firebaseId] of [
        [routeUserId, routeSubject, routeFirebaseUserId],
        [foreignUserId, foreignSubject, foreignFirebaseUserId],
      ]) {
        await database.query(
          `INSERT INTO users (
             id,email,profile,email_verified_at,terms_accepted_at,privacy_accepted_at,
             minimum_age_confirmed_at,private_use_confirmed_at
           ) VALUES ($1,$2,'{"displayName":"Synthetic Apple Route"}'::jsonb,now(),now(),now(),now(),now())`,
          [id, `${id}@example.invalid`],
        );
        await database.query(
          `INSERT INTO auth_identities (
             user_id,provider,provider_subject,firebase_user_id,email_at_link,email_verified,last_login_at
           ) VALUES ($1,'apple',$2,$3,$4,true,now())`,
          [id, appleSubject, firebaseId, `${id}@example.invalid`],
        );
        await database.query(
          `INSERT INTO apple_ownership_enrollments (
             user_id,provider_subject,firebase_user_id,firebase_project_id,apple_client_id,
             redirect_uri,profile_generation,profile_digest,private_use_confirmed_at,
             web_test_cohort_enrolled_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
          [id, appleSubject, firebaseId, configuration.firebaseProjectId,
            configuration.appleClientId, configuration.redirectUri,
            configuration.generation, configuration.profileDigest],
        );
      }
      await database.query(
        `INSERT INTO auth_identities (
           user_id,provider,provider_subject,firebase_user_id,email_at_link,email_verified,last_login_at
         ) VALUES ($1,'apple',$2,$3,$4,true,now())`,
        [userId, subject, firebaseUserId, `${userId}@example.invalid`],
      );
      await database.query(
        `INSERT INTO apple_ownership_enrollments (
           user_id,provider_subject,firebase_user_id,firebase_project_id,apple_client_id,
           redirect_uri,profile_generation,profile_digest,private_use_confirmed_at,
           web_test_cohort_enrolled_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
        [userId, subject, firebaseUserId, configuration.firebaseProjectId,
          configuration.appleClientId, configuration.redirectUri,
          configuration.generation, configuration.profileDigest],
      );
      const issued = [];
      let exchangeCalls = 0;
      const provider = {
        async exchangeAuthorizationCode({ code, expectedSubject }) {
          exchangeCalls += 1;
          assert.equal(expectedSubject, subject);
          await new Promise((resolve) => setTimeout(resolve, 30));
          const value = `refresh-for-${code}`;
          issued.push(value);
          return value;
        },
      };
      const firstRequest = request();
      const firstCode = `synthetic-code-${crypto.randomUUID()}`;
      let firstReceipt;
      let secondReceipt;

      await t.test('concurrent duplicate owns one exchange and status recovers response truth', async () => {
        const outcomes = await Promise.all([
          acquireAppleOwnership({ database, identity: identity(), configuration, provider,
            appleAuth: { requestId: firstRequest, authorizationCode: firstCode } }),
          acquireAppleOwnership({ database, identity: identity(), configuration, provider,
            appleAuth: { requestId: firstRequest, authorizationCode: firstCode } }),
        ]);
        assert.equal(exchangeCalls, 1);
        assert.equal(new Set(outcomes.map((entry) => entry.appleAuth.receipt)).size, 1);
        firstReceipt = outcomes[0].appleAuth.receipt;
        assert.ok(outcomes.some((entry) => entry.appleAuth.state === 'ready'));
        assert.equal((await readAppleOwnershipStatus({
          database, identity: identity(), configuration,
          appleAuth: { requestId: firstRequest },
        })).appleAuth.state, 'ready');
        assert.equal((await readAppleOwnershipStatus({
          database, identity: identity(), configuration,
          appleAuth: { receipt: firstReceipt },
        })).appleAuth.state, 'ready');
        assert.equal((await database.query(
          'SELECT count(*)::int n FROM apple_ownership_materials WHERE user_id=$1', [userId],
        )).rows[0].n, 1);
        const storage = JSON.stringify((await database.query(
          'SELECT * FROM apple_ownership_attempts WHERE user_id=$1', [userId],
        )).rows);
        assert.equal(storage.includes(firstCode), false);
        assert.equal(storage.includes(firstReceipt), false);
      });

      await t.test('same code cannot bind another request; distinct grants append instead of overwrite', async () => {
        await assert.rejects(acquireAppleOwnership({
          database, identity: identity(), configuration, provider,
          appleAuth: { requestId: request(), authorizationCode: firstCode },
        }), (error) => error.code === 'apple_authorization_code_reused');
        const second = await acquireAppleOwnership({
          database, identity: identity(), configuration, provider,
          appleAuth: { requestId: request(), authorizationCode: `synthetic-code-${crypto.randomUUID()}` },
        });
        assert.equal(second.appleAuth.state, 'ready');
        secondReceipt = second.appleAuth.receipt;
        assert.equal(exchangeCalls, 2);
        const materials = await database.query(
          'SELECT attempt_id,state FROM apple_ownership_materials WHERE user_id=$1 ORDER BY acquired_at',
          [userId],
        );
        assert.equal(materials.rowCount, 2);
        assert.equal(new Set(materials.rows.map((row) => row.attempt_id)).size, 2);
      });

      await t.test('cross-generation request and code locks permit one exact-profile exchange', async () => {
        const v2Revocation = {
          enabled: true,
          encryptionKey: Buffer.alloc(32, 9),
          clientId: 'com.shareittoo.synthetic.v2',
          redirectUri: 'https://example.invalid/apple/v2/callback',
        };
        const configurationV2 = readAppleOwnershipConfiguration({
          APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
          APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v2',
          APPLE_OWNERSHIP_WEB_TEST_USER_IDS: userId,
        }, {
          appleRevocation: v2Revocation,
          firebaseProjectId: configuration.firebaseProjectId,
          coordinationKey: configuration.coordinationKey,
          historicalProfiles: [{
            generation: configuration.generation,
            firebaseProjectId: configuration.firebaseProjectId,
            appleRevocation: configuration.profiles[0].providerConfiguration,
          }],
        });
        const configurationV1Ring = readAppleOwnershipConfiguration({
          APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
          APPLE_OWNERSHIP_CONFIG_GENERATION: configuration.generation,
          APPLE_OWNERSHIP_WEB_TEST_USER_IDS: userId,
        }, {
          appleRevocation: configuration.profiles[0].providerConfiguration,
          firebaseProjectId: configuration.firebaseProjectId,
          coordinationKey: configuration.coordinationKey,
          historicalProfiles: [{
            generation: configurationV2.generation,
            firebaseProjectId: configurationV2.firebaseProjectId,
            appleRevocation: v2Revocation,
          }],
        });
        const exchangeProfiles = [];
        const providerRing = {
          forProfile(profile) {
            return profile ? {
              async exchangeAuthorizationCode({ code }) {
                exchangeProfiles.push(profile.generation);
                await new Promise((resolve) => setTimeout(resolve, 20));
                return `refresh-${profile.generation}-${code}`;
              },
            } : null;
          },
        };
        const duplicateRequest = request();
        const duplicateCode = `rotated-duplicate-${crypto.randomUUID()}`;
        const duplicateOutcomes = await Promise.all([
          acquireAppleOwnership({ database, identity: identity(), configuration: configurationV1Ring,
            provider: providerRing, appleAuth: { requestId: duplicateRequest, authorizationCode: duplicateCode } }),
          acquireAppleOwnership({ database, identity: identity(), configuration: configurationV2,
            provider: providerRing, appleAuth: { requestId: duplicateRequest, authorizationCode: duplicateCode } }),
        ]);
        assert.equal(exchangeProfiles.length, 1);
        assert.equal(new Set(duplicateOutcomes.map((entry) => entry.appleAuth.receipt)).size, 1);
        assert.equal((await database.query(
          'SELECT profile_generation FROM apple_ownership_attempts WHERE request_digest=$1',
          [appleOwnershipInternals.coordinationDigest(configuration, 'request', duplicateRequest)],
        )).rows[0].profile_generation, exchangeProfiles[0]);

        const sharedCode = `rotated-shared-${crypto.randomUUID()}`;
        const codeConflictOutcomes = await Promise.allSettled([
          acquireAppleOwnership({ database, identity: identity(), configuration: configurationV1Ring,
            provider: providerRing, appleAuth: { requestId: request(), authorizationCode: sharedCode } }),
          acquireAppleOwnership({ database, identity: identity(), configuration: configurationV2,
            provider: providerRing, appleAuth: { requestId: request(), authorizationCode: sharedCode } }),
        ]);
        assert.equal(exchangeProfiles.length, 2);
        assert.equal(codeConflictOutcomes.filter((entry) => entry.status === 'fulfilled').length, 1);
        assert.equal(codeConflictOutcomes.filter((entry) => entry.status === 'rejected'
          && entry.reason?.code === 'apple_authorization_code_reused').length, 1);
        await database.query(
          `DELETE FROM apple_ownership_attempts
            WHERE user_id=$1 AND (request_digest=$2 OR code_fingerprint=$3)`,
          [userId,
            appleOwnershipInternals.coordinationDigest(configuration, 'request', duplicateRequest),
            appleOwnershipInternals.coordinationDigest(configuration, 'authorization-code', sharedCode)],
        );
      });

      await t.test('real social route keeps exact receipt projection, non-enumeration and session replacement', async () => {
        const { createApp } = await import('../src/app.js');
        const { signAccessToken } = await import('../src/security.js');
        const tokenFor = (appleSubject, firebaseId) => ({
          provider: 'apple', subject: appleSubject, firebaseUserId: firebaseId,
          firebaseProjectId: configuration.firebaseProjectId,
          tokenIssuedAt: nowSeconds() - 5,
          tokenExpiresAt: nowSeconds() + 600,
          tokenAuthTime: nowSeconds() - 5,
        });
        const ownerToken = `route-owner-${'o'.repeat(190)}`;
        const foreignToken = `route-foreign-${'f'.repeat(188)}`;
        const oversizedLegacyToken = `route-legacy-large-${'l'.repeat(180)}`;
        let routeVerifierCalls = 0;
        let routeProviderCalls = 0;
        const routeProvider = {
          async exchangeAuthorizationCode({ code, expectedSubject }) {
            routeProviderCalls += 1;
            assert.equal(expectedSubject, routeSubject);
            return `route-refresh-${code}`;
          },
        };
        const app = createApp({
          appleOwnershipConfiguration: configuration,
          appleOwnershipProvider: routeProvider,
          verifySocialToken: async (token) => {
            routeVerifierCalls += 1;
            if (token === oversizedLegacyToken) {
              const error = new Error('synthetic invalid legacy token');
              error.status = 401;
              error.code = 'invalid_social_token';
              throw error;
            }
            return token === foreignToken
              ? tokenFor(foreignSubject, foreignFirebaseUserId)
              : tokenFor(routeSubject, routeFirebaseUserId);
          },
        });
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const post = async (path, body, headers = {}) => {
          const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5000),
          });
          return { response, body: await response.json() };
        };
        try {
          const attemptsBeforeOversize = Number((await database.query(
            'SELECT count(*)::int n FROM apple_ownership_attempts',
          )).rows[0].n);
          const verifierBeforeOversize = routeVerifierCalls;
          const providerBeforeOversize = routeProviderCalls;
          let deeplyNested = 'leaf';
          for (let depth = 0; depth < 20; depth += 1) deeplyNested = [deeplyNested];
          const deepV2 = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: {
              version: 2, operation: 'status', receipt: request(),
            },
            deeplyNested,
          });
          assert.equal(deepV2.response.status, 400);
          assert.equal(deepV2.body.error, 'apple_ownership_json_too_deep');
          assert.equal(routeVerifierCalls, verifierBeforeOversize);
          assert.equal(routeProviderCalls, providerBeforeOversize);
          assert.equal(Number((await database.query(
            'SELECT count(*)::int n FROM apple_ownership_attempts',
          )).rows[0].n), attemptsBeforeOversize);
          const oversizedV2 = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: {
              version: 2,
              operation: 'acquire',
              requestId: request(),
              authorizationCode: 'x'.repeat(33 * 1024),
            },
          });
          assert.equal(oversizedV2.response.status, 413);
          assert.equal(routeVerifierCalls, verifierBeforeOversize);
          assert.equal(routeProviderCalls, providerBeforeOversize);
          assert.equal(Number((await database.query(
            'SELECT count(*)::int n FROM apple_ownership_attempts',
          )).rows[0].n), attemptsBeforeOversize);
          const oversizedLegacy = await post('/v1/auth/social', {
            idToken: oversizedLegacyToken,
            padding: 'x'.repeat(2 * 1024 * 1024 - 4096),
          });
          assert.equal(oversizedLegacy.response.status, 401);
          assert.equal(routeVerifierCalls, verifierBeforeOversize + 1);
          assert.equal(routeProviderCalls, providerBeforeOversize);
          assert.equal(Number((await database.query(
            'SELECT count(*)::int n FROM apple_ownership_attempts',
          )).rows[0].n), attemptsBeforeOversize);

          await database.query('UPDATE users SET private_use_confirmed_at=NULL WHERE id=$1', [routeUserId]);
          const ineligible = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'acquire', requestId: request(), authorizationCode: '!' },
          });
          assert.equal(ineligible.response.status, 403);
          assert.equal(ineligible.body.error, 'apple_ownership_not_eligible');
          await database.query('UPDATE users SET private_use_confirmed_at=now() WHERE id=$1', [routeUserId]);

          const foreignSessionId = crypto.randomUUID();
          await database.query(
            `INSERT INTO auth_sessions (id,user_id,device_label) VALUES ($1,$2,'Foreign')`,
            [foreignSessionId, foreignUserId],
          );
          const conflictingBearer = signAccessToken({
            id: foreignUserId, email: `${foreignUserId}@example.invalid`, role: 'user',
          }, { sessionId: foreignSessionId });
          const conflict = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'acquire', requestId: request(), authorizationCode: 'conflict' },
          }, { authorization: `Bearer ${conflictingBearer}` });
          assert.equal(conflict.response.status, 409);
          assert.equal(conflict.body.error, 'apple_ownership_principal_conflict');

          const routeRequest = request();
          const acquire = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: {
              version: 2, operation: 'acquire', requestId: routeRequest,
              authorizationCode: `route-code-${crypto.randomUUID()}`,
            },
          });
          assert.equal(acquire.response.status, 200, JSON.stringify(acquire.body));
          assert.equal(acquire.response.headers.get('cache-control'), 'no-store');
          assert.deepEqual(Object.keys(acquire.body), ['appleAuth']);
          assert.deepEqual(Object.keys(acquire.body.appleAuth), ['version', 'receipt', 'state', 'expiresAt']);
          assert.equal(acquire.body.appleAuth.state, 'ready');
          const routeReceipt = acquire.body.appleAuth.receipt;

          const status = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'status', requestId: routeRequest },
          });
          assert.equal(status.response.status, 200);
          assert.equal(status.body.appleAuth.receipt, routeReceipt);
          await database.query(
            `UPDATE apple_ownership_attempts
                SET status_window_started_at=now(),status_window_count=30
              WHERE request_digest=$1`,
            [appleOwnershipInternals.coordinationDigest(configuration, 'request', routeRequest)],
          );
          const limited = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'status', receipt: routeReceipt },
          });
          assert.deepEqual(
            [limited.response.status, limited.body.error, limited.response.headers.get('retry-after')],
            [429, 'apple_ownership_status_rate_limited', '60'],
          );

          const missing = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'status', requestId: request() },
          });
          const foreign = await post('/v1/auth/social', {
            idToken: foreignToken,
            appleAuth: { version: 2, operation: 'status', receipt: routeReceipt },
          });
          assert.deepEqual(
            [missing.response.status, missing.body.error, foreign.response.status, foreign.body.error],
            [404, 'apple_attempt_unavailable', 404, 'apple_attempt_unavailable'],
          );

          const firstSession = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'session', receipt: routeReceipt, deliveryId: request() },
          });
          assert.equal(firstSession.response.status, 200, JSON.stringify(firstSession.body));
          assert.deepEqual(Object.keys(firstSession.body).sort(), ['appleAuth', 'session']);
          const secondSession = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'session', receipt: routeReceipt, deliveryId: request() },
          });
          assert.equal(secondSession.response.status, 200, JSON.stringify(secondSession.body));
          const oldAccess = await fetch(`${baseUrl}/v1/auth/me`, {
            headers: { authorization: `Bearer ${firstSession.body.session.accessToken}` },
          });
          const oldRefresh = await post('/v1/auth/refresh', {
            refreshToken: firstSession.body.session.refreshToken,
          });
          const newAccess = await fetch(`${baseUrl}/v1/auth/me`, {
            headers: { authorization: `Bearer ${secondSession.body.session.accessToken}` },
          });
          assert.equal(oldAccess.status, 401);
          assert.equal(oldRefresh.response.status, 401);
          assert.equal(newAccess.status, 200);

          const expiringRequest = request();
          const expiringAttemptId = crypto.randomUUID();
          const createdAt = new Date(Date.now() - 20 * 60 * 1000);
          const claimDeadline = new Date(createdAt.valueOf() + 120 * 1000);
          const recoveryDeadline = new Date(createdAt.valueOf() + 15 * 60 * 1000);
          const routeIdentity = tokenFor(routeSubject, routeFirebaseUserId);
          const profile = configuration.profiles[0];
          const binding = appleOwnershipInternals.bindingDigest(
            profile,
            routeIdentity,
            routeUserId,
            { id: expiringAttemptId, claimDeadline, recoveryDeadline },
          );
          await database.query(
            `INSERT INTO apple_ownership_attempts (
               id,user_id,request_digest,receipt_digest,receipt_key_id,encrypted_receipt,
               code_fingerprint,binding_digest,profile_generation,profile_digest,state,
               claim_deadline,recovery_deadline,created_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'closed',$11,$12,$13)`,
            [expiringAttemptId, routeUserId,
              appleOwnershipInternals.coordinationDigest(configuration, 'request', expiringRequest),
              appleOwnershipInternals.digest(profile, 'receipt', request()),
              profile.receiptKeyId, `expired.${'x'.repeat(64)}`,
              appleOwnershipInternals.coordinationDigest(
                configuration, 'authorization-code', `expired-${crypto.randomUUID()}`,
              ),
              binding, profile.generation, profile.profileDigest,
              claimDeadline, recoveryDeadline, createdAt],
          );
          await assert.rejects(database.query(
            'UPDATE apple_ownership_attempts SET recovery_deadline=now() WHERE id=$1',
            [expiringAttemptId],
          ), /apple_ownership_attempt_binding_immutable/u);
          const expired = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: { version: 2, operation: 'status', requestId: expiringRequest },
          });
          assert.deepEqual(
            [expired.response.status, expired.body.error],
            [404, 'apple_attempt_unavailable'],
          );
        } finally {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      });

      await t.test('application tombstone retains cleanup graph; hard delete blocks then cascades when clean', async () => {
        const { eraseAccount } = await import('../src/app.js');
        const client = await database.connect();
        let erased;
        try {
          await client.query('BEGIN');
          erased = await eraseAccount(client, { id: routeUserId, role: 'user' }, {
            actorRole: 'user', source: 'synthetic-pg16',
          });
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
        assert.equal(erased.deleted, true);
        assert.ok(erased.appleOwnershipCleanup.queued >= 1);
        assert.equal((await database.query(
          'SELECT account_status FROM users WHERE id=$1', [routeUserId],
        )).rows[0].account_status, 'closed');
        await assert.rejects(
          database.query('DELETE FROM users WHERE id=$1', [routeUserId]),
          /apple_ownership_cleanup_required/u,
        );
        const cleanupResult = await drainAppleOwnershipCleanup({
          database, configuration,
          provider: { async revoke() {} },
        });
        assert.ok(cleanupResult.revoked >= 1);
        await database.query('DELETE FROM users WHERE id=$1', [routeUserId]);
        for (const table of [
          'apple_ownership_enrollments', 'apple_ownership_attempts',
          'apple_ownership_materials', 'apple_ownership_deliveries',
        ]) {
          assert.equal((await database.query(
            `SELECT count(*)::int n FROM ${table} WHERE user_id=$1`, [routeUserId],
          )).rows[0].n, 0);
        }
      });

      await t.test('two profile generations keep sibling cleanup independent and unknown profile fail-closed', async () => {
        const v2Revocation = {
          enabled: true,
          encryptionKey: Buffer.alloc(32, 9),
          clientId: 'com.shareittoo.synthetic.v2',
          redirectUri: 'https://example.invalid/apple/v2/callback',
        };
        const configurationV2 = readAppleOwnershipConfiguration({
          APPLE_OWNERSHIP_ACQUISITION_ENABLED: 'true',
          APPLE_OWNERSHIP_CONFIG_GENERATION: 'synthetic-w4d-v2',
          APPLE_OWNERSHIP_WEB_TEST_USER_IDS: foreignUserId,
        }, {
          appleRevocation: v2Revocation,
          firebaseProjectId: configuration.firebaseProjectId,
          coordinationKey: configuration.coordinationKey,
          historicalProfiles: [{
            generation: configuration.generation,
            firebaseProjectId: configuration.firebaseProjectId,
            appleRevocation: configuration.profiles[0].providerConfiguration,
          }],
        });
        const foreignIdentity = () => ({
          provider: 'apple', subject: foreignSubject, firebaseUserId: foreignFirebaseUserId,
          firebaseProjectId: configuration.firebaseProjectId,
          tokenIssuedAt: nowSeconds() - 5,
          tokenExpiresAt: nowSeconds() + 600,
          tokenAuthTime: nowSeconds() - 5,
        });
        const v1Request = request();
        const v1Code = `v1-${crypto.randomUUID()}`;
        const v1 = await acquireAppleOwnership({
          database, identity: foreignIdentity(), configuration,
          provider: { async exchangeAuthorizationCode() { return 'profile-v1-refresh'; } },
          appleAuth: { requestId: v1Request, authorizationCode: v1Code },
        });
        let rotatedReplayExchanges = 0;
        const replayedV1 = await acquireAppleOwnership({
          database, identity: foreignIdentity(), configuration: configurationV2,
          provider: { async exchangeAuthorizationCode() { rotatedReplayExchanges += 1; return 'unused'; } },
          appleAuth: { requestId: v1Request, authorizationCode: v1Code },
        });
        assert.equal(rotatedReplayExchanges, 0);
        assert.equal(replayedV1.appleAuth.receipt, v1.appleAuth.receipt);
        await assert.rejects(acquireAppleOwnership({
          database, identity: foreignIdentity(), configuration: configurationV2,
          provider: { async exchangeAuthorizationCode() { rotatedReplayExchanges += 1; return 'unused'; } },
          appleAuth: { requestId: request(), authorizationCode: v1Code },
        }), (error) => error.code === 'apple_authorization_code_reused');
        assert.equal(rotatedReplayExchanges, 0);
        const v2 = await acquireAppleOwnership({
          database, identity: foreignIdentity(), configuration: configurationV2,
          provider: { async exchangeAuthorizationCode() { return 'profile-v2-refresh'; } },
          appleAuth: { requestId: request(), authorizationCode: `v2-${crypto.randomUUID()}` },
        });
        assert.equal(v1.appleAuth.state, 'ready');
        assert.equal(v2.appleAuth.state, 'ready');
        const client = await database.connect();
        try {
          await client.query('BEGIN');
          assert.equal((await prepareAppleOwnershipAccountDeletion(client, {
            userId: foreignUserId,
          })).queued, 2);
          await client.query('COMMIT');
        } finally { client.release(); }
        const currentOnly = Object.freeze({
          ...configurationV2,
          profiles: Object.freeze([configurationV2.profiles[0]]),
        });
        const revokedProfiles = [];
        const result = await drainAppleOwnershipCleanup({
          database,
          configuration: currentOnly,
          provider: {
            forProfile(profile) {
              if (!profile) return null;
              return { async revoke() { revokedProfiles.push(profile.generation); } };
            },
          },
        });
        assert.deepEqual(result, { revoked: 1, unresolved: 1 });
        assert.deepEqual(revokedProfiles, ['synthetic-w4d-v2']);
        const materialStates = (await database.query(
          `SELECT attempt.profile_generation,material.state
             FROM apple_ownership_materials material
             JOIN apple_ownership_attempts attempt ON attempt.id=material.attempt_id
            WHERE material.user_id=$1 ORDER BY attempt.profile_generation`,
          [foreignUserId],
        )).rows;
        assert.deepEqual(materialStates, [
          { profile_generation: 'synthetic-w4d-v1', state: 'cleanup_unknown' },
          { profile_generation: 'synthetic-w4d-v2', state: 'revoked' },
        ]);
      });

      await t.test('provider ambiguity is durable and blocks blind replay or a new acquisition', async () => {
        const ambiguousProvider = {
          async exchangeAuthorizationCode() {
            const error = new Error('synthetic response lost');
            error.code = 'synthetic_response_lost';
            throw error;
          },
        };
        const ambiguousRequest = request();
        await assert.rejects(acquireAppleOwnership({
          database, identity: identity(), configuration, provider: ambiguousProvider,
          appleAuth: { requestId: ambiguousRequest, authorizationCode: `synthetic-code-${crypto.randomUUID()}` },
        }), (error) => error.code === 'apple_ownership_exchange_unresolved');
        assert.equal((await readAppleOwnershipStatus({
          database, identity: identity(), configuration,
          appleAuth: { requestId: ambiguousRequest },
        })).appleAuth.state, 'unresolved');
        await assert.rejects(acquireAppleOwnership({
          database, identity: identity(), configuration, provider,
          appleAuth: { requestId: request(), authorizationCode: `synthetic-code-${crypto.randomUUID()}` },
        }), (error) => error.code === 'apple_ownership_unresolved');
        assert.equal(exchangeCalls, 2);
      });

      await t.test('delivery journal never returns a bearer on replay and replacement revokes only prior family', async () => {
        const delivery = () => crypto.randomBytes(32).toString('base64url');
        const issue = async ({ client }) => {
          const sessionId = crypto.randomUUID();
          await client.query(
            `INSERT INTO auth_sessions (id,user_id,device_label) VALUES ($1,$2,'Synthetic')`,
            [sessionId, userId],
          );
          return { kind: 'session', session: { sessionId, accessToken: `synthetic-${sessionId}` } };
        };
        const firstDelivery = delivery();
        const first = await deliverAppleOwnershipSession({
          database, identity: identity(), configuration,
          appleAuth: { receipt: firstReceipt, deliveryId: firstDelivery }, deliver: issue,
        });
        await assert.rejects(deliverAppleOwnershipSession({
          database, identity: identity(), configuration,
          appleAuth: { receipt: firstReceipt, deliveryId: firstDelivery }, deliver: issue,
        }), (error) => error.code === 'apple_session_delivery_uncertain');
        const beforeRollback = (await database.query(
          'SELECT revoked_at FROM auth_sessions WHERE id=$1', [first.session.sessionId],
        )).rows[0];
        assert.equal(beforeRollback.revoked_at, null);
        await assert.rejects(deliverAppleOwnershipSession({
          database, identity: identity(), configuration,
          appleAuth: { receipt: firstReceipt, deliveryId: delivery() },
          deliver: async () => { throw new Error('synthetic delivery rollback'); },
        }), /synthetic delivery rollback/u);
        assert.equal((await database.query(
          'SELECT revoked_at FROM auth_sessions WHERE id=$1', [first.session.sessionId],
        )).rows[0].revoked_at, null);
        const second = await deliverAppleOwnershipSession({
          database, identity: identity(), configuration,
          appleAuth: { receipt: firstReceipt, deliveryId: delivery() }, deliver: issue,
        });
        assert.ok((await database.query(
          'SELECT revoked_at FROM auth_sessions WHERE id=$1', [first.session.sessionId],
        )).rows[0].revoked_at);
        assert.equal((await database.query(
          'SELECT revoked_at FROM auth_sessions WHERE id=$1', [second.session.sessionId],
        )).rows[0].revoked_at, null);
      });

      await t.test('real MFA completion and replacement serialize without an untracked surviving session', async () => {
        const { createApp } = await import('../src/app.js');
        const {
          encryptTotpSecret, generateTotpSecret, totpCode,
        } = await import('../src/mfa_totp.js');
        const secret = generateTotpSecret();
        await database.query(
          `INSERT INTO mfa_totp_factors
           (user_id,encrypted_secret,status,recovery_code_hashes,enabled_at)
           VALUES ($1,$2,'enabled','[]'::jsonb,now())`,
          [userId, encryptTotpSecret(secret, Buffer.alloc(32, 6))],
        );
        const ownerToken = `mfa-owner-${'m'.repeat(191)}`;
        const app = createApp({
          appleOwnershipConfiguration: configuration,
          appleOwnershipProvider: provider,
          verifySocialToken: async () => identity(),
        });
        const server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const post = async (path, body) => {
          const response = await fetch(`${baseUrl}${path}`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
          });
          return { response, body: await response.json() };
        };
        try {
          const first = await post('/v1/auth/social', {
            idToken: ownerToken,
            appleAuth: {
              version: 2, operation: 'session', receipt: secondReceipt, deliveryId: request(),
            },
          });
          assert.equal(first.response.status, 202, JSON.stringify(first.body));
          assert.deepEqual(Object.keys(first.body).sort(), [
            'appleAuth', 'expiresAt', 'mfaChallenge', 'mfaRequired',
          ]);
          assert.equal(first.body.appleAuth.state, 'ready');
          const [completion, replacement] = await Promise.all([
            post('/v1/auth/mfa/challenge', {
              mfaChallenge: first.body.mfaChallenge,
              code: totpCode(secret, Math.floor(Date.now() / 1000 / 30)),
            }),
            post('/v1/auth/social', {
              idToken: ownerToken,
              appleAuth: {
                version: 2, operation: 'session', receipt: secondReceipt, deliveryId: request(),
              },
            }),
          ]);
          assert.equal(replacement.response.status, 202, JSON.stringify(replacement.body));
          assert.ok([200, 401, 409].includes(completion.response.status), JSON.stringify(completion.body));
          if (completion.response.status === 200) {
            assert.deepEqual(Object.keys(completion.body).sort(), ['appleAuth', 'session']);
            assert.ok((await database.query(
              'SELECT revoked_at FROM auth_sessions WHERE id=$1',
              [completion.body.session.sessionId],
            )).rows[0].revoked_at);
          } else {
            assert.equal(Object.hasOwn(completion.body, 'session'), false);
          }
          const active = await database.query(
            `SELECT count(*)::int n FROM apple_ownership_deliveries
              WHERE user_id=$1 AND superseded_at IS NULL`,
            [userId],
          );
          assert.equal(active.rows[0].n, 2);
        } finally {
          server.closeAllConnections();
          await new Promise((resolve) => server.close(resolve));
        }
      });

      await t.test('privacy export is nonempty and retention distinguishes reservations from cleanup', async () => {
        const exported = await buildAccountExport(database, userId);
        assert.ok(exported.data.authentication.appleOwnership.length >= 2);
        const serialized = JSON.stringify(exported.data.authentication.appleOwnership);
        for (const forbidden of ['authorizationCode', 'receiptDigest', 'requestDigest', 'refresh-for-', 'materialCiphertext']) {
          assert.equal(serialized.includes(forbidden), false);
        }
        const inventory = await inspectRetentionInventory(database, {
          actor: { id: userId, role: 'admin' },
        });
        const datasets = inventory.categories.flatMap((category) => category.datasets.map((entry) => entry.dataset));
        for (const name of [
          'apple_ownership_active_reservations', 'apple_ownership_cleanup_pending',
          'apple_ownership_cleanup_unknown', 'apple_ownership_materials',
        ]) assert.ok(datasets.includes(name));
      });

      await t.test('account deletion transfer keeps every sibling; cleanup success cannot clear unknown sibling', async () => {
        const client = await database.connect();
        let deletion;
        try {
          await client.query('BEGIN');
          deletion = await prepareAppleOwnershipAccountDeletion(client, { userId });
          await client.query('COMMIT');
        } finally { client.release(); }
        assert.equal(deletion.queued, 2);
        await database.query('DELETE FROM auth_sessions WHERE user_id=$1', [userId]);
        await database.query('DELETE FROM auth_identities WHERE user_id=$1', [userId]);
        assert.equal((await database.query(
          'SELECT count(*)::int n FROM apple_ownership_deliveries WHERE user_id=$1', [userId],
        )).rows[0].n, 4);
        const revokedValues = [];
        const result = await drainAppleOwnershipCleanup({
          database, configuration,
          provider: {
            async revoke({ value }) {
              revokedValues.push(value);
              if (value === issued[1]) throw Object.assign(new Error('synthetic revoke response lost'), { code: 'response_lost' });
            },
          },
        });
        assert.deepEqual(result, { revoked: 1, unresolved: 1 });
        assert.equal(revokedValues.length, 2);
        const states = (await database.query(
          'SELECT state FROM apple_ownership_materials WHERE user_id=$1 ORDER BY state', [userId],
        )).rows.map((row) => row.state);
        assert.deepEqual(states, ['cleanup_unknown', 'revoked']);
        assert.equal((await database.query(
          `SELECT count(*)::int n FROM apple_ownership_attempts
            WHERE user_id=$1 AND state IN ('unknown','cleanup_required')`, [userId],
        )).rows[0].n >= 2, true);
      });

      await t.test('down migration refuses retained ownership or cleanup obligations', async () => {
        const sql = await fs.readFile(new URL('../sql/migrations/106_apple_ownership_v2.down.sql', import.meta.url), 'utf8');
        const client = await database.connect();
        try {
          await client.query('BEGIN');
          await assert.rejects(client.query(sql), /apple_ownership_v2_obligations_present/u);
          await client.query('ROLLBACK');
        } finally { client.release(); }
      });
    } finally {
      await cleanup().catch(() => {});
      await database.end();
    }
  });
}
