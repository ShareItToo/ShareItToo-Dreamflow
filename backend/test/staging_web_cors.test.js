import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertGreenWebCorsEnvironment,
  greenWebCorsOrigins,
} from '../ops/green_staging_promotion.mjs';

process.env.DEPLOYMENT_ENVIRONMENT = 'test';
process.env.MAIL_TRANSPORT = 'memory';
process.env.PAYMENT_TRANSPORT = 'memory';
process.env.PUSH_TRANSPORT = 'memory';
process.env.FIREBASE_AUTH_ENABLED = 'false';
process.env.CORS_ORIGINS = greenWebCorsOrigins;
process.env.SIT_STAGING_ACCESS_GATE_ENABLED = 'true';
process.env.SIT_STAGING_ALLOWED_USER_IDS = 'synthetic-cors-pilot';

const { createApp } = await import('../src/app.js');
const { config } = await import('../src/config.js');
const { pool } = await import('../src/db.js');

const publicOrigin = 'https://staging.shareittoo.com';
const rejected = [
  'http://staging.shareittoo.com', 'https://staging.shareittoo.com.evil.invalid',
  'https://staging-shareittoo.com', 'https://shareittoo.com',
  'https://www.shareittoo.com', 'https://staging.shareittoo.com:444',
  'https://staging.shareittoo.com/', 'null',
];

test('Green CORS requires exactly the retained internal and public Staging origins', () => {
  assert.equal(assertGreenWebCorsEnvironment({ DEPLOYMENT_ENVIRONMENT: 'test', CORS_ORIGINS: greenWebCorsOrigins }), true);
  for (const CORS_ORIGINS of [undefined, '', '*', ...rejected,
    'http://shareittoo-staging-api:8080', publicOrigin,
    `${greenWebCorsOrigins},${publicOrigin}`, `${greenWebCorsOrigins},https://shareittoo.com`,
  ]) assert.throws(() => assertGreenWebCorsEnvironment({ DEPLOYMENT_ENVIRONMENT: 'test', CORS_ORIGINS }), /green_web_cors_environment_invalid/u);
  for (const DEPLOYMENT_ENVIRONMENT of ['production', 'development', 'staging', undefined]) {
    assert.throws(() => assertGreenWebCorsEnvironment({ DEPLOYMENT_ENVIRONMENT, CORS_ORIGINS: greenWebCorsOrigins }), /green_web_cors_environment_invalid/u);
  }
});

test('Compose defaults preserve internal Staging origin without adding Staging to Production', () => {
  const staging = readFileSync(new URL('../compose.staging.yml', import.meta.url), 'utf8');
  const production = readFileSync(new URL('../compose.prod.yml', import.meta.url), 'utf8');
  assert.ok(staging.includes(`CORS_ORIGINS: \${CORS_ORIGINS:-${greenWebCorsOrigins}}`));
  const productionOrigins = /^\s+CORS_ORIGINS: (.+)$/mu.exec(production)[1];
  const parsedOrigins = productionOrigins.split(',').map((origin) => new URL(origin));
  assert.ok(parsedOrigins.some((origin) => origin.protocol === 'https:'
    && origin.hostname === 'shareittoo.com' && origin.port === ''));
  assert.ok(parsedOrigins.every((origin) => origin.hostname !== 'staging.shareittoo.com'));
  const promotion = readFileSync(new URL('../ops/green_staging_promotion.mjs', import.meta.url), 'utf8');
  assert.match(promotion, /candidate_runtime_flags_readback[^\n]+const names=\['CORS_ORIGINS'/u);
});

test('real API CORS accepts exact Staging OPTIONS/POST; registration remains closed with zero DB calls', async () => {
  let databaseCalls = 0;
  const query = pool.query;
  const connect = pool.connect;
  const rejectDatabase = () => { databaseCalls += 1; throw new Error('cors_fixture_database_forbidden'); };
  pool.query = rejectDatabase;
  pool.connect = rejectDatabase;
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // Reproduce the reported internal-only live configuration first.
    config.corsOrigins.splice(0, config.corsOrigins.length, 'http://shareittoo-staging-api:8080');
    for (const method of ['OPTIONS', 'POST']) {
      const response = await fetch(`${base}/v1/auth/register`, {
        method, headers: { Origin: publicOrigin, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error, 'origin_not_allowed');
    }
    config.corsOrigins.splice(0, config.corsOrigins.length, ...greenWebCorsOrigins.split(','));
    // Caddy strips /api; exercise the actual backend registration route, not a mock.
    for (const origin of greenWebCorsOrigins.split(',')) {
      const options = await fetch(`${base}/v1/auth/register`, {
        method: 'OPTIONS', headers: {
          Origin: origin, 'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      assert.equal(options.status, 204);
      assert.equal(options.headers.get('access-control-allow-origin'), origin);
      assert.match(options.headers.get('vary'), /Origin/u);
      assert.match(options.headers.get('access-control-allow-methods'), /POST/u);
      assert.match(options.headers.get('access-control-allow-headers'), /Content-Type/iu);
      const response = await fetch(`${base}/v1/auth/register`, {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal((await response.json()).error, 'staging_registration_disabled');
    }
    for (const origin of rejected) {
      for (const method of ['OPTIONS', 'POST']) {
        const response = await fetch(`${base}/v1/auth/register`, {
          method, headers: { Origin: origin, 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: '{}' } : {}),
        });
        assert.equal(response.status, 403, `${method} ${origin}`);
        assert.equal(response.headers.get('access-control-allow-origin'), null);
        assert.equal((await response.json()).error, 'origin_not_allowed');
      }
    }
    assert.equal(databaseCalls, 0, 'CORS and closed registration must never create/read a user');
  } finally {
    config.corsOrigins.splice(0, config.corsOrigins.length, ...greenWebCorsOrigins.split(','));
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    pool.query = query;
    pool.connect = connect;
  }
});

test('general API does not implicitly grant Staging when configured for Production origins', async () => {
  const original = [...config.corsOrigins];
  config.corsOrigins.splice(0, config.corsOrigins.length, 'https://shareittoo.com', 'https://www.shareittoo.com');
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [origin, expected] of [[publicOrigin, 403], ['https://shareittoo.com', 204]]) {
      const response = await fetch(`${base}/v1/auth/register`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
      assert.equal(response.status, expected);
      assert.equal(response.headers.get('access-control-allow-origin'), expected === 204 ? origin : null);
    }
  } finally {
    config.corsOrigins.splice(0, config.corsOrigins.length, ...original);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
