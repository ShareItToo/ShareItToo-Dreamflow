import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateWp79CurrentCandidateAcceptanceMatrix,
} from '../../tool/validate_wp79_current_candidate_acceptance_matrix.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/release-readiness/wp79-current-candidate-acceptance-matrix-20260909.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateWp79CurrentCandidateAcceptanceMatrix({
    repositoryRoot: root,
    evidence: changed,
    checkGitState: false,
  });
}

test('accepts the conservative 2026090905 acceptance matrix', () => {
  assert.deepEqual(validate(), {
    status: 'complete-current-source-github',
    candidateVersionCode: '2026090905',
    passCount: 12,
    partialCount: 11,
    openCount: 9,
    nextPackage: 'WP80',
  });
});

test('rejects current-candidate, source and delta drift', () => {
  const candidate = structuredClone(evidence);
  candidate.candidate.versionCode = '2026090906';
  assert.throws(() => validate(candidate), /candidate binding/u);

  const source = structuredClone(evidence);
  source.sourceInventory[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(source), /source hash drift/u);

  const delta = structuredClone(evidence);
  delta.candidateDelta.mobileDelta = 'unknown';
  assert.throws(() => validate(delta), /candidate delta/u);

  const parity = structuredClone(evidence);
  parity.currentSourceCandidateParity.currentSourceMayNotBeClaimedAsInstalledCandidate = false;
  assert.throws(() => validate(parity), /source candidate parity/u);

  const ciMetadata = structuredClone(evidence);
  ciMetadata.localCurrentSourceCiMetadataRegression.mode = 'installed-candidate';
  assert.throws(() => validate(ciMetadata), /CI-metadata regression/u);
});

test('rejects PASS promotion, unresolved ambiguity and release overclaim', () => {
  const promotion = structuredClone(evidence);
  promotion.requirements.find((entry) => entry.id === 'stripe-sandbox-payment-refund-simulated-payout').state = 'PASS';
  assert.throws(() => validate(promotion), /state or order/u);

  const incomplete = structuredClone(evidence);
  incomplete.requirements.find((entry) => entry.state === 'PARTIAL').remaining = null;
  assert.throws(() => validate(incomplete), /remaining condition/u);

  const release = structuredClone(evidence);
  release.aggregate.releaseDecision = 'go';
  assert.throws(() => validate(release), /aggregate/u);
});

test('rejects external mutation and private-shaped evidence', () => {
  const mutation = structuredClone(evidence);
  mutation.boundaries.paymentProviderCalled = true;
  assert.throws(() => validate(mutation), /boundary/u);

  const privateValue = structuredClone(evidence);
  privateValue.note = '/Users/example/private';
  assert.throws(() => validate(privateValue), /private or secret-shaped/u);
});
