import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateGoogleMapsActivation } from '../src/google_maps_activation.js';

const complete = Object.freeze({
  GOOGLE_MAPS_ACTIVATION_APPROVED: 'true',
  GOOGLE_MAPS_SERVER_API_KEY: `AIza${'x'.repeat(32)}`,
  GOOGLE_MAPS_PROVIDER_NAME: 'verified-provider-fixture',
  GOOGLE_MAPS_PURPOSE: 'user-initiated-address-completion',
  GOOGLE_MAPS_DATA_FIELDS: 'address-query,place-id,formatted-address,coordinates',
  GOOGLE_MAPS_PROCESSING_REGIONS: 'verified-region-fixture',
  GOOGLE_MAPS_TRANSFER_MECHANISM: 'verified-transfer-fixture',
  GOOGLE_MAPS_DPA_ACCEPTED_DATE: '2026-08-20',
});

test('Google Maps stays disabled when approval is absent even if a key exists', () => {
  const result = evaluateGoogleMapsActivation({
    ...complete,
    GOOGLE_MAPS_ACTIVATION_APPROVED: 'false',
  });
  assert.equal(result.enabled, false);
  assert.equal(result.serverApiKey, '');
});

test('approved Google Maps activation requires every provider and transfer fact', () => {
  const incomplete = { ...complete };
  delete incomplete.GOOGLE_MAPS_TRANSFER_MECHANISM;
  assert.throws(
    () => evaluateGoogleMapsActivation(incomplete),
    /GOOGLE_MAPS_TRANSFER_MECHANISM/u,
  );
});

test('complete approved fixture enables only the server credential path', () => {
  const result = evaluateGoogleMapsActivation(complete);
  assert.equal(result.enabled, true);
  assert.equal(result.activationApproved, true);
  assert.equal(result.providerFactsComplete, true);
  assert.equal(result.serverApiKey, complete.GOOGLE_MAPS_SERVER_API_KEY);
});

test('malformed DPA dates fail closed without echoing credentials', () => {
  assert.throws(
    () => evaluateGoogleMapsActivation({
      ...complete,
      GOOGLE_MAPS_DPA_ACCEPTED_DATE: 'today',
    }),
    (error) => error.message.includes('GOOGLE_MAPS_DPA_ACCEPTED_DATE') &&
      !error.message.includes(complete.GOOGLE_MAPS_SERVER_API_KEY),
  );
});
