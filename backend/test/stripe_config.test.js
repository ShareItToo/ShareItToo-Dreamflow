import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function loadStripeConfiguration({
  key, livemode = 'false', environment = 'test', source = 'environment',
  connectWebhookSecret = 'whsec_connectunitfixture',
}) {
  const directory = source === 'file'
    ? mkdtempSync(join(tmpdir(), 'sit-stripe-config-'))
    : null;
  const paths = directory == null ? null : {
    key: join(directory, 'key'),
    webhook: join(directory, 'webhook'),
    connect: join(directory, 'connect'),
  };
  if (paths) {
    for (const [path, value] of [
      [paths.key, key],
      [paths.webhook, 'whsec_localunitfixture'],
      [paths.connect, connectWebhookSecret],
    ]) {
      writeFileSync(path, `${value}\n`, { mode: 0o600 });
      chmodSync(path, 0o600);
    }
  }
  try {
    return spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        [
          "const { config } = await import('./src/config.js');",
          'console.log(JSON.stringify({',
          '  transport: config.payments.transport,',
          '  enabled: config.payments.enabled,',
          '  livemode: config.payments.livemode,',
          '  apiVersion: config.payments.apiVersion,',
          '  credentialSource: config.payments.credentialSource,',
          '  hasServerCredential: config.payments.secretKey.length > 0,',
          '  hasWebhookCredential: config.payments.webhookSecret.length > 0,',
          '  hasConnectWebhookCredential: config.payments.connectWebhookSecret.length > 0,',
          '}));',
        ].join('\n'),
      ],
      {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DEPLOYMENT_ENVIRONMENT: environment,
          DATABASE_URL: 'postgresql://127.0.0.1:1/sit_test',
          JWT_SECRET: `local-test-only-${'x'.repeat(40)}`,
          PAYMENT_TRANSPORT: 'stripe',
          STRIPE_SECRET_KEY: source === 'environment' ? key : '',
          STRIPE_WEBHOOK_SECRET: source === 'environment' ? 'whsec_localunitfixture' : '',
          STRIPE_CONNECT_WEBHOOK_SECRET: source === 'environment' ? connectWebhookSecret : '',
          STRIPE_SECRET_KEY_FILE: paths?.key ?? '',
          STRIPE_WEBHOOK_SECRET_FILE: paths?.webhook ?? '',
          STRIPE_CONNECT_WEBHOOK_SECRET_FILE: paths?.connect ?? '',
          STRIPE_LIVEMODE: livemode,
        },
      },
    );
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
}

for (const key of ['sk_test_localunitfixture', 'rk_test_localunitfixture']) {
  test(`staging accepts a file-sourced server-side ${key.slice(0, 2)} Stripe test credential`, () => {
    const result = loadStripeConfiguration({ key, environment: 'staging', source: 'file' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      transport: 'stripe',
      enabled: true,
      livemode: false,
      apiVersion: '2026-08-26.dahlia',
      credentialSource: 'file',
      hasServerCredential: true,
      hasWebhookCredential: true,
      hasConnectWebhookCredential: true,
    });
    assert.doesNotMatch(result.stdout, /localunitfixture/u);
  });
}

test('staging rejects live Stripe credentials even when the live flag matches', () => {
  const result = loadStripeConfiguration({
    key: 'rk_live_localunitfixture',
    livemode: 'true',
    environment: 'staging',
    source: 'file',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Stripe live mode is forbidden outside production/u);
  assert.doesNotMatch(result.stderr, /rk_live_localunitfixture/u);
});

test('staging rejects direct Stripe credentials even when all values are test-class', () => {
  const result = loadStripeConfiguration({
    key: 'rk_test_localunitfixture',
    environment: 'staging',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Stripe Staging transport requires file credentials/u);
  assert.doesNotMatch(result.stderr, /rk_test_localunitfixture|whsec_localunitfixture/u);
});

test('Stripe transport requires a distinct Accounts v2 signing secret', () => {
  for (const connectWebhookSecret of ['', 'invalid', 'whsec_localunitfixture']) {
    const result = loadStripeConfiguration({
      key: 'rk_test_localunitfixture', connectWebhookSecret,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /STRIPE_CONNECT_WEBHOOK_SECRET/u);
    assert.doesNotMatch(result.stderr, /whsec_localunitfixture|rk_test_localunitfixture/u);
  }
});

test('Stripe mode rejects publishable and mode-mismatched credentials', () => {
  const publishable = loadStripeConfiguration({ key: 'pk_test_localunitfixture' });
  assert.notEqual(publishable.status, 0);
  assert.match(publishable.stderr, /server-side Stripe secret or restricted key/u);

  const mismatch = loadStripeConfiguration({
    key: 'sk_test_localunitfixture',
    livemode: 'true',
  });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /STRIPE_LIVEMODE must match STRIPE_SECRET_KEY/u);
});
