import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://example:example@localhost:5432/example';
process.env.JWT_SECRET ??= 'test-secret-that-is-longer-than-thirty-two-characters';
process.env.MAIL_TRANSPORT = 'memory';
process.env.DEPLOYMENT_ENVIRONMENT = 'staging';

const { createApp } = await import('../src/app.js');

test('owner listing assistant route is authenticated before any payload work', async () => {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await fetch(
      `http://127.0.0.1:${address.port}/v1/listing-ai/assist/owner`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'authentication_required');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
});
