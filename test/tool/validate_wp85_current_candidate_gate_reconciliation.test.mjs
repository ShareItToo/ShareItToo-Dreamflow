import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWp85CurrentCandidateGateReconciliation } from
  '../../tool/validate_wp85_current_candidate_gate_reconciliation.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidencePath = resolve(
  root,
  'docs/evidence/release-readiness/wp85-current-candidate-gate-reconciliation-20260910.json',
);
const regressionPath = resolve(root, 'scripts/technical_regression_check.sh');

function evidence() {
  return JSON.parse(readFileSync(evidencePath, 'utf8'));
}

test('reconciles the current candidate without promoting owner gates', () => {
  assert.deepEqual(validateWp85CurrentCandidateGateReconciliation(), {
    status: 'complete-evidence-reconciled-owner-gates-open',
    candidateVersionCode: '2026090905',
    passCount: 12,
    partialCount: 11,
    openCount: 9,
  });
});

test('is wired into complete technical regression', () => {
  const regression = readFileSync(regressionPath, 'utf8');
  assert.match(regression, /node --check tool\/validate_wp85_current_candidate_gate_reconciliation\.mjs/u);
  assert.match(regression, /node --test test\/tool\/validate_wp85_current_candidate_gate_reconciliation\.test\.mjs/u);
  assert.match(regression, /node tool\/validate_wp85_current_candidate_gate_reconciliation\.mjs/u);
});

test('rejects a premature owner-gate or production promotion', () => {
  const value = evidence();
  value.nextActions[0].delegatedToCodex = true;
  assert.throws(
    () => validateWp85CurrentCandidateGateReconciliation({ evidence: value, checkSources: false }),
    /next-action boundary/u,
  );

  const promoted = evidence();
  promoted.reconciliation.production = true;
  assert.throws(
    () => validateWp85CurrentCandidateGateReconciliation({ evidence: promoted, checkSources: false }),
    /reconciliation truth/u,
  );
});

test('rejects source drift and secret-shaped evidence', () => {
  assert.throws(
    () => validateWp85CurrentCandidateGateReconciliation({
      sourceTexts: { 'docs/evidence/release-readiness/wp75-current-candidate-pixel-staging-20260909.json': 'drift' },
    }),
    /source hash drift/u,
  );
  const value = evidence();
  value.note = 'sk_test_placeholder';
  assert.throws(
    () => validateWp85CurrentCandidateGateReconciliation({ evidence: value, checkSources: false }),
    /secret-shaped/u,
  );
});
