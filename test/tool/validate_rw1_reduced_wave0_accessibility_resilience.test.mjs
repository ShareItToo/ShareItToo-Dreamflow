import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateRw1ReducedWave0AccessibilityResilience } from '../../tool/validate_rw1_reduced_wave0_accessibility_resilience.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/rw1-reduced-wave0-accessibility-resilience-20260825.json',
), 'utf8'));
const validate = (changed = evidence, sourceTexts) =>
  validateRw1ReducedWave0AccessibilityResilience({
    repositoryRoot: root,
    evidence: changed,
    sourceTexts,
  });

test('accepts the exact bounded RW1 matrix', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    allowedSurfaces: 6,
    excludedSurfaces: 5,
    resolvedFindings: 5,
    fullTechnicalRegression: evidence.verification.fullTechnicalRegression,
  });
});

test('rejects scope, predecessor or finding expansion', () => {
  const scope = structuredClone(evidence);
  scope.scope.viewportDp[0] = 321;
  assert.throws(() => validate(scope), /scope is invalid/u);
  const predecessor = structuredClone(evidence);
  predecessor.predecessor.closureCommit = '0'.repeat(40);
  assert.throws(() => validate(predecessor), /predecessor binding/u);
  const finding = structuredClone(evidence);
  finding.findings.pop();
  assert.throws(() => validate(finding), /finding set/u);
});

test('rejects contradictory regression or premature GitHub truth', () => {
  const regression = structuredClone(evidence);
  regression.verification.fullTechnicalRegression = 'pending';
  assert.throws(() => validate(regression), /verification truth/u);
  const github = structuredClone(evidence);
  github.status = 'implemented-full-technical-regression-passed-ci-pending';
  github.verification.githubRegression = 'pending';
  github.verification.githubCodeql = 'pending';
  delete github.githubVerification;
  github.githubVerification = { head: '0'.repeat(40) };
  assert.throws(() => validate(github), /must be absent/u);
});

test('rejects external gates and source drift', () => {
  const gate = structuredClone(evidence);
  gate.gates.BUILD_READY = 'granted';
  assert.throws(() => validate(gate), /gate or boundary/u);
  const entry = evidence.sourceInventory[0];
  assert.throws(
    () => validate(evidence, { [entry.path]: '// drift\n' }),
    /source inventory hash is stale/u,
  );
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/private/example';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
