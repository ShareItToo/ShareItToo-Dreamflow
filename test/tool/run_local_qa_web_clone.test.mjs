import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertWebCloneEnvironment,
  assertLocalWebCloneBuildSource,
  getFreshWebCloneCleanupToken,
  WEB_CLONE_PRIVATE_PILOT_ALLOWED_REGIONS,
  resolveWebCloneSyntheticPaymentFlag,
  safeStaticPath,
  validateLocalWebOrigin,
  webCloneProxyAccessRecord,
  resolveWebCloneMapsFixture,
  isAllowedWebCloneRealtimeUpgrade,
  WEB_CLONE_ORIGIN,
} from '../../tool/run_local_qa_web_clone.mjs';

const validOrigin = 'http://127.0.0.1:18080';

function environment(overrides = {}) {
  return {
    NODE_ENV: 'test', DEPLOYMENT_ENVIRONMENT: 'test', BIND_HOST: '127.0.0.1',
    BOOKING_PILOT_MODE: 'pilot', PRIVATE_PILOT_V4_ENABLED: 'true',
    PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: '0',
    SIT_WEB_CLONE_SYNTHETIC_PAYMENT: '0',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_SYNTHETIC_CLONE_BOOKING_LANE: '1', CORS_ORIGINS: validOrigin,
    SIT_SYNTHETIC_TARGET_KIND: 'clone', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_LISTING_AI_PROVIDER: 'mock', MAIL_TRANSPORT: 'memory',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING: 'false',
    TECHNICAL_SANDBOX_ENABLED: '0', TECHNICAL_SANDBOX_KILL_SWITCH: '1',
    SIT_SYNTHETIC_DATASET_ID: 'wp255-green-clone-test',
    SIT_SYNTHETIC_CLONE_RUN_ID: 'wp255-20261026090000-a1b2c3d4',
    SIT_SYNTHETIC_CLONE_OWNER_ID: '00000000-0000-4000-8000-000000000011',
    SIT_SYNTHETIC_CLONE_RENTER_ID: '00000000-0000-4000-8000-000000000012',
    SIT_SYNTHETIC_CLONE_CONFIRMATION_SECRET: 'synthetic-only-secret-long-enough-for-test',
    PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
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
  assert.equal(assertWebCloneEnvironment(environment({
    SIT_WEB_CLONE_SYNTHETIC_PAYMENT: '1',
    SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE: '1',
  }), { origin: validOrigin }), true);
  assert.equal(resolveWebCloneSyntheticPaymentFlag(undefined), '0');
  assert.equal(resolveWebCloneSyntheticPaymentFlag('1'), '1');
  for (const value of ['', 'true', 'false', '2']) {
    assert.throws(
      () => resolveWebCloneSyntheticPaymentFlag(value),
      /web_clone_synthetic_payment_flag_invalid/u,
    );
  }
  for (const [name, value] of [
    ['NODE_ENV', 'production'], ['DEPLOYMENT_ENVIRONMENT', 'staging'],
    ['BIND_HOST', '0.0.0.0'], ['BOOKING_PILOT_MODE', 'off'],
    ['PRIVATE_PILOT_V4_ENABLED', 'false'], ['PAYMENT_TRANSPORT', 'stripe'],
    ['STRIPE_LIVEMODE', 'true'], ['SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE', '1'],
    ['SIT_WEB_CLONE_SYNTHETIC_PAYMENT', '1'],
    ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'],
    ['SIT_SYNTHETIC_CLONE_BOOKING_LANE', '0'], ['CORS_ORIGINS', '*'],
    ['SIT_SYNTHETIC_TARGET_KIND', 'green'], ['FIREBASE_AUTH_ENABLED', 'true'],
    ['SIT_LISTING_AI_PROVIDER', 'external'], ['MAIL_TRANSPORT', 'smtp'],
    ['SIT_LOCAL_QA_SYNTHETIC_IMAGE_SCREENING', 'true'],
    ['TECHNICAL_SANDBOX_ENABLED', '1'], ['TECHNICAL_SANDBOX_KILL_SWITCH', '0'],
    ['PRIVATE_PILOT_ALLOWED_REGIONS', 'heilbronn_wave0'],
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

test('cleanup obtains a fresh token and verifies it still belongs to the owner', async () => {
  let loginCalls = 0;
  const token = await getFreshWebCloneCleanupToken({
    login: async () => { loginCalls++; return 'fresh-synthetic-owner-token'; },
    readUserId: async (value) => value === 'fresh-synthetic-owner-token' ? 'owner-1' : 'owner-2',
    expectedUserId: 'owner-1',
  });
  assert.equal(token, 'fresh-synthetic-owner-token');
  assert.equal(loginCalls, 1);

  await assert.rejects(getFreshWebCloneCleanupToken({
    login: async () => 'fresh-synthetic-owner-token',
    readUserId: async () => 'successor-owner',
    expectedUserId: 'owner-1',
  }), (error) => error?.code === 'web_clone_cleanup_owner_mismatch');
});

test('local clone region allowlist uses the backend city region code', () => {
  assert.equal(WEB_CLONE_PRIVATE_PILOT_ALLOWED_REGIONS, 'heilbronn');
  assert.equal(assertWebCloneEnvironment(environment(), { origin: validOrigin }), true);
  assert.throws(
    () => assertWebCloneEnvironment(environment({
      PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn_wave0',
    }), { origin: validOrigin }),
    /web_clone_environment_guard_failed/u,
  );
});

test('static app serving confines resolved paths to the selected build root', () => {
  const root = '/private/tmp/sit-web-build';
  assert.equal(safeStaticPath(root, '/assets/flutter.js'), `${root}/assets/flutter.js`);
  assert.throws(() => safeStaticPath(root, '/%2e%2e/private/secrets'), /web_clone_static_path_invalid/u);
  assert.throws(() => safeStaticPath(root, '/%2fprivate/secrets'), /web_clone_static_path_invalid/u);
});

test('local web clone rejects a compiled app pointed at the production API', () => {
  assert.equal(assertLocalWebCloneBuildSource(
    'const api = "http://127.0.0.1:18080/api/v1";',
  ), true);
  assert.throws(
    () => assertLocalWebCloneBuildSource(
      'const api = "https://shareittoo.com/api/v1";',
    ),
    /web_clone_web_build_api_origin_mismatch/u,
  );
  assert.throws(
    () => assertLocalWebCloneBuildSource('const api = "http://127.0.0.1:1/api/v1";'),
    /web_clone_web_build_api_origin_mismatch/u,
  );
});

test('custom Flutter bootstrap pins CanvasKit and permits local picker blob reads', () => {
  const bootstrap = readFileSync('web/flutter_bootstrap.js', 'utf8');
  assert.match(bootstrap, /\{\{flutter_js\}\}/u);
  assert.match(bootstrap, /\{\{flutter_build_config\}\}/u);
  assert.match(bootstrap, /canvasKitBaseUrl:\s*["']canvaskit\/["']/u);
  assert.match(bootstrap, /serviceWorkerVersion:\s*\{\{flutter_service_worker_version\}\}/u);
  assert.doesNotMatch(bootstrap, /https?:\/\//u);

  const runner = readFileSync('tool/run_local_qa_web_clone.mjs', 'utf8');
  assert.match(
    runner,
    /content-security-policy': "default-src 'self' data: blob:; connect-src 'self' blob: ws:\/\/127\.0\.0\.1:18080; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'"/u,
  );
  assert.doesNotMatch(runner, /script-src[^"\n]*https?:/u);
});

test('runner marks its private synthetic-session manifest as production-credential free', () => {
  const runner = readFileSync('tool/run_local_qa_web_clone.mjs', 'utf8');
  assert.match(runner, /synthetic:\s*true,\s*containsProductionCredentials:\s*false/u);
});

test('proxy access diagnostics record only method, query-free path and status', () => {
  assert.deepEqual(
    webCloneProxyAccessRecord('POST', '/v1/auth/login?email=synthetic&token=secret', 200),
    { event: 'web_clone_proxy_access', method: 'POST', path: '/v1/auth/login', status: 200 },
  );
  assert.equal(isAllowedWebCloneRealtimeUpgrade('/api/v1/realtime', validOrigin), true);
  assert.equal(isAllowedWebCloneRealtimeUpgrade('/api/v1/realtime?secret=x', validOrigin), true);
  assert.equal(isAllowedWebCloneRealtimeUpgrade('/v1/realtime', validOrigin), false);
  assert.equal(isAllowedWebCloneRealtimeUpgrade('/api/v1/realtime', 'https://example.invalid'), false);
});

test('Maps fixture is synthetic, exact-query, principal-bound and fails closed', async () => {
  const ownerToken = 'synthetic-owner-token';
  const renterToken = 'synthetic-renter-token';
  const boundPrincipalToken = async (token) => token === 'rotated-owner-token'
    || token === 'rotated-renter-token';
  const autocompleteInputs = [
    '/api/v1/maps/places/autocomplete?input=Heilbronn&language=de&country=de',
    '/api/v1/maps/places/autocomplete?input=Heilbronn+Hauptbahnhof&language=de&country=de',
  ];
  const autocomplete = autocompleteInputs[0];
  const details = '/api/v1/maps/places/sit-synthetic-heilbronn-v1?language=de';

  assert.equal((await resolveWebCloneMapsFixture({
    method: 'GET', requestPath: autocomplete, authorization: undefined,
    ownerToken, renterToken,
  })).status, 401);
  assert.equal((await resolveWebCloneMapsFixture({
    method: 'GET', requestPath: autocomplete, authorization: 'Bearer other-token',
    ownerToken, renterToken, isBoundPrincipalToken: boundPrincipalToken,
  })).status, 401);
  for (const requestPath of autocompleteInputs) {
    const suggestions = await resolveWebCloneMapsFixture({
      method: 'GET', requestPath, authorization: 'Bearer rotated-owner-token',
      ownerToken, renterToken, isBoundPrincipalToken: boundPrincipalToken,
    });
    assert.deepEqual(suggestions, { status: 200, body: { suggestions: [{
      description: 'Heilbronn, Deutschland', placeId: 'sit-synthetic-heilbronn-v1',
    }] } });
  }
  const place = await resolveWebCloneMapsFixture({
    method: 'GET', requestPath: details, authorization: `Bearer ${renterToken}`,
    ownerToken, renterToken, isBoundPrincipalToken: boundPrincipalToken,
  });
  assert.deepEqual(place, { status: 200, body: { place: {
    placeId: 'sit-synthetic-heilbronn-v1', formattedAddress: 'Heilbronn, Deutschland',
    lat: 49.1427, lng: 9.2109,
  } } });
  assert.equal((await resolveWebCloneMapsFixture({
    method: 'GET', requestPath: `${autocomplete}&extra=provider`, authorization: `Bearer ${ownerToken}`,
    ownerToken, renterToken, isBoundPrincipalToken: boundPrincipalToken,
  })).status, 404);
  assert.equal((await resolveWebCloneMapsFixture({
    method: 'GET',
    requestPath: '/api/v1/maps/places/autocomplete?input=Neckarsulm&language=de&country=de',
    authorization: `Bearer ${ownerToken}`,
    ownerToken, renterToken, isBoundPrincipalToken: boundPrincipalToken,
  })).status, 404);
  assert.equal((await resolveWebCloneMapsFixture({
    method: 'POST', requestPath: autocomplete, authorization: `Bearer ${ownerToken}`,
    ownerToken, renterToken, isBoundPrincipalToken: boundPrincipalToken,
  })).status, 405);
  assert.equal(await resolveWebCloneMapsFixture({
    method: 'GET', requestPath: '/api/v1/listings', authorization: `Bearer ${ownerToken}`,
    ownerToken, renterToken,
  }), null);
});
