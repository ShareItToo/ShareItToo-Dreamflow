import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';

const {
  normalizeRequestId,
  safeErrorLog,
  safeOperationalErrorCode,
} = await import('../src/observability.js');

test('request ids accept a small safe alphabet and reject injection-shaped input', () => {
  assert.equal(normalizeRequestId('sit-client:42.1'), 'sit-client:42.1');
  assert.match(normalizeRequestId('line\nbreak'), /^[0-9a-f-]{36}$/);
  assert.match(normalizeRequestId('x'.repeat(121)), /^[0-9a-f-]{36}$/);
});

test('safe error logs keep correlation but omit exception messages and payloads', () => {
  const log = safeErrorLog(
    { requestId: 'request-7' },
    500,
    'internal_error',
    new Error('private@example.com token=do-not-log'),
  );
  assert.deepEqual(JSON.parse(log), {
    type: 'api_error',
    requestId: 'request-7',
    statusCode: 500,
    error: 'internal_error',
    errorType: 'Error',
    releaseId: 'development',
  });
  assert.equal(log.includes('private@example.com'), false);
  assert.equal(log.includes('do-not-log'), false);
});

test('operational logs use bounded codes and never fall back to exception messages', () => {
  assert.equal(
    safeOperationalErrorCode({ code: 'provider_timeout' }, 'worker_failed'),
    'provider_timeout',
  );
  assert.equal(
    safeOperationalErrorCode(
      new Error('chat=private message address=Secret Street 7'),
      'worker_failed',
    ),
    'worker_failed',
  );
  assert.equal(
    safeOperationalErrorCode({ code: 'private@example.com\naddress' }, 'worker_failed'),
    'worker_failed',
  );
});
