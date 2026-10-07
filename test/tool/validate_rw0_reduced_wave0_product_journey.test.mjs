import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateRw0ReducedWave0ProductJourney } from '../../tool/validate_rw0_reduced_wave0_product_journey.mjs';

const root = resolve(import.meta.dirname, '../..');
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/48h-remote/rw0-reduced-wave0-product-journey-20260825.json',
), 'utf8'));

const validate = (changed = evidence, sourceTexts) =>
  validateRw0ReducedWave0ProductJourney({
    repositoryRoot: root,
    evidence: changed,
    sourceTexts,
  });

test('accepts the exact bounded RW0 journey', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    allowedSurfaces: 6,
    excludedSurfaces: 5,
    resolvedFindings: 6,
    fullTechnicalRegression: evidence.verification.fullTechnicalRegression,
  });
});

test('rejects scope or predecessor expansion', () => {
  const scope = structuredClone(evidence);
  scope.scope.excluded.pop();
  assert.throws(() => validate(scope), /scope is invalid/u);
  const predecessor = structuredClone(evidence);
  predecessor.predecessor.closureHead = '0'.repeat(40);
  assert.throws(() => validate(predecessor), /predecessor binding/u);
});

test('rejects a missing finding or contradictory regression state', () => {
  const finding = structuredClone(evidence);
  finding.findings.pop();
  assert.throws(() => validate(finding), /finding set/u);
  const verification = structuredClone(evidence);
  verification.verification.fullTechnicalRegression = 'pending';
  assert.throws(() => validate(verification), /verification truth/u);
});

test('rejects premature or incomplete exact GitHub verification', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-technical-regression-passed-ci-pending';
  premature.verification.githubRegression = 'pending';
  premature.verification.githubCodeql = 'pending';
  premature.githubVerification = { head: '0'.repeat(40) };
  assert.throws(() => validate(premature), /must be absent/u);

  const complete = structuredClone(evidence);
  complete.githubVerification = {
    head: '1'.repeat(40),
    regressionRunId: 1,
    codeqlRunId: 2,
    regressionConclusion: 'success',
    codeqlConclusion: 'success',
    openCodeScanningAlerts: 1,
  };
  assert.throws(() => validate(complete), /exact GitHub verification/u);
});

test('rejects a granted external gate', () => {
  const changed = structuredClone(evidence);
  changed.gates.PLAY_UPLOAD_APPROVED = 'granted';
  assert.throws(() => validate(changed), /gate or boundary/u);
});

test('rejects source drift even when filenames stay unchanged', () => {
  const entry = evidence.sourceInventory[0];
  assert.throws(
    () => validate(evidence, { [entry.path]: '// changed\n' }),
    /source inventory hash is stale/u,
  );
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/private/example';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
