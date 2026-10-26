import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertWebCloneEnvironment,
  safeStaticPath,
  validateLocalWebOrigin,
  WEB_CLONE_ORIGIN,
} from '../../tool/run_local_qa_web_clone.mjs';

const validOrigin = 'http://127.0.0.1:18080';

function environment(overrides = {}) {
  return {
    NODE_ENV: 'test', DEPLOYMENT_ENVIRONMENT: 'test', BIND_HOST: '127.0.0.1',
    BOOKING_PILOT_MODE: 'pilot', PRIVATE_PILOT_V4_ENABLED: 'true',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: '0',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_SYNTHETIC_CLONE_BOOKING_LANE: '1', CORS_ORIGINS: validOrigin,
    SIT_SYNTHETIC_TARGET_KIND: 'clone', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_LISTING_AI_PROVIDER: 'mock', MAIL_TRANSPORT: 'memory',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_SYNTHETIC_DATASET_ID: 'wp255-green-clone-test',
    SIT_SYNTHETIC_CLONE_RUN_ID: 'wp255-20261026090000-a1b2c3d4',
    SIT_SYNTHETIC_CLONE_OWNER_ID: '00000000-0000-4000-8000-000000000011',
    SIT_SYNTHETIC_CLONE_RENTER_ID: '00000000-0000-4000-8000-000000000012',
    SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET: 'synthetic-only-secret-long-enough-for-test',
    ...overrides,
  };
}

test('web clone accepts only exact HTTP(S) loopback origins', () => {
  for (const origin of [
    WEB_CLONE_ORIGIN,
    'http://localhost:18080',
    'https://localhost',
    'https://127.0.0.1:9443',
    'https://[::1]:9443',
  ]) assert.equal(validateLocalWebOrigin(origin), origin);

  for (const origin of [
    '*', 'http://0.0.0.0:18080', 'http://192.168.1.5:18080',
    'https://example.invalid', 'http://127.0.0.1.attacker.invalid:18080',
    'http://user:pass@127.0.0.1:18080', 'http://127.0.0.1:18080/path',
    'http://127.0.0.1:18080/?x=1', 'http://127.0.0.1:18080/#fragment',
    'http://127.0.0.1:18080/', 'http://127.0.0.1:18080,http://localhost',
    ' http://127.0.0.1:18080',
  ]) assert.throws(() => validateLocalWebOrigin(origin), /web_clone_origin_/u, origin);
});

test('web clone runtime envelope pins Stage-A, test, loopback, memory and mock AI', () => {
  assert.equal(assertWebCloneEnvironment(environment(), { origin: validOrigin }), true);
  for (const [name, value] of [
    ['NODE_ENV', 'production'], ['DEPLOYMENT_ENVIRONMENT', 'staging'],
    ['BIND_HOST', '0.0.0.0'], ['BOOKING_PILOT_MODE', 'off'],
    ['PRIVATE_PILOT_V4_ENABLED', 'false'], ['PAYMENT_TRANSPORT', 'stripe'],
    ['STRIPE_LIVEMODE', 'true'], ['SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE', '1'],
    ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'],
    ['SIT_SYNTHETIC_CLONE_BOOKING_LANE', '0'], ['CORS_ORIGINS', '*'],
    ['SIT_SYNTHETIC_TARGET_KIND', 'green'], ['FIREBASE_AUTH_ENABLED', 'true'],
    ['SIT_LISTING_AI_PROVIDER', 'external'], ['MAIL_TRANSPORT', 'smtp'],
  ]) assert.throws(
    () => assertWebCloneEnvironment(environment({ [name]: value }), { origin: validOrigin }),
    /web_clone_environment_guard_failed/u,
    `${name}=${value}`,
  );
  assert.throws(
    () => assertWebCloneEnvironment(environment(), { origin: 'http://192.168.1.5:18080' }),
    /web_clone_origin_/u,
  );
  assert.throws(
    () => assertWebCloneEnvironment(environment(), { origin: 'http://localhost:18080' }),
    /web_clone_environment_guard_failed/u,
  );
});

test('static app serving confines resolved paths to the selected build root', () => {
  const root = '/private/tmp/sit-web-build';
  assert.equal(safeStaticPath(root, '/assets/flutter.js'), `${root}/assets/flutter.js`);
  assert.throws(() => safeStaticPath(root, '/%2e%2e/private/secrets'), /web_clone_static_path_invalid/u);
  assert.throws(() => safeStaticPath(root, '/%2fprivate/secrets'), /web_clone_static_path_invalid/u);
});
