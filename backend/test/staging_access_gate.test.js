import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  isStagingUserAllowed,
  readStagingAccessConfiguration,
  stagingActionTokenOwnerAllowed,
  stagingAnonymousPathAllowed,
  stagingGuestListingAllowed,
  stagingGuestUploadAllowed,
  stagingWebhookPathAllowed,
} from '../src/staging_access_gate.js';

const validEnvironment = {
  DEPLOYMENT_ENVIRONMENT: 'test',
  SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  SIT_STAGING_ALLOWED_USER_IDS: 'synthetic-owner-a,synthetic-renter-b',
  SIT_STAGING_PUBLIC_LISTING_IDS: 'synthetic-listing-001',
  SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'fixture-full.webp,fixture-thumb.webp',
};

test('staging cohort configuration is exact and fail-closed', () => {
  const configuration = readStagingAccessConfiguration(validEnvironment);
  assert.equal(configuration.enabled, true);
  assert.equal(configuration.valid, true);
  assert.equal(isStagingUserAllowed(configuration, 'synthetic-owner-a'), true);
  assert.equal(isStagingUserAllowed(configuration, 'foreign-user'), false);
  assert.equal(stagingGuestListingAllowed(configuration, 'synthetic-listing-001'), true);
  assert.equal(stagingGuestListingAllowed(configuration, 'foreign-listing'), false);
  assert.equal(stagingGuestUploadAllowed(configuration, 'fixture-full.webp'), true);
  assert.equal(stagingGuestUploadAllowed(configuration, 'foreign.webp'), false);
});

test('HTML action-token owner check accepts only a live allowlisted owner', () => {
  const configuration = readStagingAccessConfiguration(validEnvironment);
  const now = new Date('2026-09-18T10:00:00.000Z');
  const live = {
    id: 'synthetic-owner-a',
    expires_at: new Date('2026-09-18T10:30:00.000Z'),
    consumed_at: null,
  };
  assert.equal(stagingActionTokenOwnerAllowed(configuration, live, { now }), true);
  assert.equal(stagingActionTokenOwnerAllowed(configuration, {
    ...live,
    id: 'foreign-user',
  }, { now }), false);
  assert.equal(stagingActionTokenOwnerAllowed(configuration, {
    ...live,
    expires_at: new Date('2026-09-18T09:59:59.000Z'),
  }, { now }), false);
  assert.equal(stagingActionTokenOwnerAllowed(configuration, {
    ...live,
    consumed_at: new Date('2026-09-18T09:59:00.000Z'),
  }, { now }), false);
  assert.equal(stagingActionTokenOwnerAllowed(configuration, null, { now }), false);
});

test('empty, malformed and production configurations cannot open protected access', () => {
  const empty = readStagingAccessConfiguration({
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  });
  assert.equal(empty.valid, false);
  assert.equal(isStagingUserAllowed(empty, 'synthetic-owner-a'), false);
  assert.equal(stagingAnonymousPathAllowed(empty, { method: 'GET', path: '/version' }), false);

  const malformed = readStagingAccessConfiguration({
    ...validEnvironment,
    SIT_STAGING_ALLOWED_USER_IDS: 'owner with spaces',
  });
  assert.equal(malformed.valid, false);
  assert.equal(isStagingUserAllowed(malformed, 'synthetic-owner-a'), false);
  assert.throws(
    () => readStagingAccessConfiguration({
      ...validEnvironment,
      DEPLOYMENT_ENVIRONMENT: 'production',
    }),
    /forbidden in production/u,
  );
});

test('anonymous surface is a minimal exact route matrix', () => {
  const configuration = readStagingAccessConfiguration(validEnvironment);
  for (const path of ['/health/live', '/health/ready', '/version']) {
    assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'GET', path }), true);
    assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'HEAD', path }), true);
  }
  assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'GET', path: '/v1/listings' }), true);
  assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'GET', path: '/v1/uploads/fixture-full.webp' }), true);
  for (const path of [
    '/v1/payments/connect/return',
    '/v1/open/payment/booking-1',
    '/v1/payments/technical-sandbox/success',
    '/v1/payments/technical-sandbox/cancel',
  ]) {
    assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'GET', path }), true);
    assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'HEAD', path }), true);
  }
  for (const path of ['/v1/auth/password-reset/form', '/v1/account-deletion/confirm']) {
    assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'GET', path }), true);
    assert.equal(stagingAnonymousPathAllowed(configuration, { method: 'POST', path }), true);
  }
  for (const request of [
    { method: 'GET', path: '/v1/public/privacy' },
    { method: 'GET', path: '/v1/profiles/wp254-green-owner' },
    { method: 'POST', path: '/v1/listings' },
    { method: 'GET', path: '/v1/admin/overview' },
    { method: 'POST', path: '/v1/payments/webhook' },
    { method: 'GET', path: '/v1/payments/technical-sandbox/success/extra' },
    { method: 'GET', path: '/v1/payments/technical-sandbox/unknown' },
  ]) {
    assert.equal(stagingAnonymousPathAllowed(configuration, request), false, `${request.method} ${request.path}`);
  }
});

test('only the signed provider webhook POSTs bypass the user JWT gate', () => {
  assert.equal(stagingWebhookPathAllowed({ method: 'POST', path: '/v1/payments/webhook' }), true);
  assert.equal(stagingWebhookPathAllowed({ method: 'POST', path: '/v1/identity-verification/webhook' }), true);
  assert.equal(stagingWebhookPathAllowed({ method: 'POST', path: '/v1/payments/technical-sandbox/webhook' }), true);
  for (const request of [
    { method: 'GET', path: '/v1/payments/webhook' },
    { method: 'POST', path: '/v1/payments/webhook/' },
    { method: 'POST', path: '/v1/auth/login' },
    { method: 'POST', path: '/v1/identity-verification/webhook/foreign' },
    { method: 'POST', path: '/v1/payments/technical-sandbox/webhook/' },
  ]) {
    assert.equal(stagingWebhookPathAllowed(request), false, `${request.method} ${request.path}`);
  }
});

test('implementation keeps the gate before webhook routes and on token auth', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const securitySource = fs.readFileSync(new URL('../src/security.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('app.use(stagingAccessIpLimiter)') < source.indexOf('app.use(stagingAccessMiddleware)'));
  assert.ok(source.indexOf('app.use(stagingAccessMiddleware)') < source.indexOf("app.post('/v1/payments/webhook'"));
  assert.match(securitySource, /config\.stagingAccess\.enabled && !isStagingUserAllowed\(config\.stagingAccess, payload\.sub\)/u);
  assert.match(source, /stagingGuestUploadAllowed\(config\.stagingAccess, storageName\)/u);
  assert.match(source, /stagingWebhookPathAllowed\(\{ method: req\.method, path: req\.path \}\)/u);
  assert.match(source, /publicListingIds: config\.stagingAccess\.enabled/u);
  assert.match(source, /app\.post\('\/v1\/auth\/password-reset\/form'/u);
  assert.match(source, /app\.post\('\/v1\/account-deletion\/confirm'/u);
  assert.match(source, /stagingActionTokenOwnerAllowed\(config\.stagingAccess, row\)/u);
});
