import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN3ListingAiGateway } from '../../tool/validate_blue_ocean_n3_listing_ai_gateway.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n3-listing-ai-gateway-20260823.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN3ListingAiGateway({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact non-live N3 gateway', () => {
  assert.deepEqual(validate(), {
    status: 'verified-ready-for-n4',
    strictFieldCount: 13,
    nextPackage: 'N4',
  });
});

test('rejects external execution, provider tools and provider price authority', () => {
  for (const key of [
    'externalProviderExecutionAllowed',
    'providerToolsAllowed',
    'authoritativeProviderPriceAllowed',
  ]) {
    const changed = structuredClone(evidence);
    changed.gateway[key] = true;
    assert.throws(() => validate(changed), /gateway contract/u);
  }
});

test('rejects weakened fallback, idempotency and audit boundaries', () => {
  for (const key of [
    'manualFallbackPreservesPhotos',
    'manualFallbackCreatesNoPartialAiState',
    'exactReplayCallsProviderOnce',
    'auditExcludesRawOcrAndProviderErrors',
  ]) {
    const changed = structuredClone(evidence);
    changed.safetyContracts[key] = false;
    assert.throws(() => validate(changed), /safety contract/u);
  }
});

test('rejects invented provider adapter, model, key or call evidence', () => {
  for (const key of ['adapterImplemented', 'modelSelected', 'apiKeyConfigured', 'providerCallPerformed']) {
    const changed = structuredClone(evidence);
    changed.officialDocumentationReview[key] = true;
    assert.throws(() => validate(changed), /documentation review boundary/u);
  }
});

test('rejects invented regression completion and forbidden mutation', () => {
  const regression = structuredClone(evidence);
  regression.targetedVerification.backendSuite = 'pending';
  assert.throws(() => validate(regression), /verification record/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.billingActivated = true;
  assert.throws(() => validate(mutation), /mutation boundary/u);
});

test('rejects an invalid exact GitHub verification binding', () => {
  const changed = structuredClone(evidence);
  changed.exactGitHubVerification.headSha = '0000000000000000000000000000000000000000';
  assert.throws(() => validate(changed), /exact GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
