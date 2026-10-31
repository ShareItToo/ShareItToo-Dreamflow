#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/r5-repeated-device-stability-20260824.json';
const implementationHead = '8e31b19f1205088036b4f3f9755dbdca33246ef1';
const verifiedHead = 'cb3735ec66f1190aec14f86d3817c43bd91bdb60';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R5 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R5 marker missing in ${path}: ${marker}`);
  }
}

export function validateR5RepeatedDeviceStability({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'verified-local-r5-regression-pending',
    'verified-r5-full-regression-passed-ci-pending',
    'verified-r5-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r5-repeated-device-stability'
      || !validStatuses.includes(value.status)
      || value.observedOn !== '2026-08-24'
      || !exact(value.source, {
        branch: 'codex/master-workflow-20260808',
        implementationHead,
        initialHarnessCommit: '488c6e947244d74c4928e17401d9f9304472c11e',
        supportMonotonicityFixCommit: '2a880523ea718a9c21000a280b361bc6dbf664f8',
        deviceCandidateCommit: implementationHead,
        applicationId: 'com.shareittoo.app',
        versionName: '1.0.0',
        buildNumber: '2026082405',
      })) {
    fail('R5 evidence identity is invalid.');
  }

  const backend = value.backendObservation;
  if (backend?.status !== 'passed-25-fresh-runs-and-cleaned'
      || backend.resultClassification
        !== 'LOCAL_REPEAT_STABILITY_OBSERVATION_NOT_PERFORMANCE_CERTIFICATION'
      || backend.repeatedRuns !== 25
      || !exact(backend.coverage, {
        completeBlueOceanMockListingFlows: 25,
        freshBackendStartStopCycles: 25,
        cartRequestFlows: 25,
        g3SameOwnerFlows: 25,
        g4DeterministicPlannerFlows: 25,
        g5ListingSetFlows: 25,
        publicationReplays: 25,
        applicationServerRestartScenarios: 25,
      })
      || Object.values(backend.failures ?? {}).some((entry) => entry !== 0)
      || !exact(backend.networkBoundary, {
        postgresHost: '127.0.0.1',
        applicationHost: '127.0.0.1',
        listingAiProvider: 'mock',
        listingAiBudgetCents: 0,
        externalProviderCalls: 0,
        realMoneyOperations: 0,
      })
      || backend.observation?.performanceCertificationClaimed !== false
      || !Object.values(backend.observation ?? {}).slice(0, 8).every(Number.isFinite)
      || !exact(backend.cleanup, {
        freshClusterPerRun: true,
        postgresStoppedAfterEveryRun: true,
        temporaryClusterRemovedAfterEveryRun: true,
        persistentTestPrerequisiteCreated: false,
      })) {
    fail('R5 repeated backend observation is invalid.');
  }

  if (!exact(value.flutterDraftObservation, {
    status: 'passed-25-owner-bound-save-restore-clear-cycles',
    repeatedRuns: 25,
    encryptedPlatformStorageContract: true,
    ownerBound: true,
    readyFingerprintRestored: false,
    ownerConfirmationsRestored: false,
    rawImageBytesStored: false,
    failedRestorations: 0,
    detectedDataCorruptions: 0,
  })) fail('R5 Flutter draft observation is invalid.');

  const device = value.physicalDeviceObservation;
  if (device?.status !== 'passed-25-bounded-physical-start-stop-cycles'
      || device.resultClassification
        !== 'BOUNDED_PHYSICAL_STABILITY_OBSERVATION_NOT_PERFORMANCE_CERTIFICATION'
      || device.capturedAt !== '2026-08-24T14:42:18.630Z'
      || device.platform !== 'android'
      || device.physical !== true
      || device.manufacturer !== 'Google'
      || device.model !== 'Pixel 7 Pro'
      || device.osVersion !== '17'
      || device.apiLevel !== 37
      || device.securityPatch !== '2026-07-05'
      || device.completedCycles !== 25
      || Object.values(device.failures ?? {}).some((entry) => entry !== 0)
      || !exact(device.state, {
        appDataIdentityPreserved: true,
        packageIdentityPreserved: true,
        mainNavigationRestoredEveryCycle: true,
        containsRawDeviceIdentifier: false,
      })
      || !Object.values(device.start ?? {}).every(Number.isFinite)
      || !Object.values(device.memory ?? {}).every(Number.isFinite)) {
    fail('R5 physical device observation is invalid.');
  }

  if (!exact(value.candidateUpdate, {
    installedVersionBefore: '1.0.0+2026082404',
    installedVersionAfter: '1.0.0+2026082405',
    strictlyNewerBuildInstalled: true,
    canonicalSigningRelationshipVerified: true,
    installedCandidateHashMatched: true,
    firstInstallTimePreserved: true,
    appDataIdentityPreserved: true,
    foregroundActivityVerified: true,
    uninstallUsed: false,
    dataResetUsed: false,
    downgradeUsed: false,
  })) fail('R5 Android candidate update boundary is invalid.');

  if (!exact(value.permanentCorrections, {
    supportProgressTimestamp: 'strictly-monotonic-database-expression',
    supportIntegrationFixtures: 'strictly-monotonic-database-expression',
    postgresFailureAttribution: 'bounded-child-and-server-log-tail',
    repetitionCountReduced: false,
    timingSleepMadePrerequisite: false,
    parallelismWorkaroundMadePrerequisite: false,
  })) fail('R5 permanent-correction record is invalid.');

  const fullRegressionPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === validStatuses[2];
  if (!exact(value.verification, {
    focusedR5NodeHarnessTests: 'passed-8',
    focusedFlutterDraftTests: 'passed-5',
    freshPostgresIntegrationRuns: 'passed-25-and-cleaned',
    physicalPixelCycles: 'passed-25-data-preserving',
    privacyAndRetentionValidators: 'passed-draft-fail-closed',
    fullTechnicalRegression: fullRegressionPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R5 verification record is invalid.');

  if (!exact(value.limitations, {
    fullBlueOceanUiFlowRepeatedOnDevice: false,
    completeBlueOceanFlowRepeatedThroughLocalBackend: true,
    expectedNonTarget5xxGateTestsExist: true,
    networkObservation: 'ERROR_LOG_URL_OBSERVATION_NOT_PACKET_CAPTURE',
    performanceCertificationClaimed: false,
    memoryLeakCertificationClaimed: false,
    releaseCertificationClaimed: false,
  })) fail('R5 limitation record is invalid.');

  if (Object.values(value.boundaries ?? {}).some((entry) => entry !== false)) {
    fail('R5 live or privacy boundary is invalid.');
  }
  if (value.nextPackage !== 'R6') fail('R5 next package is invalid.');
  if (!githubPassed && value.githubVerification !== undefined) {
    fail('R5 pending evidence must not claim GitHub verification.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.implementationHead !== implementationHead
        || github.verifiedHead !== verifiedHead
        || github.regression?.conclusion !== 'success'
        || github.regression.runId !== 32742156529
        || github.regression.postgresJobId !== 97478929841
        || github.regression.postgresConclusion !== 'success'
        || github.regression.backendJobId !== 97478930152
        || github.regression.flutterConclusion !== 'success'
        || github.regression.flutterJobId !== 97478930292
        || github.regression.backendConclusion !== 'success'
        || github.regression.parallelStabilityExecuted !== false
        || github.regression.signedCandidateBuilt !== false
        || github.regression.apiImageBuilt !== true
        || github.regression.apiImagePublished !== false
        || github.regression.publishApiImageJobId !== 97481368883
        || github.regression.publishApiImageConclusion !== 'skipped'
        || github.codeql?.workflowConclusion !== 'success'
        || github.codeql.workflowRunId !== 32742155112
        || github.codeql.advancedSecurityConclusion !== 'success'
        || github.codeql.advancedSecurityCheckId !== 97479591110
        || github.codeql.newAlerts !== 0
        || !exact(github.preExistingExternalHistoryCheck, {
          provider: 'GitGuardian',
          documentedBaseCommit: 'e64defd0df62fb047c6fbc90733e4caf318ac7c4',
          documentedBaseCheckId: 97395091283,
          currentCheckId: 97478903904,
          currentConclusion: 'failure',
          reportedPullRequestCommitScope: 250,
          credentialDetailsInspected: false,
          classifiedAsR5Regression: false,
        })) {
      fail('R5 GitHub verification is invalid.');
    }
  }

  const repeatedRunner = 'tool/run_r5_repeated_postgres_stability.mjs';
  requireMarkers(source(repositoryRoot, repeatedRunner), repeatedRunner, [
    'r5RequiredRepeatedRuns = 25',
    'completeBlueOceanMockListingFlows: r5RequiredRepeatedRuns',
    'unexpectedBackend5xxInTargetFlows: 0',
    'performanceCertificationClaimed: false',
  ]);
  const deviceRunner = 'tool/diagnose_r5_android_repeated_stability.mjs';
  requireMarkers(source(repositoryRoot, deviceRunner), deviceRunner, [
    'r5RequiredDeviceCycles = 25',
    "'shell', 'am', 'force-stop'",
    "'shell', 'dumpsys', 'meminfo', '--local'",
    'ERROR_LOG_URL_OBSERVATION_NOT_PACKET_CAPTURE',
    'memoryLeakCertificationClaimed: false',
  ]);
  const flutterTest = 'test/r5_blue_ocean_draft_recovery_stability_test.dart';
  requireMarkers(source(repositoryRoot, flutterTest), flutterTest, [
    'index < 25',
    'expect(storage.writes, 25)',
    'expect(storage.deletes, 25)',
    "'readyFingerprint': null",
  ]);
  const supportWorkflow = 'backend/src/support_progress_update_workflow.js';
  requireMarkers(source(repositoryRoot, supportWorkflow), supportWorkflow, [
    "updated_at = GREATEST($4, updated_at + INTERVAL '1 microsecond')",
  ]);
  const integration = 'backend/test/postgres_foundation.integration.test.js';
  const integrationSource = source(repositoryRoot, integration);
  if ((integrationSource.match(/updated_at = GREATEST\([\s\S]{0,120}?clock_timestamp\(\)/gu)
    ?? []).length < 3) {
    fail('R5 support integration fixtures are not strictly monotonic.');
  }

  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R5 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    backendRuns: backend.repeatedRuns,
    deviceCycles: device.completedCycles,
    draftCycles: value.flutterDraftObservation.repeatedRuns,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateR5RepeatedDeviceStability();
  process.stdout.write(
    `R5 repeated stability valid: backend=${result.backendRuns}, device=${result.deviceCycles}, drafts=${result.draftCycles}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
