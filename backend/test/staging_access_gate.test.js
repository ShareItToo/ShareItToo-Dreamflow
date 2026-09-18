import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  isStagingUserAllowed,
  readStagingAccessConfiguration,
  stagingAnonymousPathAllowed,
  stagingGuestListingAllowed,
  stagingGuestUploadAllowed,
} from '../src/staging_access_gate.js';

const validEnvironment = {
  DEPLOYMENT_ENVIRONMENT: 'test',
  SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  SIT_STAGING_ALLOWED_USER_IDS: 'wp254-green-owner,wp254-green-renter',
  SIT_STAGING_PUBLIC_LISTING_IDS: 'wp254-green-listing-001',
  SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'fixture-full.webp,fixture-thumb.webp',
};

test('staging cohort configuration is exact and fail-closed', () => {
  const configuration = readStagingAccessConfiguration(validEnvironment);
  assert.equal(configuration.enabled, true);
  assert.equal(configuration.valid, true);
  assert.equal(isStagingUserAllowed(configuration, 'wp254-green-owner'), true);
  assert.equal(isStagingUserAllowed(configuration, 'foreign-user'), false);
  assert.equal(stagingGuestListingAllowed(configuration, 'wp254-green-listing-001'), true);
  assert.equal(stagingGuestListingAllowed(configuration, 'foreign-listing'), false);
  assert.equal(stagingGuestUploadAllowed(configuration, 'fixture-full.webp'), true);
  assert.equal(stagingGuestUploadAllowed(configuration, 'foreign.webp'), false);
});

test('empty, malformed and production configurations cannot open protected access', () => {
  const empty = readStagingAccessConfiguration({
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  });
  assert.equal(empty.valid, false);
  assert.equal(isStagingUserAllowed(empty, 'wp254-green-owner'), false);
  assert.equal(stagingAnonymousPathAllowed(empty, { method: 'GET', path: '/version' }), false);

  const malformed = readStagingAccessConfiguration({
    ...validEnvironment,
    SIT_STAGING_ALLOWED_USER_IDS: 'owner with spaces',
  });
  assert.equal(malformed.valid, false);
  assert.equal(isStagingUserAllowed(malformed, 'wp254-green-owner'), false);
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
  for (const request of [
    { method: 'GET', path: '/v1/public/privacy' },
    { method: 'GET', path: '/v1/profiles/wp254-green-owner' },
    { method: 'POST', path: '/v1/listings' },
    { method: 'GET', path: '/v1/admin/overview' },
    { method: 'POST', path: '/v1/payments/webhook' },
  ]) {
    assert.equal(stagingAnonymousPathAllowed(configuration, request), false, `${request.method} ${request.path}`);
  }
});

test('implementation keeps the gate before webhook routes and on token auth', () => {
  const source = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const securitySource = fs.readFileSync(new URL('../src/security.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('app.use(stagingAccessMiddleware)') < source.indexOf("app.post('/v1/payments/webhook'"));
  assert.match(securitySource, /config\.stagingAccess\.enabled && !isStagingUserAllowed\(config\.stagingAccess, payload\.sub\)/u);
  assert.match(source, /stagingGuestUploadAllowed\(config\.stagingAccess, storageName\)/u);
  assert.match(source, /publicListingIds: config\.stagingAccess\.enabled/u);
});
