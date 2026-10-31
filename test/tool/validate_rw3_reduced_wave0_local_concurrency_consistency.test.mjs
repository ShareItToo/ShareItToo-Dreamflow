import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateRw3ReducedWave0LocalConcurrencyConsistency } from '../../tool/validate_rw3_reduced_wave0_local_concurrency_consistency.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/rw3-reduced-wave0-local-concurrency-consistency-20260825.json',
), 'utf8'));
const validate = (changed = evidence, sourceTexts) =>
  validateRw3ReducedWave0LocalConcurrencyConsistency({
    repositoryRoot: root,
    evidence: changed,
    sourceTexts,
  });

test('accepts the exact bounded RW3 package', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    allowedSurfaces: 8,
    excludedSurfaces: 5,
    resolvedFindings: 7,
    fullTechnicalRegression: evidence.verification.fullTechnicalRegression,
  });
});

test('rejects scope, predecessor or timing-workaround expansion', () => {
  const scope = structuredClone(evidence);
  scope.scope.timingWorkaroundAllowed = true;
  assert.throws(() => validate(scope), /scope or deterministic-test policy/u);
  const parallelism = structuredClone(evidence);
  parallelism.scope.testParallelismReductionAllowed = true;
  assert.throws(() => validate(parallelism), /scope or deterministic-test policy/u);
  const predecessor = structuredClone(evidence);
  predecessor.predecessor.closureCommit = '0'.repeat(40);
  assert.throws(() => validate(predecessor), /predecessor binding/u);
});

test('rejects finding or verification contradictions', () => {
  const finding = structuredClone(evidence);
  finding.findings.pop();
  assert.throws(() => validate(finding), /finding set/u);
  const regression = structuredClone(evidence);
  regression.verification.fullTechnicalRegression =
    evidence.verification.fullTechnicalRegression === 'passed' ? 'pending' : 'passed';
  assert.throws(() => validate(regression), /verification truth/u);
  const github = structuredClone(evidence);
  if (github.githubVerification === undefined) {
    github.githubVerification = { head: '0'.repeat(40) };
    assert.throws(() => validate(github), /must be absent/u);
  } else {
    github.githubVerification.openCodeScanningAlerts = 1;
    assert.throws(() => validate(github), /exact GitHub verification/u);
  }
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
