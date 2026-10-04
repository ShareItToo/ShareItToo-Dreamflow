import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBlueOceanN7EvaluationCorpus } from '../../tool/validate_blue_ocean_n7_evaluation_corpus.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const evidence = JSON.parse(readFileSync(resolve(
  root,
  'docs/evidence/blue-ocean/n7-evaluation-corpus-20260824.json',
), 'utf8'));
const corpus = JSON.parse(readFileSync(resolve(
  root,
  'backend/test/fixtures/blue_ocean_n7_evaluation_corpus.json',
), 'utf8'));

function validate(changedEvidence = evidence, changedCorpus = corpus) {
  return validateBlueOceanN7EvaluationCorpus({
    repositoryRoot: root,
    evidence: changedEvidence,
    corpus: changedCorpus,
  });
}

test('accepts the exact synthetic N7 corpus and correction boundary', () => {
  assert.deepEqual(validate(), {
    status: evidence.status,
    listingCases: 22,
    priceCases: 24,
    priceMatrixCombinations: 90,
    nextPackage: 'N8',
  });
});

test('rejects corpus identity, counts and duplicate case IDs', () => {
  const identity = structuredClone(corpus);
  identity.dataClassification = 'unknown';
  assert.throws(() => validate(evidence, identity), /corpus identity or counts/u);

  const duplicate = structuredClone(corpus);
  duplicate.priceCases[0].id = duplicate.listingCases[0].id;
  assert.throws(() => validate(evidence, duplicate), /case IDs must be unique/u);
});

test('rejects missing listing or price coverage', () => {
  const listing = structuredClone(corpus);
  listing.listingCases.find((entry) => entry.id === 'provider-timeout').id = 'missing-timeout';
  assert.throws(() => validate(evidence, listing), /required case is missing/u);

  const price = structuredClone(corpus);
  price.priceCases.find((entry) => entry.id === 'outlier-resistance').id = 'missing-outlier';
  assert.throws(() => validate(evidence, price), /required case is missing/u);
});

test('rejects a weakened price matrix or live corpus boundary', () => {
  const matrix = structuredClone(corpus);
  matrix.priceMatrix.expectedCombinationCount = 89;
  assert.throws(() => validate(evidence, matrix), /price matrix/u);

  const boundary = structuredClone(corpus);
  boundary.boundaries.externalProviderCallAllowed = true;
  assert.throws(() => validate(evidence, boundary), /corpus boundary/u);
});

test('rejects G5 correction, mutation or verification drift', () => {
  const correction = structuredClone(evidence);
  correction.narrowCorrection.transactionBoundary = 'shared-transaction';
  assert.throws(() => validate(correction), /G5 correction/u);

  const mutation = structuredClone(evidence);
  mutation.boundaries.paidCallPerformed = true;
  assert.throws(() => validate(mutation), /mutation boundary/u);

  const verification = structuredClone(evidence);
  verification.targetedVerification.corpusTests = 'passed-47';
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
  final.status = 'verified-ready-for-n8';
  final.targetedVerification.postgres16G5FailureIntegration = 'passed';
  final.targetedVerification.backendSuite = 'passed-711-one-documented-skip';
  final.targetedVerification.fullTechnicalRegression = 'passed-candidate-rollover-mode';
  final.targetedVerification.githubRegression = 'passed';
  final.targetedVerification.githubCodeql = 'passed';
  final.exactGitHubVerification = {
    headSha: 'bad',
    regressionRunId: 1,
    regressionConclusion: 'success',
    codeqlRunId: 2,
    codeqlConclusion: 'success',
  };
  assert.throws(() => validate(final), /exact GitHub verification/u);
});

test('rejects private or secret-shaped evidence', () => {
  const changed = structuredClone(evidence);
  changed.note = '/Users/example/private';
  assert.throws(() => validate(changed), /private or secret-shaped/u);
});
