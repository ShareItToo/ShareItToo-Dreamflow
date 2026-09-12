import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  validateR6PriceEnginePropertyStress,
} from '../../tool/validate_r6_price_engine_property_stress.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/r6-price-engine-property-stress-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateR6PriceEnginePropertyStress({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact GitHub-verified R6 property and PostgreSQL evidence', () => {
  assert.deepEqual(validate(), {
    status: 'verified-r6-regression-and-codeql-passed',
    stressCases: 2000,
    observationInputs: 16651,
    nextPackage: 'R7',
  });
});

test('rejects missing matrix coverage or a changed deterministic digest', () => {
  const matrix = structuredClone(evidence);
  matrix.requiredCoverage.roundingBoundaryCases = 1817;
  assert.throws(() => validate(matrix), /required coverage/u);

  const digest = structuredClone(evidence);
  digest.deterministicStress.outputDigestSha256 = '0'.repeat(64);
  assert.throws(() => validate(digest), /deterministic stress/u);
});

test('rejects a weakened Pareto correction or unreachable demand boundary', () => {
  const cap = structuredClone(evidence);
  cap.permanentCorrections.dominatedAggregateCapBasisPoints = 10000;
  assert.throws(() => validate(cap), /permanent corrections/u);

  const demand = structuredClone(evidence);
  demand.permanentCorrections.lowerDemandClampBasisPoints = 9500;
  assert.throws(() => validate(demand), /permanent corrections/u);
});

test('rejects migration rewrite or rollback overclaim', () => {
  const migration = structuredClone(evidence);
  migration.migrationVerification.rollbackRefusesWhenR6SnapshotExists = false;
  assert.throws(() => validate(migration), /migration verification/u);
});

test('rejects premature or changed GitHub claims', () => {
  const premature = structuredClone(evidence);
  premature.status = 'verified-local-r6-regression-passed-ci-pending';
  premature.verification.githubRegression = 'pending';
  premature.verification.githubCodeql = 'pending';
  premature.githubVerification = {};
  assert.throws(() => validate(premature), /must not claim GitHub/u);

  const changed = structuredClone(evidence);
  changed.githubVerification.codeql.newAlerts = 1;
  assert.throws(() => validate(changed), /exact GitHub verification/u);
});

test('rejects live changes, capacity claims or secret-shaped evidence', () => {
  const live = structuredClone(evidence);
  live.boundaries.productionChanged = true;
  assert.throws(() => validate(live), /live or data boundary/u);

  const capacity = structuredClone(evidence);
  capacity.limitations.productionCapacityClaimed = true;
  assert.throws(() => validate(capacity), /limitation record/u);

  const secret = structuredClone(evidence);
  secret.note = '/Users/example/private';
  assert.throws(() => validate(secret), /private or secret-shaped/u);
});
