#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n7-evaluation-corpus-20260824.json';
const corpusPath = 'backend/test/fixtures/blue_ocean_n7_evaluation_corpus.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N7 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N7 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN7EvaluationCorpus({
  repositoryRoot = root,
  evidence,
  corpus,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const cases = corpus ?? JSON.parse(source(repositoryRoot, corpusPath));
  const validStatuses = [
    'implemented-targeted-tests-passed-postgres-pending',
    'implemented-postgres-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n8',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n7-evaluation-corpus'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== '4e2f4f2c0d744eed62070d4c0ffc0eb031b18306') {
    fail('N7 evidence identity is invalid.');
  }
  if (!exact(value.corpus, {
    version: 'N7-2026-08-24.1',
    fixturePath: corpusPath,
    dataClassification: 'synthetic-no-personal-data',
    listingCaseCount: 22,
    priceCaseCount: 24,
    priceMatrixCombinationCount: 90,
    deterministic: true,
    externalProviderRequired: false,
  })) {
    fail('N7 corpus summary is invalid.');
  }
  if (!exact(value.coverage, {
    imageAndDraftCases: 'complete',
    providerFailureCases: 'complete',
    ownerReviewAndPublicationCases: 'complete',
    priceCategoryValueConditionMatrix: 'complete',
    regionalEvidenceAndGeographyCases: 'complete',
    demandAndSyntheticBoundaries: 'complete',
    durationOwnerOverrideAndV52Fee: 'complete',
    g5FailureAfterMainPublication: 'corrected-and-covered',
  })) {
    fail('N7 coverage summary is invalid.');
  }
  if (!exact(value.narrowCorrection, {
    finding: 'optional-g5-link-failure-rolled-back-main-listing',
    requiredTruth: 'main-listing-remains-published',
    transactionBoundary: 'publication-commits-before-optional-g5-link',
    failureResponse: 'sanitized-non-blocking-status',
    failureAudit: 'minimized-best-effort',
    automaticRetryAllowed: false,
  })) {
    fail('N7 G5 correction contract is invalid.');
  }
  if (!exact(value.boundaries, {
    externalProviderCallPerformed: false,
    paidCallPerformed: false,
    billingActivated: false,
    secretStored: false,
    realPersonDataUsed: false,
    syntheticLearningApplied: false,
    automaticPublicationEnabled: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    firebaseChanged: false,
    storeChanged: false,
    appleChanged: false,
    realMoneyEnabled: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    historyRewritten: false,
  })) {
    fail('N7 mutation boundary is invalid.');
  }
  const postgresPassed = validStatuses.indexOf(value.status) >= 1;
  const fullPassed = validStatuses.indexOf(value.status) >= 2;
  const githubPassed = value.status === 'verified-ready-for-n8';
  if (!exact(value.targetedVerification, {
    corpusTests: 'passed-48',
    priceMatrixCombinations: 'passed-90',
    applicationSyntax: 'passed',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    postgres16G5FailureIntegration: postgresPassed ? 'passed' : 'pending',
    backendSuite: fullPassed ? 'passed-711-one-documented-skip' : 'pending',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) {
    fail('N7 verification record is invalid for its status.');
  }
  if (value.nextPackage !== 'N8') fail('N7 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N7 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N7 cannot bind exact GitHub verification before CI is complete.');
  }

  if (cases.schemaVersion !== 1
      || cases.kind !== value.kind
      || cases.corpusVersion !== value.corpus.version
      || cases.dataClassification !== 'synthetic-no-personal-data'
      || cases.listingCases?.length !== 22
      || cases.priceCases?.length !== 24) {
    fail('N7 executable corpus identity or counts are invalid.');
  }
  const allIds = [
    ...cases.listingCases.map((entry) => entry.id),
    ...cases.priceCases.map((entry) => entry.id),
  ];
  if (new Set(allIds).size !== 46) fail('N7 corpus case IDs must be unique.');
  if (!exact(cases.priceMatrix, {
    categories: [
      'power_tools', 'cleaning_machines', 'garden_machines',
      'ladders_hand_tools', 'event_camping', 'accessories',
    ],
    replacementValueBands: [
      'under_100', 'eur_100_250', 'eur_250_500', 'eur_500_1000', 'over_1000',
    ],
    conditions: ['like_new', 'good', 'visibly_used_but_functional'],
    expectedCombinationCount: 90,
    roundingRule: 'EUR_FULL_UNIT_HALF_UP_V1',
  })) {
    fail('N7 price matrix is invalid.');
  }
  if (!exact(cases.boundaries, {
    externalProviderCallAllowed: false,
    paidCallAllowed: false,
    realPersonDataAllowed: false,
    syntheticLearningWeight: 0,
    automaticPublicationAllowed: false,
    productionMutationAllowed: false,
  })) {
    fail('N7 corpus boundary is invalid.');
  }
  for (const requiredId of [
    'clear-object-label', 'multiple-angles', 'partial-no-readable-model',
    'accessories-included', 'accessories-not-included', 'visible-wear',
    'prohibited-category', 'low-light', 'duplicate-image', 'unrelated-image',
    'face-in-background', 'document-in-background', 'address-in-background',
    'prompt-like-image-text', 'provider-timeout', 'malformed-output',
    'budget-exhausted', 'owner-edits-all-fields', 'owner-rejects-draft',
    'manual-fallback', 'no-auto-publish', 'g5-failure-after-main-publication',
    'category-minimum', 'category-maximum', 'full-euro-rounding',
    'no-regional-data', 'weak-regional-data', 'strong-regional-data',
    'within-20-km', 'within-50-km', 'within-100-km', 'state-fallback',
    'national-fallback', 'private-commercial-mix', 'outlier-resistance',
    'effective-sample-shrinkage', 'demand-below-threshold',
    'demand-upper-clamp', 'demand-low-ratio-bound', 'synthetic-weight-zero',
    'three-owner-options', 'duration-pricing', 'owner-price-override',
    'v52-fee-preview', 'stale-observation', 'malformed-observation',
  ]) {
    if (!allIds.includes(requiredId)) fail(`N7 required case is missing: ${requiredId}`);
  }

  const testPath = 'backend/test/blue_ocean_n7_evaluation_corpus.test.js';
  const testSource = source(repositoryRoot, testPath);
  requireMarkers(testSource, testPath, [
    'N7 price matrix executes every category, value band and condition combination',
    'createListingAiGateway',
    'runListingAiImagePrivacyPipeline',
    'recommendRegionalPriceV2',
    'assertBlueOceanExplicitPublication',
    'g5_failure_after_main_publication',
    'main_listing_remains_published',
  ]);
  const appPath = 'backend/src/app.js';
  const app = source(repositoryRoot, appPath);
  requireMarkers(app, appPath, [
    "g5ContinuationStatus = req.body?.supplyEnrichmentLink == null",
    "action: 'listing.supply_enrichment_follow_up_failed'",
    "failureCode: 'listing_supply_enrichment_failed'",
    'primaryListingBlocked: false',
    "g5ContinuationStatus = 'linked'",
  ]);
  if (app.includes('g5ContinuationLinked: created.g5ContinuationLinked')) {
    fail('N7 optional G5 linkage still shares the main publication transaction result.');
  }
  const integrationPath = 'backend/test/postgres_foundation.integration.test.js';
  const integration = source(repositoryRoot, integrationPath);
  requireMarkers(integration, integrationPath, [
    'g5_failure_after_main_publication',
    'main_listing_remains_published',
    "listing.supply_enrichment_follow_up_failed",
    "'listing_supply_enrichment_failed'",
  ]);

  const serialized = JSON.stringify({ value, cases });
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('N7 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    listingCases: cases.listingCases.length,
    priceCases: cases.priceCases.length,
    priceMatrixCombinations: cases.priceMatrix.expectedCombinationCount,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateBlueOceanN7EvaluationCorpus();
  process.stdout.write(
    `Blue Ocean N7 evaluation corpus valid: listing=${result.listingCases}, price=${result.priceCases}, matrix=${result.priceMatrixCombinations}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
