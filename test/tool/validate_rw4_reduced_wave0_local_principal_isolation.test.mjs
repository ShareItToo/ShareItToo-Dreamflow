import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validateRw4ReducedWave0LocalPrincipalIsolation,
} from '../../tool/validate_rw4_reduced_wave0_local_principal_isolation.mjs';

const root = new URL('../../', import.meta.url);
const evidencePath =
  'docs/evidence/48h-remote/rw4-reduced-wave0-local-principal-isolation-20260825.json';
const baseEvidence = JSON.parse(readFileSync(new URL(evidencePath, root), 'utf8'));
const clone = (value) => structuredClone(value);

function validate(evidence = clone(baseEvidence), sourceTexts = {}) {
  return validateRw4ReducedWave0LocalPrincipalIsolation({
    repositoryRoot: new URL('.', root).pathname,
    evidence,
    sourceTexts,
  });
}

test('accepts the exact bounded RW4 package', () => {
  assert.deepEqual(validate(), {
    status: 'verified-regression-and-codeql-passed',
    allowedSurfaces: 9,
    excludedSurfaces: 5,
    resolvedFindings: 9,
    fullTechnicalRegression: 'passed',
  });
});

test('rejects changed exact GitHub verification', () => {
  const head = clone(baseEvidence);
  head.githubVerification.head = '0'.repeat(40);
  assert.throws(() => validate(head), /exact GitHub verification/u);

  const alerts = clone(baseEvidence);
  alerts.githubVerification.openCodeScanningAlerts = 1;
  assert.throws(() => validate(alerts), /exact GitHub verification/u);
});

test('rejects a changed live gate or boundary', () => {
  const gate = clone(baseEvidence);
  gate.gates.BUILD_READY = 'granted';
  assert.throws(() => validate(gate), /gate or boundary truth/u);

  const boundary = clone(baseEvidence);
  boundary.boundaries.productionChanged = true;
  assert.throws(() => validate(boundary), /gate or boundary truth/u);
});

test('rejects contradictory full-regression verification', () => {
  const evidence = clone(baseEvidence);
  evidence.verification.fullTechnicalRegression = 'pending';
  assert.throws(() => validate(evidence), /verification truth/u);
});

test('rejects a stale source hash', () => {
  const path = 'lib/services/data_service.dart';
  assert.throws(
    () => validate(clone(baseEvidence), { [path]: '# changed\n' }),
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

test('rejects secret-shaped or private evidence', () => {
  const evidence = clone(baseEvidence);
  evidence.findings[0].resolution = 'contact-owner@example.invalid';
  assert.throws(() => validate(evidence), /private or secret-shaped/u);
});
