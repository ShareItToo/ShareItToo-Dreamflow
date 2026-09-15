import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateWp153PositionReviewReleaseParity } from '../../tool/validate_wp153_position_review_release_parity.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const evidencePath = resolve(
  repositoryRoot,
  'docs/evidence/release-readiness/wp153-position-review-release-parity-20260915.json',
);
const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));

test('accepts the source-bound inactive WP153 position-review package', () => {
  const result = validateWp153PositionReviewReleaseParity({ repositoryRoot });
  assert.equal(
    result.status,
    'technical-closure-full-regression-passed-v55-inactive-external-gates-hold',
  );
  assert.equal(result.successorVersion, 'V5.5-2026-09-15');
  assert.equal(result.exactBookingCaseRequired, true);
  assert.equal(result.bindingV55Allowed, false);
  assert.equal(result.realMoneyAllowed, false);
});

test('rejects a mutable-payload hold or a derived whole-group hold', () => {
  const value = structuredClone(evidence);
  value.invariants.mutablePayloadMayAuthorizeHold = true;
  value.invariants.unrelatedPositionsBlockedByDerivedGroupState = true;
  assert.throws(
    () => validateWp153PositionReviewReleaseParity({ repositoryRoot, evidence: value }),
    /invariants is invalid/u,
  );
});

test('rejects activation, missing legal correction or false regression evidence', () => {
  const value = structuredClone(evidence);
  value.decision.successorActivationAllowed = true;
  value.legalCorrections.addressed = [];
  value.verification.fullTechnicalRegression = 'claimed-green';
  assert.throws(
    () => validateWp153PositionReviewReleaseParity({ repositoryRoot, evidence: value }),
    /decision is invalid/u,
  );
});

test('rejects source drift and removal of the payout canonicalization', () => {
  const value = structuredClone(evidence);
  value.sourceInventory['backend/src/payment_workflow.js'] = '0'.repeat(64);
  assert.throws(
    () => validateWp153PositionReviewReleaseParity({ repositoryRoot, evidence: value }),
    /source inventory digest|source inventory backend/u,
  );

  const path = 'backend/src/payment_workflow.js';
  const source = readFileSync(resolve(repositoryRoot, path), 'utf8')
    .replace('canonicalPositionReviewHold({', 'removedPositionReviewHold({');
  assert.throws(
    () => validateWp153PositionReviewReleaseParity({
      repositoryRoot,
      sourceTexts: { [path]: source },
    }),
    /implementation is missing canonicalPositionReviewHold/u,
  );
});

test('retains V5.4, V5.5 and WP153 in the complete technical gate', () => {
  const regression = readFileSync(
    resolve(repositoryRoot, 'scripts/technical_regression_check.sh'),
    'utf8',
  );
  for (const marker of [
    'node tool/validate_v54_legal_assets.mjs',
    'node tool/validate_wp152_v54_contract_draft.mjs',
    'node tool/validate_v55_legal_assets.mjs',
    'node tool/validate_wp153_position_review_release_parity.mjs',
  ]) {
    assert.match(regression, new RegExp(marker.replaceAll('.', '\\.')));
  }
});
