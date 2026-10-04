#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  r8ConcurrentPrivacyExportAccounts,
  r8ForbiddenFindings,
  r8MaximumConcurrentWorkers,
  r8RequiredScenarios,
  r8ResultClassification,
  r8SyntheticAccountCount,
} from './r8_bounded_concurrency_contract.mjs';
import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/r8-bounded-concurrency-20260824.json';
const implementationHead = '74daf0a462a240649a647c5b9c00e5568c5af3ed';
const verifiedHead = 'f4b69d6ae56d75acdcccf568aec2ba1de3915c45';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R8 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R8 marker missing in ${path}: ${marker}`);
  }
}

export function validateR8BoundedConcurrency({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-bounded-run-and-targeted-tests-passed-full-regression-pending',
    'verified-local-r8-regression-passed-ci-pending',
    'verified-r8-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r8-bounded-concurrency'
      || !statuses.includes(value.status)
      || value.observedOn !== '2026-08-24'
      || !exact(value.source, {
        branch: 'codex/master-workflow-20260808',
        r7ClosureHead: 'ea900297bcd9791c9c7349f8f1e02a1534b34ec7',
        implementationHead,
      })) {
    fail('R8 evidence identity is invalid.');
  }

  if (!exact(value.syntheticLoad, {
    accountCount: r8SyntheticAccountCount,
    maximumConcurrentWorkers: r8MaximumConcurrentWorkers,
    concurrentPrivacyExportAccounts: r8ConcurrentPrivacyExportAccounts,
    productionCapacityClaimed: false,
  })) fail('R8 synthetic load boundary is invalid.');
  if (!exact(value.scenarios, r8RequiredScenarios)) {
    fail('R8 scenario matrix is incomplete.');
  }
  if (!exact(value.redFirstFinding, {
    standardOwnerListingEditPreviouslyCheckedClientRevision: false,
    observedConcurrentStatusesBeforeCorrection: [200, 200],
    risk: 'silent-owner-listing-lost-update',
    permanentCorrection: 'server-owned-catalog-revision-and-atomic-compare-and-swap',
  })) fail('R8 red-first finding is invalid.');
  if (!exact(value.findingsAfterCorrection, Object.fromEntries(
    r8ForbiddenFindings.map((finding) => [finding, 0]),
  ))) fail('R8 retained finding result is invalid.');
  if (!exact(value.assertions, {
    listingEditConflictContract: 'one-success-one-listing_revision_conflict',
    publicationConflictContract: 'one-created-one-blue_ocean_draft_closed',
    competingBookingContract: 'one-accepted-one-booking_period_unavailable',
    recoveryTokenContract: 'one-consumed-one-invalid_or_expired_reset_link',
    cartIsolationRows: r8SyntheticAccountCount,
    supportIsolationRows: r8SyntheticAccountCount,
    privacyExportsVerified: r8ConcurrentPrivacyExportAccounts,
    listingSetRevalidationRequired: true,
    realMoneyOperations: 0,
    externalProviderCalls: 0,
  })) fail('R8 concurrency assertions are invalid.');

  if (!exact(value.execution, {
    resultClassification: r8ResultClassification,
    status: 'passed-bounded-concurrency-and-cleaned',
    durationMs: 7033.25,
    postgresHost: '127.0.0.1',
    applicationHost: '127.0.0.1',
    listingAiProvider: 'mock',
    listingAiBudgetCents: 0,
    postgresStopped: true,
    temporaryClusterRemoved: true,
    syntheticCredentialsRetained: false,
  })) fail('R8 retained execution is invalid.');
  if (!exact(value.workaroundAudit, {
    sourceRotationAttemptRejectedByRegressionContract: true,
    sourceRotationUsedInRetainedRun: false,
    rateLimiterWindowIsolatedByFreshLoopbackServer: true,
    supportAndPrivacyDomainTransactionsRemainProductionCodePaths: true,
    persistentTestPrerequisiteCreated: false,
    permanentWorkaroundIntroduced: false,
    timingAccommodationIntroduced: false,
    testParallelismReduced: false,
  })) fail('R8 workaround audit is invalid.');

  const localPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.verification, {
    boundedPostgresRunner: 'passed-and-cleaned',
    runnerUnitTests: 'passed-2',
    rateLimitIsolationTests: 'passed-2',
    backendSuite: 'passed-746-one-postgres-skip',
    flutterCatalogTests: 'passed-5',
    flutterAnalyze: 'passed-zero-issues',
    r8ArtifactValidatorTests: 'passed-6',
    r8ArtifactValidator: 'passed',
    fullTechnicalRegression: localPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R8 verification state is invalid.');
  if (!githubPassed && value.githubVerification !== undefined) {
    fail('R8 pending evidence must not claim GitHub verification.');
  }
  if (githubPassed && !exact(value.githubVerification, {
    implementationHead,
    verifiedHead,
    regression: {
      runId: 32752535433,
      conclusion: 'success',
      postgresJobId: 97512758822,
      postgresConclusion: 'success',
      backendJobId: 97512759179,
      backendConclusion: 'success',
      flutterJobId: 97512759251,
      flutterConclusion: 'success',
      parallelStabilityExecuted: false,
      signedCandidateBuilt: false,
      apiImageBuilt: true,
      apiImagePublished: false,
      publishApiImageJobId: 97515110356,
      publishApiImageConclusion: 'skipped',
    },
    codeql: {
      workflowRunId: 32752535527,
      workflowConclusion: 'success',
      advancedSecurityCheckId: 97513141931,
      advancedSecurityConclusion: 'success',
      newAlerts: 0,
    },
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      documentedBaseCommit: 'e64defd0df62fb047c6fbc90733e4caf318ac7c4',
      documentedBaseCheckId: 97395091283,
      currentCheckId: 97512569543,
      currentConclusion: 'failure',
      reportedPullRequestCommitScope: 250,
      credentialDetailsInspected: false,
      classifiedAsR8Regression: false,
    },
  })) fail('R8 exact GitHub verification is invalid.');

  if (!exact(value.limitations, {
    boundedLocalObservationOnly: true,
    productionCapacityClaimed: false,
    performanceCertificationClaimed: false,
    releaseCertificationClaimed: false,
    supportAndPrivacyRequestStackFullyLoadTested: false,
    supportAndPrivacyTransactionalIsolationTested: true,
    realUsersEvaluated: false,
  })) fail('R8 limitation record is invalid.');
  if (Object.values(value.boundaries ?? {}).some((entry) => entry !== false)) {
    fail('R8 live, provider, money or data boundary is invalid.');
  }
  if (value.nextPackage !== 'R9') fail('R8 next package is invalid.');

  const contractPath = 'tool/r8_bounded_concurrency_contract.mjs';
  requireMarkers(source(repositoryRoot, contractPath), contractPath, [
    'r8SyntheticAccountCount = 120',
    'r8MaximumConcurrentWorkers = 24',
    r8ResultClassification,
    "'concurrent_listing_edits'",
    "'privacy_export'",
    "'stale_state_acceptance'",
  ]);
  const runnerPath = 'tool/run_r8_bounded_concurrency.mjs';
  requireMarkers(source(repositoryRoot, runnerPath), runnerPath, [
    "status: 'passed-bounded-concurrency-and-cleaned'",
    "listingEditConflictContract: 'one-success-one-listing_revision_conflict'",
    'externalProviderCalls: 0',
    'temporaryClusterRemoved: true',
  ]);
  const appPath = 'backend/src/app.js';
  requireMarkers(source(repositoryRoot, appPath), appPath, [
    'function requiredListingCatalogRevision(raw)',
    "'listing_revision_required'",
    'AND catalog_revision = $26',
    "'listing_revision_conflict'",
    'ownedListingPayload(',
  ]);
  const integrationPath = 'backend/test/postgres_foundation.integration.test.js';
  requireMarkers(source(repositoryRoot, integrationPath), integrationPath, [
    'const r8SyntheticAccounts = Object.freeze(Array.from(',
    'const r8CohortResults = await mapWithBoundedConcurrency(',
    'const concurrentCartItemResponses = await Promise.all([',
    'const concurrentBlueOceanPublishResponses = await Promise.all([',
    'const concurrentListingResponses = await Promise.all([',
    'const concurrentRecoveryResponses = await Promise.all([',
    'const concurrentCounterRequests = await Promise.all([',
    'return buildAccountExport(client, account.id);',
  ]);
  const g5Path = 'backend/test/listing_set_workflow.test.js';
  requireMarkers(source(repositoryRoot, g5Path), g5Path, [
    'G5 availability drift stays item-bound and requires request-time revalidation',
    'result.serverTruth.revalidationRequiredBeforeRequest',
    'result.serverTruth.paymentCreated',
  ]);
  const itemPath = 'lib/models/item.dart';
  requireMarkers(source(repositoryRoot, itemPath), itemPath, [
    'final int catalogRevision;',
    "catalogRevision: (json['catalogRevision'] as num?)?.toInt() ?? 1",
    "'catalogRevision': catalogRevision",
  ]);
  const dataPath = 'lib/services/data_service.dart';
  requireMarkers(source(repositoryRoot, dataPath), dataPath, [
    'effectiveUpdated = Item.fromJson(remote);',
    'effective = Item.fromJson(remote);',
    'items[index] = effectiveUpdated;',
    'items[index] = effective;',
  ]);
  const rateLimitPath =
    'backend/test/postgres_rate_limit_isolation_contract.test.js';
  requireMarkers(source(repositoryRoot, rateLimitPath), rateLimitPath, [
    'monolithic PostgreSQL scenarios isolate limiter state without source rotation',
    'the sole multi-source scenario is the explicit distributed account-lock attack',
  ]);
  const regressionPath = 'scripts/technical_regression_check.sh';
  requireMarkers(source(repositoryRoot, regressionPath), regressionPath, [
    'node --check tool/run_r8_bounded_concurrency.mjs',
    'node --test test/tool/run_r8_bounded_concurrency.test.mjs',
    'node --check tool/validate_r8_bounded_concurrency.mjs',
    'node --test test/tool/validate_r8_bounded_concurrency.test.mjs',
    'node tool/validate_r8_bounded_concurrency.mjs',
  ]);

  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R8 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    accountCount: value.syntheticLoad.accountCount,
    maximumConcurrentWorkers: value.syntheticLoad.maximumConcurrentWorkers,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateR8BoundedConcurrency();
  process.stdout.write(
    `R8 bounded concurrency valid: accounts=${result.accountCount}, workers=${result.maximumConcurrentWorkers}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
