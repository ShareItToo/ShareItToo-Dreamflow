import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN5RegionalPriceEngineV2 } from '../../tool/validate_blue_ocean_n5_regional_price_engine_v2.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n5-regional-price-engine-v2-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN5RegionalPriceEngineV2({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact isolated N5 regional price engine', () => {
  assert.deepEqual(validate(), {
    status: 'verified-ready-for-n6',
    categoryRuleCount: 6,
    nextPackage: 'N6',
  });
});

test('rejects price authority, category or rounding drift', () => {
  for (const [key, value] of [
    ['authority', 'AI_PROVIDER_PRICE'],
    ['categoryRuleCount', 5],
    ['roundingRule', 'FLOATING_POINT'],
  ]) {
    const changed = structuredClone(evidence);
    changed.engine[key] = value;
    assert.throws(() => validate(changed), /price authority, category or rounding/u);
  }
});

test('rejects synthetic learning, source, geography or robust-statistics drift', () => {
  for (const [key, value] of [
    ['syntheticLearningWeight', 1],
    ['shrinkageK', 4],
    ['externalAdapterImplemented', true],
  ]) {
    const changed = structuredClone(evidence);
    changed.marketEvidence[key] = value;
    assert.throws(() => validate(changed), /market evidence, source, geography/u);
  }
  const geography = structuredClone(evidence);
  geography.marketEvidence.geographyHierarchy.shift();
  assert.throws(() => validate(geography), /market evidence, source, geography/u);
});

test('rejects weakened owner, demand, duration or V5.2 truth', () => {
  for (const [section, key, value] of [
    ['recommendation', 'ownerConfirmationRequired', false],
    ['recommendation', 'demandRequestThreshold', 1],
    ['recommendation', 'demandOrIncomeGuaranteed', true],
    ['durationAndQuote', 'durationMarketDerivedClaim', true],
    ['durationAndQuote', 'quoteAuthority', 'AI_PROVIDER'],
    ['durationAndQuote', 'simulationOnly', false],
  ]) {
    const changed = structuredClone(evidence);
    changed[section][key] = value;
    assert.throws(() => validate(changed), /owner, confidence or demand|duration or V5\.2/u);
  }
});

test('rejects invented verification, historical rewrite or forbidden mutation', () => {
  const regression = structuredClone(evidence);
  regression.targetedVerification.backendSuite = 'passed-unknown';
  assert.throws(() => validate(regression), /verification record/u);

  const persistence = structuredClone(evidence);
  persistence.persistence.historicalListingsRewritten = true;
  assert.throws(() => validate(persistence), /persistence or rollback/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.externalObservationImported = true;
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
