import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

const { createApp } = await import('../src/app.js');

async function withServer(callback) {
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

test('technical sandbox public results are neutral and exact-path only', async () => {
  await withServer(async (baseUrl) => {
    const success = await fetch(`${baseUrl}/v1/payments/technical-sandbox/success?session_id=cs_live_tampered`);
    assert.equal(success.status, 200);
    assert.match(await success.text(), /kein Zahlungsnachweis/u);
    const head = await fetch(`${baseUrl}/v1/payments/technical-sandbox/cancel?success=true`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const extra = await fetch(`${baseUrl}/v1/payments/technical-sandbox/success/extra`);
    assert.equal(extra.status, 404);
  });
});

test('technical sandbox protected routes require a session and disabled webhook never writes', async () => {
  await withServer(async (baseUrl) => {
    for (const request of [
      fetch(`${baseUrl}/v1/payments/capabilities`),
      fetch(`${baseUrl}/v1/payments/technical-sandbox/checkout`, { method: 'POST' }),
      fetch(`${baseUrl}/v1/payments/technical-sandbox/runs/technical_sandbox_missing`),
    ]) {
      const response = await request;
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, 'authentication_required');
    }
    const webhook = await fetch(`${baseUrl}/v1/payments/technical-sandbox/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(webhook.status, 503);
    assert.equal((await webhook.json()).error, 'technical_sandbox_unavailable');
  });
});

test('app wiring verifies the primary signature before technical no-op and keeps raw routes before JSON', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf("app.post('/v1/payments/webhook'") < source.indexOf("app.use(express.json"));
  assert.match(source, /verifyAndApplyWebhook\(req\.body, req\.get\('Stripe-Signature'\), \{[\s\S]*allowTechnicalSandboxNoop: true/u);
  assert.match(source, /handleTechnicalSandboxWebhook\(\{[\s\S]*rawBody: req\.body/u);
  assert.match(source, /app\.post\('\/v1\/payments\/technical-sandbox\/webhook'/u);
});
