import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!databaseUrl) {
  test.skip('notification lifecycle requires isolated PostgreSQL 16');
} else {
  test('provider-off notification commit, recipient isolation, replay and process restart', { timeout: 60000 }, async (t) => {
    const namespace = `notification-pg-${crypto.randomUUID()}`;
    const ids = Object.fromEntries(['owner', 'renter', 'foreign'].map((role) => [role, `${namespace}-${role}`]));
    // The standard runner shares a cluster across suites. A run-owned database
    // keeps the global outbox drainer from consuming another suite's fixtures.
    const fixtureDatabaseName = `sit_notification_${crypto.randomBytes(12).toString('hex')}`;
    const fixtureUrl = new URL(databaseUrl);
    fixtureUrl.pathname = `/${fixtureDatabaseName}`;
    const controller = new pg.Pool({ connectionString: databaseUrl });
    Object.assign(process.env, {
      DATABASE_URL: fixtureUrl.toString(),
      JWT_SECRET: `synthetic-notification-${crypto.randomBytes(40).toString('hex')}`,
      DEPLOYMENT_ENVIRONMENT: 'test', BIND_HOST: '127.0.0.1',
      PAYMENT_TRANSPORT: 'memory', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
      IDENTITY_VERIFICATION_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
      TECHNICAL_SANDBOX_ENABLED: '0', TECHNICAL_SANDBOX_KILL_SWITCH: '1',
      FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_ENABLED: 'false',
      PRIVATE_PILOT_V4_ENABLED: 'true', BOOKING_PILOT_MODE: 'pilot',
      PRIVATE_PILOT_ALLOWED_REGIONS: 'berlin',
      SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
      SIT_STAGING_ALLOWED_USER_IDS: Object.values(ids).join(','),
      SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED: 'false',
      SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS: '',
      SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
      SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
      PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api',
    });
    const database = new pg.Pool({ connectionString: fixtureUrl.toString() });
    let fixtureDatabaseCreated = false;
    let child;
    let base;
    const start = async () => {
      child = fork(new URL('../test_support/notification_lifecycle_server.mjs', import.meta.url), {
        env: { ...process.env }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      let childError = '';
      child.stderr.on('data', (value) => { childError += value; });
      const ready = await Promise.race([
        once(child, 'message', { signal: AbortSignal.timeout(15000) }).then(([value]) => value),
        once(child, 'exit').then(([code]) => { throw new Error(`notification child exited ${code}: ${childError.slice(-2000)}`); }),
      ]);
      assert.equal(ready.kind, 'ready');
      base = `http://127.0.0.1:${ready.port}`;
    };
    const stop = async () => {
      if (!child || child.exitCode !== null) return;
      const exited = once(child, 'exit', { signal: AbortSignal.timeout(15000) });
      child.send({ kind: 'stop' });
      const [code] = await exited;
      assert.equal(code, 0);
      child = null;
    };
    const drain = async () => {
      const next = once(child, 'message', { signal: AbortSignal.timeout(15000) });
      child.send({ kind: 'drain' });
      const [message] = await next;
      assert.equal(message.kind, 'drained');
      return message.processed;
    };
    const tokens = {};
    const sessions = {};
    const refresh = {};
    const request = async (role, route, { method = 'GET', body, key, token } = {}) => {
      const response = await fetch(`${base}/v1${route}`, {
        method, headers: {
          ...(role ? { authorization: `Bearer ${token ?? tokens[role]}` } : {}),
          'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}),
        }, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const ok = (response, status = 200) => {
      assert.equal(response.status, status, JSON.stringify(response.body));
      return response.body;
    };
    const list = async (role) => ok(await request(role, '/notifications')).notifications;
    const count = async (table, column, value) => Number((await database.query(
      `SELECT count(*)::int n FROM ${table} WHERE ${column}=$1`, [value],
    )).rows[0].n);
    const listingId = `${namespace}-listing`;
    let bookingId;
    let threadId;
    let messageId;
    let messageNotification;
    const counts = async () => (await database.query(`SELECT
      (SELECT count(*)::int FROM notification_outbox WHERE booking_id=$1) AS outbox,
      (SELECT count(*)::int FROM notifications WHERE booking_id=$1) AS inbox,
      (SELECT count(*)::int FROM booking_events WHERE booking_id=$1) AS events,
      (SELECT count(*)::int FROM audit_log WHERE resource_id=$1 OR resource_id=$2) AS audit`,
    [bookingId, messageId ?? ''])).rows[0];
    try {
      assert.equal(Math.floor(Number((await controller.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 16);
      assert.equal((await controller.query('SELECT 1 FROM pg_database WHERE datname=$1', [fixtureDatabaseName])).rowCount, 0);
      await controller.query(`CREATE DATABASE "${fixtureDatabaseName}"`);
      fixtureDatabaseCreated = true;
      await database.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
      const { runMigrations } = await import('../src/migrations.js');
      await runMigrations(database);
      const { signAccessToken, hashRefreshToken } = await import('../src/security.js');
      assert.equal((await database.query('SELECT id FROM users WHERE id=ANY($1::text[])', [Object.values(ids)])).rowCount, 0);
      for (const [role, id] of Object.entries(ids)) {
        const email = `${id}@example.invalid`;
        await database.query(`INSERT INTO users
          (id,email,profile,role,account_status,email_verified_at,private_use_confirmed_at,private_marketplace_review_status)
          VALUES ($1,$2,$3,'user','active',now(),now(),'clear')`,
        [id, email, { displayName: `SYNTHETIC_TEST_ONLY ${role}` }]);
        sessions[role] = crypto.randomUUID();
        await database.query('INSERT INTO auth_sessions (id,user_id) VALUES ($1,$2)', [sessions[role], id]);
        tokens[role] = signAccessToken({ id, email }, { sessionId: sessions[role] });
        refresh[role] = crypto.randomBytes(32).toString('base64url');
        await database.query(`INSERT INTO refresh_tokens (user_id,session_id,token_hash,expires_at)
          VALUES ($1,$2,$3,now()+interval '1 hour')`, [id, sessions[role], hashRefreshToken(refresh[role])]);
      }
      // Explicit synthetic database fixture, not a publication/photo-authenticity claim.
      await database.query(`INSERT INTO listings
        (id,owner_id,payload,is_active,status,catalog_version,catalog_revision,title,description,
         category_id,subcategory,condition,city,country,latitude,longitude,price_per_day_minor,
         currency,security_deposit_minor,protection_model,private_status_confirmed_at,private_pilot_region_code)
        VALUES ($1,$2,$3,true,'active',1,1,'SYNTHETIC_TEST_ONLY camera',
         'Synthetic notification acceptance fixture','cat3','Kameras','good','Berlin','Deutschland',
         52.52,13.40,1000,'EUR',NULL,'none',now(),'berlin')`,
      [listingId, ids.owner, { title: 'SYNTHETIC_TEST_ONLY camera', syntheticTestOnly: true }]);
      await start();
      for (const role of ['owner', 'renter']) ok(await request(role, '/auth/devices/push', {
        method: 'PUT', body: { token: `synthetic-push-${namespace}-${role}`, platform: 'android' },
      }));
      const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
      const bookingRequest = { itemId: listingId, startDate: day(7), endDate: day(9),
        clientBuild: 'synthetic-notification-pg', simulationOnly: true, simulationAcknowledged: true };
      const createKey = `${namespace}-create`;
      const acceptKey = `${namespace}-accept`;
      const messageKey = `${namespace}-message`;
      const text = 'SYNTHETIC_TEST_ONLY notification lifecycle message';

      await t.test('committed request and acceptance enqueue once for the correct parties', async () => {
        const created = ok(await request('renter', '/bookings', { method: 'POST', body: bookingRequest, key: createKey }), 201);
        bookingId = created.booking.id;
        assert.equal(await count('bookings', 'id', bookingId), 1);
        assert.equal((await database.query('SELECT workflow_status,simulation_only FROM bookings WHERE id=$1', [bookingId])).rows[0].simulation_only, true);
        assert.equal(await count('notification_outbox', 'booking_id', bookingId), 2);
        // HTTP schedules the real asynchronous worker; join it before comparing
        // persisted inbox snapshots rather than assuming it has not started.
        await drain();
        const before = await counts();
        ok(await request('renter', '/bookings', { method: 'POST', body: bookingRequest, key: createKey }));
        assert.deepEqual(await counts(), before);
        await drain();
        const ownerInbox = await list('owner');
        assert.equal(ownerInbox.length, 1);
        assert.equal(ownerInbox[0].kind, 'booking_requested');
        assert.equal(ownerInbox[0].read, false);
        assert.equal(ownerInbox[0].actionUrl, `https://staging.shareittoo.com/api/open/booking/${bookingId}`);
        assert.equal(ownerInbox[0].ctaLabel, 'Zur Vermietung');
        assert.deepEqual(await list('renter'), []);
        assert.deepEqual(await list('foreign'), []);
        const route = `/bookings/${bookingId}/transitions`;
        assert.equal((await request('foreign', route, { method: 'POST', body: { status: 'accepted' }, key: `${namespace}-foreign` })).status, 403);
        ok(await request('owner', route, { method: 'POST', body: { status: 'accepted' }, key: acceptKey }));
        await drain();
        const acceptedCounts = await counts();
        ok(await request('owner', route, { method: 'POST', body: { status: 'accepted' }, key: acceptKey }));
        assert.deepEqual(await counts(), acceptedCounts);
        await drain();
        const renterInbox = await list('renter');
        assert.equal(renterInbox.length, 1);
        assert.equal(renterInbox[0].kind, 'booking_accepted');
        assert.equal(renterInbox[0].ctaLabel, 'Zur Buchung');
        assert.equal(renterInbox[0].requestId, bookingId);
      });

      await t.test('message commits audit and unique recipient notification; foreign read/write denied', async () => {
        threadId = ok(await request('renter', `/message-threads/booking/${bookingId}`, { method: 'POST' }), 201).thread.id;
        const route = `/message-threads/${threadId}/messages`;
        messageId = ok(await request('renter', route, { method: 'POST', body: { text }, key: messageKey }), 201).message.id;
        assert.equal(await count('messages', 'id', messageId), 1);
        assert.equal(await count('notification_outbox', 'event_key', `message:${messageId}`), 2);
        assert.equal(await count('audit_log', 'resource_id', messageId), 1);
        await drain();
        const before = await counts();
        const replay = ok(await request('renter', route, { method: 'POST', body: { text }, key: messageKey }));
        assert.equal(replay.message.id, messageId);
        assert.deepEqual(await counts(), before);
        assert.equal((await request('foreign', route)).status, 403);
        assert.equal((await request('foreign', route, { method: 'POST', body: { text }, key: `${namespace}-foreign-message` })).status, 403);
        await drain();
        messageNotification = (await list('owner')).find((row) => row.kind === 'message_received');
        assert.ok(messageNotification);
        assert.equal(messageNotification.read, false);
        assert.equal(messageNotification.threadId, threadId);
        assert.equal(messageNotification.actionUrl, `https://staging.shareittoo.com/api/open/chat/${threadId}`);
        assert.equal(messageNotification.ctaLabel, 'Chat öffnen');
        assert.equal((await list('renter')).some((row) => row.kind === 'message_received'), false);
        assert.deepEqual(await list('foreign'), []);
        for (const role of ['renter', 'foreign']) assert.equal((await request(role, `/notifications/${messageNotification.id}`, { method: 'PATCH', body: { read: true } })).status, 404);
        ok(await request('owner', `/notifications/${messageNotification.id}`, { method: 'PATCH', body: { read: true } }));
        assert.equal((await list('owner')).find((row) => row.id === messageNotification.id).read, true);
      });

      await t.test('a fresh server process preserves inbox/read state and does not repeat delivery', async () => {
        const before = await counts();
        const oldPid = child.pid;
        await stop();
        await start();
        assert.notEqual(child.pid, oldPid);
        assert.equal((await list('owner')).find((row) => row.id === messageNotification.id).read, true);
        assert.equal(await drain(), 0);
        assert.deepEqual(await counts(), before);
        const attempts = (await database.query(`SELECT d.provider,d.outcome FROM notification_delivery_attempts d
          JOIN notification_outbox o ON o.id=d.outbox_id WHERE o.booking_id=$1`, [bookingId])).rows;
        assert.equal(attempts.length, 6);
        assert.ok(attempts.every((row) => ['memory', 'postgres'].includes(row.provider) && row.outcome === 'sent'));
        assert.equal(await count('payments', 'booking_id', bookingId), 0);
        assert.equal(await count('platform_contracts', 'booking_id', bookingId), 0);
      });

      await t.test('logout revokes only its session/token; foreign and forged sessions cannot read inbox', async () => {
        const before = await counts();
        assert.equal((await request(null, '/notifications')).status, 401);
        const { signAccessToken } = await import('../src/security.js');
        const forged = signAccessToken({ id: ids.owner, email: `${ids.owner}@example.invalid` }, { sessionId: sessions.foreign });
        assert.equal((await request('owner', '/notifications', { token: forged })).status, 401);
        ok(await request('owner', '/auth/logout', { method: 'POST', body: { refreshToken: refresh.owner } }), 204);
        assert.equal((await request('owner', '/notifications')).status, 401);
        assert.equal((await request('owner', `/notifications/${messageNotification.id}`, { method: 'PATCH', body: { read: false } })).status, 401);
        assert.equal(await count('push_devices', 'user_id', ids.owner), 0);
        assert.equal(await count('push_devices', 'user_id', ids.renter), 1);
        assert.ok((await database.query('SELECT revoked_at FROM auth_sessions WHERE id=$1', [sessions.owner])).rows[0].revoked_at);
        assert.equal((await list('renter')).length, 1);
        assert.deepEqual(await list('foreign'), []);
        assert.deepEqual(await counts(), before);
      });
    } finally {
      try {
        await stop();
      } finally {
        await database.end();
        try {
          if (fixtureDatabaseCreated) {
            await controller.query(`DROP DATABASE "${fixtureDatabaseName}"`);
            assert.equal((await controller.query('SELECT 1 FROM pg_database WHERE datname=$1', [fixtureDatabaseName])).rowCount, 0);
          }
        } finally {
          await controller.end();
        }
      }
    }
  });
}
