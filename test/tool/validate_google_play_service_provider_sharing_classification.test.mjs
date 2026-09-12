import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateGooglePlayServiceProviderSharingClassification } from
  '../../tool/validate_google_play_service_provider_sharing_classification.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const classification = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json',
), 'utf8'));
const privacy = JSON.parse(readFileSync(resolve(root, 'store/privacy-disclosures.json'), 'utf8'));
const clone = (value) => structuredClone(value);

test('accepts the complete technical classification while keeping console authority closed', () => {
  assert.deepEqual(validateGooglePlayServiceProviderSharingClassification({
    root,
    allowCandidateRollover: true,
  }), {
    services: 8,
    activeProcessors: 5,
    preparedOverallSharingAnswer:
      'no-subject-to-owner-contract-acceptance-and-legal-approval',
    consoleAnswerAllowed: false,
  });
});

test('keeps provider classification in the permanent regression gate', () => {
  const regression = readFileSync(resolve(root, 'scripts/technical_regression_check.sh'), 'utf8');
  for (const command of [
    'node --check tool/validate_google_play_service_provider_sharing_classification.mjs',
    'node --test test/tool/validate_google_play_service_provider_sharing_classification.test.mjs',
    'node tool/validate_google_play_service_provider_sharing_classification.mjs --allow-candidate-rollover',
  ]) {
    assert.ok(regression.includes(command), `missing regression command: ${command}`);
  }
});

test('keeps strict candidate binding unless rollover is explicit', () => {
  assert.throws(
    () => validateGooglePlayServiceProviderSharingClassification({ root }),
    /not bound to the exact candidate/,
  );
});

test('rejects treating Maps as a service provider in the bound candidate', () => {
  const changed = clone(classification);
  changed.services.find((entry) => entry.id === 'googleMapsPlatform').technicalRole = 'processor';
  assert.throws(
    () => validateGooglePlayServiceProviderSharingClassification({
      root,
      classification: changed,
      privacy,
      allowCandidateRollover: true,
    }),
    /Google Maps/,
  );
});

test('rejects removing the active phone-verification transfer', () => {
  const changed = clone(classification);
  changed.services.find((entry) => entry.id === 'firebaseAuthentication')
    .actualCandidateTransfers = [];
  assert.throws(
    () => validateGooglePlayServiceProviderSharingClassification({
      root,
      classification: changed,
      privacy,
      allowCandidateRollover: true,
    }),
    /Firebase Authentication/,
  );
});

test('rejects opening the Play answer without owner and legal approval', () => {
  const changed = clone(classification);
  changed.technicalConclusion.consoleAnswerAllowed = true;
  changed.blockingGates.consoleDraftSaveAllowed = true;
  assert.throws(
    () => validateGooglePlayServiceProviderSharingClassification({
      root,
      classification: changed,
      privacy,
      allowCandidateRollover: true,
    }),
    /never authorize|must remain closed/,
  );
});

test('rejects private account details in the sanitized classification', () => {
  const changed = clone(classification);
  changed.privateContact = 'private@example.test';
  assert.throws(
    () => validateGooglePlayServiceProviderSharingClassification({
      root,
      classification: changed,
      privacy,
      allowCandidateRollover: true,
    }),
    /sanitized/,
  );
});
