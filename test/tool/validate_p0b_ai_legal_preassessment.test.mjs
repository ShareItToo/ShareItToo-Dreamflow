import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateP0bAiLegalPreassessment } from
  '../../tool/validate_p0b_ai_legal_preassessment.mjs';

const manifestUrl = new URL(
  '../../assets/legal/de/p0b-ai-preassessment-2026-09-14.1/manifest.json',
  import.meta.url,
);
const matrixUrl = new URL(
  '../../assets/legal/de/p0b-ai-preassessment-2026-09-14.1/02_decision_matrix.json',
  import.meta.url,
);

function manifestFixture() {
  return JSON.parse(readFileSync(manifestUrl, 'utf8'));
}

function matrixFixture() {
  return JSON.parse(readFileSync(matrixUrl, 'utf8'));
}

test('accepts the exact fail-closed 18-decision AI preassessment', () => {
  const result = validateP0bAiLegalPreassessment();
  assert.equal(result.decisionCount, 18);
  assert.deepEqual(result.decisionCounts, {
    ai_recommended: 1,
    ai_recommended_with_changes: 13,
    ai_hold_external_fact: 4,
  });
  assert.equal(result.professionalLegalApproval, false);
  assert.equal(result.realMoneyAllowed, false);
});

for (const mutate of [
  (manifest) => { manifest.gates.independentAstraCrosscheckComplete = true; },
  (manifest) => { manifest.gates.professionalLegalApproval = true; },
  (manifest) => { manifest.gates.realMoneyAllowed = true; },
  (manifest) => { manifest.assessment.decisionCount = 17; },
  (manifest) => { manifest.officialSources.push('https://example.com/legal'); },
]) {
  test('rejects approval, activation, incompleteness or secondary-source drift', () => {
    const manifest = manifestFixture();
    mutate(manifest);
    assert.throws(
      () => validateP0bAiLegalPreassessment({ manifest, matrix: matrixFixture() }),
      /P0B-L2/u,
    );
  });
}

test('rejects a professional approval-shaped decision', () => {
  const matrix = matrixFixture();
  matrix.decisions[0].decision = 'approved';
  assert.throws(
    () => validateP0bAiLegalPreassessment({
      manifest: manifestFixture(),
      matrix,
    }),
    /approval-shaped/u,
  );
});

test('rejects a closed professional decision', () => {
  const matrix = matrixFixture();
  matrix.decisions[0].professionalStatus = 'approved';
  assert.throws(
    () => validateP0bAiLegalPreassessment({
      manifest: manifestFixture(),
      matrix,
    }),
    /professional status/u,
  );
});

test('rejects source-integrity drift', () => {
  const manifest = manifestFixture();
  manifest.sourceInventory[
    'assets/legal/de/legal_manifest_v52.json'
  ] = '0'.repeat(64);
  assert.throws(
    () => validateP0bAiLegalPreassessment({ manifest, matrix: matrixFixture() }),
    /source inventory/u,
  );
});
