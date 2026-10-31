#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/r6-price-engine-property-stress-20260824.json';
const implementationHead = '0005a8abab6178d282b4c79bedd2e36870968675';
const verifiedHead = 'f4dd649f74c0420faf0117afbd844563e91effda';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R6 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R6 marker missing in ${path}: ${marker}`);
  }
}

export function validateR6PriceEnginePropertyStress({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-targeted-and-postgres-passed-regression-pending',
    'verified-local-r6-regression-passed-ci-pending',
    'verified-r6-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r6-price-engine-property-stress'
      || !statuses.includes(value.status)
      || value.observedOn !== '2026-08-24'
      || !exact(value.source, {
        branch: 'codex/master-workflow-20260808',
        r5VerifiedHead: 'b55253d68443c11b5308e63fe3b2e9fc8ea07bbf',
        initialCorrectionCommit: 'b7d2c6f9b6965b2d1ebbfd9366a53a9dabcd2e88',
        implementationHead,
        engineAuthority: 'SIT_REGIONAL_PRICE_ENGINE_V2',
        engineVersion: 'R6-2026-08-24.1',
        migration: '069_regional_price_engine_r6_hardening',
      })) {
    fail('R6 evidence identity is invalid.');
  }

  if (!exact(value.findingsClosed, {
    weakFarCohortCouldOutvoteStrongNearEvidence: true,
    documentedLowerDemandClampWasUnreachable: true,
    historicalN7LowerDemandFixtureWasStale: true,
    unknownRecommendationFieldsWereIgnored: true,
    workaroundIntroduced: false,
  }) || !exact(value.permanentCorrections, {
    influenceModel: 'pareto-frontier-over-source-geography-similarity-freshness',
    dominatedAggregateCapBasisPoints: 9000,
    incomparableTradeoffsRemainIndependent: true,
    lowerDemandClampBasisPoints: 9000,
    upperDemandClampBasisPoints: 11000,
    neutralDemandRatio: 2,
    unknownRequestFieldsRejected: true,
    engineVersionAdvanced: true,
    historicalN5SnapshotsRemainValid: true,
  })) fail('R6 findings or permanent corrections are invalid.');

  const coverage = value.requiredCoverage;
  if (coverage?.categoryReplacementConditionCombinations !== 90
      || coverage.roundingBoundaryCases !== 1818
      || !exact(coverage.geographyScopes, [
        'within_20_km', 'within_50_km', 'within_100_km',
        'baden_wuerttemberg', 'germany',
      ])
      || !exact(coverage.sourceClasses, [
        'completed_sit_rental', 'accepted_sit_request', 'active_sit_listing',
        'reviewed_external_c2c_asking_price',
        'professional_commercial_reference', 'synthetic_fixture',
      ])
      || !exact(coverage.confidenceValues, ['HIGH', 'MEDIUM', 'LOW'])
      || !exact(coverage.ownerOptions, ['rent_fast', 'sit_recommendation', 'set_higher'])
      || !exact(coverage.durationBoundaryDays, [1, 2, 3, 6, 7, 13, 14, 30])
      || Object.entries(coverage).some(([key, entry]) => (
        ![
          'categoryReplacementConditionCombinations', 'roundingBoundaryCases',
          'geographyScopes', 'sourceClasses', 'confidenceValues', 'ownerOptions',
          'durationBoundaryDays',
        ].includes(key) && entry !== true
      ))) {
    fail('R6 required coverage is incomplete.');
  }

  const stress = value.deterministicStress;
  if (!exact(stress, {
    classification: 'DETERMINISTIC_SYNTHETIC_PROPERTY_STRESS_NOT_PRODUCTION_CAPACITY_CLAIM',
    seed: '0x5a17c9e3',
    caseCount: 2000,
    totalObservationInputs: 16651,
    categoryCount: 6,
    replacementValueBandCount: 5,
    conditionCount: 3,
    confidenceCounts: { HIGH: 0, MEDIUM: 38, LOW: 1962 },
    geographyCounts: {
      within_20_km: 0,
      within_50_km: 3,
      within_100_km: 35,
      baden_wuerttemberg: 54,
      germany: 1908,
    },
    minimumRecommendedMinor: 400,
    maximumRecommendedMinor: 5000,
    outputDigestSha256: '3e9fb6e3cd65b9efb8a6197de60c9b62812abfc9a93ca86ef3ebc1ba59462ed7',
    failures: 0,
    externalProviderCalls: 0,
    realMoneyOperations: 0,
    productionMutations: 0,
  })) fail('R6 deterministic stress result is invalid.');

  if (!exact(value.migrationVerification, {
    previousUpMigrationCount: 68,
    currentUpMigrationCount: 69,
    previousDownMigrationCount: 41,
    currentDownMigrationCount: 42,
    emptyDatabaseApplied: true,
    secondMigrationRunIdempotent: true,
    n5SnapshotContractRetained: true,
    r6SnapshotContractAccepted: true,
    rollbackRefusesWhenR6SnapshotExists: true,
    productionDatabaseTouched: false,
  })) fail('R6 migration verification is invalid.');

  const fullRegressionPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    engineAndPropertyTests: 'passed-28',
    historicalN5ValidatorTests: 'passed-7',
    historicalN5Validator: 'passed',
    seededStress: 'passed-2000-cases-16651-observations',
    postgres16MigrationAndWorkflow: 'passed-and-cleaned',
    fullTechnicalRegression: fullRegressionPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R6 verification state is invalid.');
  if (!githubPassed && value.githubVerification !== undefined) {
    fail('R6 pending evidence must not claim GitHub verification.');
  }
  if (githubPassed && !exact(value.githubVerification, {
    implementationHead,
    verifiedHead,
    regression: {
      runId: 32746280246,
      conclusion: 'success',
      postgresJobId: 97492755326,
      postgresConclusion: 'success',
      backendJobId: 97492755400,
      backendConclusion: 'success',
      flutterJobId: 97492754898,
      flutterConclusion: 'success',
      parallelStabilityExecuted: false,
      signedCandidateBuilt: false,
      apiImageBuilt: true,
      apiImagePublished: false,
      publishApiImageJobId: 97495255521,
      publishApiImageConclusion: 'skipped',
    },
    codeql: {
      workflowRunId: 32746280233,
      workflowConclusion: 'success',
      advancedSecurityCheckId: 97493148349,
      advancedSecurityConclusion: 'success',
      newAlerts: 0,
    },
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      documentedBaseCommit: 'e64defd0df62fb047c6fbc90733e4caf318ac7c4',
      documentedBaseCheckId: 97395091283,
      currentCheckId: 97492456137,
      currentConclusion: 'failure',
      reportedPullRequestCommitScope: 250,
      credentialDetailsInspected: false,
      classifiedAsR6Regression: false,
    },
  })) {
    fail('R6 exact GitHub verification is invalid.');
  }

  if (!exact(value.limitations, {
    realMarketObservationsUsed: false,
    productionCapacityClaimed: false,
    performanceCertificationClaimed: false,
    humanPriceComprehensionTested: false,
    authenticDemandEvidenceCollected: false,
    releaseCertificationClaimed: false,
  })) fail('R6 limitation record is invalid.');
  if (Object.values(value.boundaries ?? {}).some((entry) => entry !== false)) {
    fail('R6 live or data boundary is invalid.');
  }
  if (value.nextPackage !== 'R7') fail('R6 next package is invalid.');

  const enginePath = 'backend/src/regional_price_engine_v2.js';
  requireMarkers(source(repositoryRoot, enginePath), enginePath, [
    "regionalPriceEngineVersion = 'R6-2026-08-24.1'",
    'weakerEvidenceAggregateCapBasisPoints = 9_000',
    'function influenceVector(row)',
    'function dominates(left, right)',
    'frontierKeys',
    "'regional_price_request_schema_invalid'",
    'requests - (2 * listings)',
    "'weaker_evidence_influence_bounded'",
    'syntheticLearningApplied: false',
  ]);
  const upPath = 'backend/sql/migrations/069_regional_price_engine_r6_hardening.up.sql';
  requireMarkers(source(repositoryRoot, upPath), upPath, [
    "engine_version IN ('N5-2026-08-24.1', 'R6-2026-08-24.1')",
    'regional_price_engine_snapshots_v2_contract',
  ]);
  const downPath = 'backend/sql/migrations/069_regional_price_engine_r6_hardening.down.sql';
  requireMarkers(source(repositoryRoot, downPath), downPath, [
    'R6 rollback blocked: hardened price snapshot data exists',
    "engine_version = 'N5-2026-08-24.1'",
  ]);
  const stressPath = 'tool/run_r6_price_engine_property_stress.mjs';
  requireMarkers(source(repositoryRoot, stressPath), stressPath, [
    'r6StressSeed = 0x5a17c9e3',
    'r6StressCaseCount = 2_000',
    'DETERMINISTIC_SYNTHETIC_PROPERTY_STRESS_NOT_PRODUCTION_CAPACITY_CLAIM',
    'externalProviderCalls: 0',
  ]);
  const testPath = 'backend/test/regional_price_engine_v2_property_stress.test.js';
  requireMarkers(source(repositoryRoot, testPath), testPath, [
    'assert.equal(matrixCases, 90)',
    'assert.equal(roundingCases, 1_818)',
    'length: 4_999',
    'expectedByDays',
    'regional_price_request_schema_invalid',
  ]);
  const historicalCorpusPath =
    'backend/test/fixtures/blue_ocean_n7_evaluation_corpus.json';
  requireMarkers(source(repositoryRoot, historicalCorpusPath), historicalCorpusPath, [
    '"id": "demand-low-ratio-bound"',
    '"expectedBasisPoints": 9000',
  ]);
  const regressionPath = 'scripts/technical_regression_check.sh';
  requireMarkers(source(repositoryRoot, regressionPath), regressionPath, [
    'node --check tool/validate_r6_price_engine_property_stress.mjs',
    'node --test test/tool/validate_r6_price_engine_property_stress.test.mjs',
    'node tool/validate_r6_price_engine_property_stress.mjs',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R6 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    stressCases: stress.caseCount,
    observationInputs: stress.totalObservationInputs,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateR6PriceEnginePropertyStress();
  process.stdout.write(
    `R6 Price Engine stress valid: cases=${result.stressCases}, observations=${result.observationInputs}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
