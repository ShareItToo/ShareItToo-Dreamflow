import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateP0bAstraAiLegalCrosscheck } from
  '../../tool/validate_p0b_astra_ai_legal_crosscheck.mjs';

const manifestUrl = new URL(
  '../../assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/manifest.json',
  import.meta.url,
);
const matrixUrl = new URL(
  '../../assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/02_verdict_matrix.json',
  import.meta.url,
);
const reportUrl = new URL(
  '../../assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/01_crosscheck_result.md',
  import.meta.url,
);

function manifestFixture() {
  return JSON.parse(readFileSync(manifestUrl, 'utf8'));
}

function matrixFixture() {
  return JSON.parse(readFileSync(matrixUrl, 'utf8'));
}

function reportFixture() {
  return readFileSync(reportUrl, 'utf8');
}

test('accepts the exact normalized fail-closed Astra crosscheck', () => {
  const result = validateP0bAstraAiLegalCrosscheck();
  assert.equal(result.outcome, 'CORRECTIONS_REQUIRED');
  assert.deepEqual(result.verdictCounts, {
    CONFIRM: 3,
    CORRECT: 12,
    INSUFFICIENT_EVIDENCE: 3,
  });
  assert.equal(result.professionalLegalApproval, false);
  assert.equal(result.realMoneyAllowed, false);
  assert.equal(result.crosscheckScopeComplete, false);
});

for (const mutate of [
  (manifest) => { manifest.gates.professionalLegalApproval = true; },
  (manifest) => { manifest.gates.realMoneyAllowed = true; },
  (manifest) => { manifest.gates.crosscheckScopeComplete = true; },
  (manifest) => { manifest.result.decisionDetailComplete = true; },
  (manifest) => { manifest.officialSourceScope = 'all-verdicts'; },
  (manifest) => { manifest.result.outcome = 'CONFIRM'; },
  (manifest) => { manifest.sourceAssessment.sourceCommit = '0'.repeat(40); },
  (manifest) => { manifest.result.verdictCounts.CORRECT = 11; },
]) {
  test('rejects opened gates, outcome, source or count drift', () => {
    const manifest = manifestFixture();
    mutate(manifest);
    assert.throws(() => validateP0bAstraAiLegalCrosscheck({
      manifest,
      matrix: matrixFixture(),
      report: reportFixture(),
    }), /P0B-L3/u);
  });
}

test('rejects verdict order, duplicate, priority and open-status drift', () => {
  for (const mutate of [
    (matrix) => { matrix.decisions.reverse(); },
    (matrix) => { matrix.decisions[1].key = matrix.decisions[0].key; },
    (matrix) => { matrix.decisions[0].priority = 'P1'; },
    (matrix) => { matrix.decisions[0].professionalStatus = 'approved'; },
    (matrix) => { matrix.insufficientEvidenceKeys.pop(); },
  ]) {
    const matrix = matrixFixture();
    mutate(matrix);
    assert.throws(() => validateP0bAstraAiLegalCrosscheck({
      manifest: manifestFixture(),
      matrix,
      report: reportFixture(),
    }), /P0B-L3/u);
  }
});

test('rejects source and result artifact hash drift', () => {
  for (const mutate of [
    (manifest) => {
      manifest.sourceAssessment.sourceInventory[
        'assets/legal/de/p0b-ai-preassessment-2026-09-14.1/manifest.json'
      ] = '0'.repeat(64);
    },
    (manifest) => {
      manifest.artifactInventory[
        'assets/legal/de/p0b-astra-ai-crosscheck-2026-09-14.1/01_crosscheck_result.md'
      ] = '0'.repeat(64);
    },
  ]) {
    const manifest = manifestFixture();
    mutate(manifest);
    assert.throws(() => validateP0bAstraAiLegalCrosscheck({
      manifest,
      matrix: matrixFixture(),
      report: reportFixture(),
    }), /P0B-L3/u);
  }
});

test('rejects missing normalization limitation or private-shaped content', () => {
  for (const report of [
    reportFixture().replace('vollständige rohe Modellantwort', 'Detailantwort'),
    reportFixture() + '\n/private/Users/example\n',
  ]) {
    assert.throws(() => validateP0bAstraAiLegalCrosscheck({
      manifest: manifestFixture(),
      matrix: matrixFixture(),
      report,
    }), /P0B-L3/u);
  }
});
