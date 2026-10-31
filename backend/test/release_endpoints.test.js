import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.MAIL_TRANSPORT = 'memory';
process.env.APP_VERSION = '2026.08.08';
process.env.APP_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01';
process.env.APP_BUILD_TIME = '2026-08-08T16:35:47.000Z';
process.env.DEPLOYMENT_ENVIRONMENT = 'staging';

const { createApp } = await import('../src/app.js');

async function withServer(callback) {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

test('version endpoint exposes the running immutable release identity', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/version`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await response.json(), {
      version: '2026.08.08',
      commit: 'abcdef0123456789abcdef0123456789abcdef01',
      shortCommit: 'abcdef012345',
      buildTime: '2026-08-08T16:35:47.000Z',
      environment: 'staging',
      releaseId: '2026.08.08-abcdef012345',
    });
  });
});

test('liveness endpoint does not depend on the database', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/live`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.release.commit, process.env.APP_COMMIT);
  });
});

test('responses carry a validated correlation id without echoing unsafe input', async () => {
  await withServer(async (baseUrl) => {
    const accepted = await fetch(`${baseUrl}/version`, {
      headers: { 'X-Request-ID': 'sit-release-check-123' },
    });
    assert.equal(accepted.headers.get('x-request-id'), 'sit-release-check-123');

    const rejected = await fetch(`${baseUrl}/missing`, {
      headers: { 'X-Request-ID': 'unsafe/request/id' },
    });
    assert.equal(rejected.status, 404);
    const generated = rejected.headers.get('x-request-id');
    assert.match(generated, /^[0-9a-f-]{36}$/);
    assert.deepEqual(await rejected.json(), {
      error: 'not_found',
      requestId: generated,
    });
  });
});

test('the public account-deletion information page is not action-rate-limited', async () => {
  await withServer(async (baseUrl) => {
    for (let pageView = 0; pageView < 5; pageView += 1) {
      const response = await fetch(`${baseUrl}/v1/account-deletion`);
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.match(body, /data-sit-public-page="account-deletion"/u);
      assert.match(body, /data-sit-compliance-status="operational"/u);
    }
  });
});

test('Blue-Ocean listing mutations share a dedicated pre-authentication rate limit', async () => {
  await withServer(async (baseUrl) => {
    const paths = [
      '/v1/blue-ocean/listing-drafts/analyze',
      '/v1/blue-ocean/listing-drafts/synthetic-draft/review',
      '/v1/blue-ocean/listing-drafts/synthetic-draft/publish',
    ];
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`${baseUrl}${paths[attempt % paths.length]}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 401);
    }
    const blocked = await fetch(`${baseUrl}${paths[0]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error, 'rate_limit_exceeded');
  });
});
