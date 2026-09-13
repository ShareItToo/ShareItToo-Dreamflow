#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp140-staging-historical-support-deadline-recovery-20260913.json';
const implementationHead = 'b8deb49affa6e3bd7f13c4233849b20e8cb2db92';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP140 ${label} is invalid.`);
  }
}

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`WP140 source is unavailable: ${path}`);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP140 source is not an ancestor of HEAD: ${head}`);
  }
}

export function validateWp140StagingHistoricalSupportDeadlineRecovery({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp140-staging-historical-support-deadline-recovery'
      || value.status !== 'passed-historical-simulation-deadline-recovery'
      || value.capturedAt !== '2026-09-13T15:28:54Z') {
    fail('WP140 evidence identity is invalid.');
  }

  exact(value.source?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.source?.implementationHead, implementationHead, 'implementation source');
  exact(value.source?.backendRuntimeHead,
    'df39a14b7a19afe467842461a28f1e77fec8445e', 'Backend runtime source');
  if (checkGitState) assertAncestor(repositoryRoot, implementationHead);
  const inventory = value.source?.sourceInventory ?? {};
  exact(Object.keys(inventory).sort(), [
    'test/tool/run_wp140_staging_historical_support_deadline_recovery.test.mjs',
    'tool/run_wp140_staging_historical_support_deadline_recovery.mjs',
  ], 'source inventory');
  for (const [path, hash] of Object.entries(inventory)) {
    exact(
      createHash('sha256').update(sourceAtHead(repositoryRoot, implementationHead, path))
        .digest('hex'),
      hash,
      `source hash for ${path}`,
    );
  }

  exact(value.staging, {
    runtimeImage:
      'ghcr.io/shareittoo/shareittoo-api:df39a14b7a19afe467842461a28f1e77fec8445e',
    runtimeRestartCountBefore: 0,
    runtimeRestartCountAfter: 0,
    readinessBefore: 'degraded-three-noncritical-simulation-followups-overdue',
    readinessAfter: 'ready',
    readinessReadbackHttpStatus: 200,
    supportDeadlineWorkerVersion: 'support-deadline-watchdog-v1',
    supportDeadlineWorkerStale: false,
    p0WithoutOwnerAfter: 0,
    nextUpdateOverdueAfter: 0,
    criticalNextUpdateOverdueAfter: 0,
  }, 'Staging result');
  exact(value.support, {
    targetCount: 3,
    targetOperatingMode: 'simulation',
    targetPriority: 'p3',
    syntheticProvenanceConfirmed: true,
    publishedProgressCount: 2,
    independentReviewCount: 2,
    closedSyntheticRecipientTransitionCount: 1,
    futureDeadlineCount: 3,
    overdueCountAfter: 0,
    pendingProgressCountAfter: 0,
    eventCountAfter: 22,
    messageCountAfter: 3,
    progressCountAfter: 3,
    priorHistoryPreserved: true,
    externalMessageSentCount: 0,
  }, 'Support result');
  exact(value.recoverySemantics, {
    publishedCasesUsedOfficialProgressWorkflow: true,
    publishedCasesHadIndependentTwoAdminReview: true,
    closedSyntheticRecipientUsedOfficialStatusTransition: true,
    closedSyntheticRecipientReactivated: false,
    closedSyntheticRecipientReceivedNewMessage: false,
    supportCaseTableWrittenDirectly: false,
    oldEventsRewritten: false,
    retryResumeCohortBoundByRepositoryMarkers: true,
  }, 'recovery semantics');
  exact(value.cleanup, {
    temporaryAdminCount: 2,
    activeTemporaryAdminCountAfter: 0,
    activeTemporarySessionCountAfter: 0,
    activeTemporaryElevationCountAfter: 0,
    credentialsRevoked: true,
    privateVaultDeleted: true,
    auditHistoryRetained: true,
  }, 'cleanup');
  exact(value.verification, {
    focusedRunnerContractTests: 'passed-10-of-10',
    fullLocalTechnicalRegression: 'passed-ci-metadata-and-candidate-rollover-mode',
    implementationGithubRegressionRunId: 34764505554,
    implementationGithubRegressionConclusion: 'success',
    implementationGithubCodeqlRunId: 34764505588,
    implementationGithubCodeqlConclusion: 'success',
    independentPostRecoveryReadback: 'passed',
    portfolioBefore: { pass: 20, partial: 4, open: 8 },
    portfolioAfter: { pass: 21, partial: 4, open: 7 },
  }, 'verification');

  const trueBoundaries = ['simulationOnly'];
  const falseBoundaries = [
    'existingHistoryDeleted', 'externalMessageSent', 'productionChanged',
    'paymentChanged', 'realMoneyUsed', 'googlePlayChanged', 'firebaseChanged',
    'appCandidateChanged', 'pixelContacted', 'onePlusContacted',
    'pullRequestMerged', 'containsAccountIdentity', 'containsCaseIdentity',
    'containsCredential', 'containsToken', 'containsPrivateFilesystemPath',
  ];
  if (trueBoundaries.some((key) => value.boundaries?.[key] !== true)
      || falseBoundaries.some((key) => value.boundaries?.[key] !== false)
      || Object.keys(value.boundaries ?? {}).length !==
        trueBoundaries.length + falseBoundaries.length) {
    fail('WP140 boundary contract is invalid.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|BEGIN PRIVATE|\b(?:ghp|github_pat)_[A-Za-z0-9_]+|password\s*[:=]|@[a-z0-9.-]+\.[a-z]{2,}|"(?:caseId|reporterUserId)"/iu
    .test(serialized)) {
    fail('WP140 evidence contains identity, private-path or credential-shaped material.');
  }

  return Object.freeze({
    status: value.status,
    readiness: value.staging.readinessAfter,
    overdueCount: value.support.overdueCountAfter,
    temporaryAccountsActive: value.cleanup.activeTemporaryAdminCountAfter,
    portfolio: value.verification.portfolioAfter,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp140StagingHistoricalSupportDeadlineRecovery(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP140 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
