import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw5LocalSafetyPrivacyPrincipalIsolation,
} from '../../tool/validate_rw5_local_safety_privacy_principal_isolation.mjs';

const root = new URL('../../', import.meta.url);
const evidencePath =
  'docs/evidence/48h-remote/rw5-local-safety-privacy-principal-isolation-20260825.json';
const baseEvidence = JSON.parse(
  readFileSync(new URL(evidencePath, root), 'utf8'),
);
const clone = (value) => structuredClone(value);

function validate(evidence = clone(baseEvidence), sourceTexts = {}) {
  return validateRw5LocalSafetyPrivacyPrincipalIsolation({
    repositoryRoot: new URL('.', root).pathname,
    evidence,
    sourceTexts,
  });
}

test('accepts the exact bounded RW5 package', () => {
  assert.deepEqual(validate(), {
    status: 'verified-regression-and-codeql-passed',
    allowedSurfaces: 11,
    excludedSurfaces: 5,
    resolvedFindings: 10,
    fullTechnicalRegression: 'passed',
  });
});

test('rejects a changed live gate or boundary', () => {
  const gate = clone(baseEvidence);
  gate.gates.BUILD_READY = 'granted';
  assert.throws(() => validate(gate), /gate or boundary truth/u);

  const boundary = clone(baseEvidence);
  boundary.boundaries.productionChanged = true;
  assert.throws(() => validate(boundary), /gate or boundary truth/u);
});

test('rejects premature full regression or GitHub claims', () => {
  const regression = clone(baseEvidence);
  regression.status =
    'implemented-focused-matrix-passed-full-technical-regression-pending';
  assert.throws(() => validate(regression), /verification truth/u);

  const github = clone(baseEvidence);
  github.githubVerification.head = '0'.repeat(40);
  assert.throws(() => validate(github), /GitHub verification is invalid/u);
});

test('rejects a stale source hash', () => {
  const path = 'lib/services/local_safety_privacy_service.dart';
  assert.throws(
    () => validate(clone(baseEvidence), { [path]: '// changed\n' }),
    /source inventory hash is stale/u,
  );
});

test('rejects reordered or missing source inventory', () => {
  const reordered = clone(baseEvidence);
  reordered.sourceInventory.reverse();
  assert.throws(() => validate(reordered), /source inventory paths/u);

  const missing = clone(baseEvidence);
  missing.sourceInventory.pop();
  assert.throws(() => validate(missing), /source inventory paths/u);
});

test('rejects nondeterministic workaround authorization', () => {
  const timing = clone(baseEvidence);
  timing.scope.timingWorkaroundAllowed = true;
  assert.throws(() => validate(timing), /deterministic-test policy/u);

  const parallelism = clone(baseEvidence);
  parallelism.scope.testParallelismReductionAllowed = true;
  assert.throws(() => validate(parallelism), /deterministic-test policy/u);
});

test('rejects secret-shaped or private evidence', () => {
  const evidence = clone(baseEvidence);
  evidence.findings[0].resolution = 'contact-owner@example.invalid';
  assert.throws(() => validate(evidence), /private or secret-shaped/u);
});
