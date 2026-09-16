import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN6ListingWorkflow } from '../../tool/validate_blue_ocean_n6_listing_workflow.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n6-listing-workflow-20260824.json',
), 'utf8'));

function validate(changed = evidence) {
  return validateBlueOceanN6ListingWorkflow({ repositoryRoot: root, evidence: changed });
}

test('accepts the exact default-off N6 listing workflow', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    ownerConfirmationCount: 11,
    nextPackage: 'N7',
  });
});

test('rejects workflow, readiness, price or publication authority drift', () => {
  for (const [key, changedValue] of [
    ['ownerConfirmationCount', 10],
    ['priceAuthority', 'AI_PROVIDER'],
    ['automaticPublicationAllowed', true],
    ['explicitPublicationAction', 'continue'],
  ]) {
    const changed = structuredClone(evidence);
    changed.workflow[key] = changedValue;
    assert.throws(() => validate(changed), /workflow, readiness or publication/u);
  }
});

test('rejects a live default, real scanner claim or weakened fallback', () => {
  for (const [key, changedValue] of [
    ['flutterGateDefaultEnabled', true],
    ['defaultVisualScreenCompleted', true],
    ['manualEditorPreserved', false],
    ['automaticRetryAllowed', true],
  ]) {
    const changed = structuredClone(evidence);
    changed.accessAndFailure[key] = changedValue;
    assert.throws(() => validate(changed), /access or safe-fallback/u);
  }
});

test('rejects owner-review, accessibility, persistence or rollback weakening', () => {
  const review = structuredClone(evidence);
  review.ownerReview.functionalityConfirmationBlocks = false;
  assert.throws(() => validate(review), /owner-review or accessibility/u);

  const persistence = structuredClone(evidence);
  persistence.persistence.publicationAtomicWithListing = false;
  assert.throws(() => validate(persistence), /persistence, atomicity or rollback/u);
});

test('rejects forbidden mutation claims and invented verification', () => {
  const mutation = structuredClone(evidence);
  mutation.boundaries.paidCallPerformed = true;
  assert.throws(() => validate(mutation), /mutation boundary/u);

  const verification = structuredClone(evidence);
  verification.targetedVerification.backendSuite = 'passed-unknown';
  assert.throws(() => validate(verification), /verification record/u);
});

test('rejects premature or malformed GitHub evidence', () => {
  const premature = structuredClone(evidence);
  premature.status = 'implemented-full-regression-passed-ci-pending';
  premature.targetedVerification.githubRegression = 'pending';
  premature.targetedVerification.githubCodeql = 'pending';
  premature.exactGitHubVerification = {
    headSha: '0'.repeat(40),
    regressionRunId: 1,
    regressionConclusion: 'success',
    codeqlRunId: 2,
    codeqlConclusion: 'success',
  };
  assert.throws(() => validate(premature), /cannot bind exact GitHub/u);

  const final = structuredClone(evidence);
  final.exactGitHubVerification.headSha = 'bad';
  assert.throws(() => validate(final), /exact GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
