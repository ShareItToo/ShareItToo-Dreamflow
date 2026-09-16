import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import express from 'express';

import {
  coreRateLimitPolicies,
  createCoreRateLimiters,
  isProtectedSafetyRateLimitRequest,
} from '../src/rate_limit_policy.js';

const fixedClientAddress = '198.51.100.44';

async function withRateLimitServer(operation) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json());
  const limiters = createCoreRateLimiters({
    limitHandler: (_req, res) => res.status(429).json({ error: 'rate_limit_exceeded' }),
  });
  app.use(limiters.generalLimiter);
  app.get('/general', (_req, res) => res.sendStatus(204));
  app.post(
    '/v1/support/cases',
    limiters.supportIntakeRateLimiter,
    (_req, res) => res.sendStatus(204),
  );
  app.post(
    '/v1/bookings/:id/handover-exceptions',
    limiters.supportSafetyIntakeLimiter,
    (_req, res) => res.sendStatus(204),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    await operation(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

function send(baseUrl, pathname, body = null) {
  return fetch(`${baseUrl}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'X-Forwarded-For': fixedClientAddress,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function assertExactThreshold({ pathname, body, allowed }) {
  await withRateLimitServer(async (baseUrl) => {
    for (let attempt = 1; attempt <= allowed; attempt += 1) {
      const response = await send(baseUrl, pathname, body);
      assert.equal(response.status, 204, `attempt ${attempt} must remain allowed`);
    }
    const blocked = await send(baseUrl, pathname, body);
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).error, 'rate_limit_exceeded');
  });
}

test('core limiter policy keeps the exact production thresholds immutable', () => {
  assert.deepEqual(coreRateLimitPolicies, {
    general: { windowMs: 60_000, limit: 240 },
    supportIntake: { windowMs: 15 * 60_000, limit: 10 },
    supportSafetyIntake: { windowMs: 15 * 60_000, limit: 30 },
  });
  assert.equal(Object.isFrozen(coreRateLimitPolicies), true);
  assert.equal(Object.values(coreRateLimitPolicies).every(Object.isFrozen), true);
  assert.throws(
    () => createCoreRateLimiters({ limitHandler: null }),
    /rate_limit_handler_required/u,
  );
  assert.equal(createCoreRateLimiters({
    limitHandler: (_req, _res, next) => next(),
    includeGeneralLimiter: false,
  }).generalLimiter, null);
  assert.equal(isProtectedSafetyRateLimitRequest({
    method: 'POST',
    path: '/v1/support/cases',
    body: { caseType: 'trust_safety' },
  }), true);
  assert.equal(isProtectedSafetyRateLimitRequest({
    method: 'POST',
    path: '/v1/support/cases',
    body: { caseType: 'booking_general' },
  }), false);
  assert.equal(isProtectedSafetyRateLimitRequest({
    method: 'GET',
    path: '/v1/bookings/booking-1/handover-exceptions',
  }), false);
});

test('ordinary support intake blocks the fixed client only after ten attempts', async () => {
  await assertExactThreshold({
    pathname: '/v1/support/cases',
    body: { caseType: 'booking_general', caseSubType: 'question' },
    allowed: coreRateLimitPolicies.supportIntake.limit,
  });
});

test('protected safety intake has its independent thirty-attempt bucket', async () => {
  await withRateLimitServer(async (baseUrl) => {
    for (let attempt = 1; attempt <= coreRateLimitPolicies.supportIntake.limit; attempt += 1) {
      assert.equal((await send(baseUrl, '/v1/support/cases', {
        caseType: 'booking_general',
        caseSubType: 'question',
      })).status, 204);
    }
    assert.equal((await send(baseUrl, '/v1/support/cases', {
      caseType: 'booking_general',
      caseSubType: 'question',
    })).status, 429);

    for (let attempt = 1; attempt <= coreRateLimitPolicies.supportSafetyIntake.limit; attempt += 1) {
      assert.equal((await send(baseUrl, '/v1/support/cases', {
        caseType: 'trust_safety',
        caseSubType: 'urgent_safety',
      })).status, 204, `safety attempt ${attempt} must remain reachable`);
    }
    assert.equal((await send(baseUrl, '/v1/support/cases', {
      caseType: 'trust_safety',
      caseSubType: 'urgent_safety',
    })).status, 429);
  });
});

test('general limiter blocks the fixed client only after 240 requests', async () => {
  await assertExactThreshold({
    pathname: '/general',
    body: null,
    allowed: coreRateLimitPolicies.general.limit,
  });
});

test('exhausted general traffic cannot make bounded safety intake unreachable', async () => {
  await withRateLimitServer(async (baseUrl) => {
    for (let attempt = 1; attempt <= coreRateLimitPolicies.general.limit; attempt += 1) {
      assert.equal((await send(baseUrl, '/general')).status, 204);
    }
    assert.equal((await send(baseUrl, '/general')).status, 429);
    assert.equal((await send(baseUrl, '/v1/support/cases', {
      caseType: 'trust_safety',
      caseSubType: 'urgent_safety',
    })).status, 204);
    assert.equal((await send(
      baseUrl,
      '/v1/bookings/booking-1/handover-exceptions',
      { kind: 'item_mismatch' },
    )).status, 204);
    assert.equal((await send(baseUrl, '/v1/support/cases', {
      caseType: 'booking_general',
      caseSubType: 'question',
    })).status, 429);
  });
});

test('fresh application instances isolate buckets without IP rotation or reset hooks', async () => {
  for (let run = 1; run <= 2; run += 1) {
    await assertExactThreshold({
      pathname: '/v1/support/cases',
      body: { caseType: 'booking_general', caseSubType: `run-${run}` },
      allowed: coreRateLimitPolicies.supportIntake.limit,
    });
  }
});
