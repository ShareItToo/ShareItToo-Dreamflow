#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp134-current-candidate-staging-support-20260913.json';
const pointerPath = 'store/google-play/current-rollover-candidate.json';
const wp134ClosureHead = 'ef83152428c7939eaa7d3aae77d79e3aa124d426';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`${label} is not exact.`);
}

function sha256AtClosure(repositoryRoot, path) {
  let source;
  try {
    source = execFileSync('git', ['show', `${wp134ClosureHead}:${path}`], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`WP134 historical source is unavailable: ${path}.`);
  }
  return createHash('sha256').update(source).digest('hex');
}

function ancestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export function validateWp134({
  repositoryRoot = root,
  evidence,
  pointer,
  verifyInventory = true,
  verifyAncestry = true,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const historicalPointer = pointer
    ?? JSON.parse(execFileSync(
      'git',
      ['show', `${wp134ClosureHead}:${pointerPath}`],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ));
  evidence = value;
  pointer = historicalPointer;
  exact(evidence?.schemaVersion, 1, 'WP134 schema');
  exact(evidence?.kind, 'sit-wp134-current-candidate-staging-support-lifecycle', 'WP134 kind');
  exact(evidence?.status, 'passed-exact-current-candidate-staging-support-lifecycle', 'WP134 status');
  exact(evidence?.source?.branch, 'codex/master-workflow-20260808', 'WP134 branch');
  exact(evidence?.source?.candidateSourceCommit, 'abf911d1c944a4e5874269111985d0cc4736546e', 'WP134 candidate source');
  exact(evidence?.source?.stagingRuntimeHead, 'df39a14b7a19afe467842461a28f1e77fec8445e', 'WP134 runtime head');
  exact(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'WP134 application ID');
  exact(evidence?.candidate?.versionCode, '2026091309', 'WP134 version code');
  exact(evidence?.candidate?.releaseChannel, 'internal', 'WP134 release channel');
  exact(evidence?.candidate?.environment, 'staging', 'WP134 environment');
  exact(evidence?.candidate?.apkSha256, '6f688e3641f54da91caf0e4f7c039f192a0c4e481b3ebb98ac3b2723cbe27ddf', 'WP134 APK');
  exact(evidence?.candidate?.aabSha256, '6fc8164cd7a941da83aa104e1a238c4b1725c983dab6bb7651fd3f9880bbcb04', 'WP134 AAB');
  exact(evidence?.candidate?.signingCertificateSha256, '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4', 'WP134 signing');
  exact(evidence?.staging?.runtimeImage, 'ghcr.io/shareittoo/shareittoo-api:df39a14b7a19afe467842461a28f1e77fec8445e', 'WP134 runtime image');
  for (const key of [
    'runtimeHealthyBeforeExecution',
    'runtimeHealthyAfterExecution',
  ]) exact(evidence?.staging?.[key], true, `WP134 ${key}`);
  exact(evidence?.staging?.runtimeRestartCountBeforeExecution, 0, 'WP134 pre-run restarts');
  exact(evidence?.staging?.runtimeRestartCountAfterExecution, 0, 'WP134 post-run restarts');
  exact(evidence?.staging?.apiLivenessAfterExecution, 'http-200-ok', 'WP134 liveness');
  exact(evidence?.staging?.databaseAfterExecution, 'ok', 'WP134 database');
  exact(evidence?.staging?.mailAfterExecution, 'ok', 'WP134 mail');
  exact(evidence?.staging?.notificationPendingAfterExecution, 0, 'WP134 pending notifications');
  exact(evidence?.staging?.notificationDeadAfterExecution, 0, 'WP134 dead notifications');
  exact(evidence?.staging?.paymentTransportAfterExecution, 'memory', 'WP134 payment transport');
  exact(evidence?.staging?.paymentLivemodeAfterExecution, false, 'WP134 live payment');
  exact(evidence?.staging?.supportWatchdogStaleAfterExecution, false, 'WP134 watchdog');
  exact(evidence?.staging?.supportP0WithoutOwnerAfterExecution, 0, 'WP134 missing P0 owner');
  exact(evidence?.staging?.supportCriticalNextUpdateOverdueAfterExecution, 0, 'WP134 critical overdue');
  exact(evidence?.support?.intake, 'passed', 'WP134 intake');
  exact(evidence?.support?.operatingMode, 'simulation', 'WP134 support mode');
  exact(evidence?.support?.independentReview, 'approved-by-separate-admin', 'WP134 review');
  exact(evidence?.support?.progressPublication, 'passed', 'WP134 publication');
  exact(evidence?.support?.recipientReadback, 'passed', 'WP134 readback');
  exact(evidence?.support?.externalMessageSent, false, 'WP134 external message');
  exact(evidence?.support?.futureDeadlineConfirmed, true, 'WP134 deadline');
  exact(evidence?.support?.existingSupportCasesChanged, false, 'WP134 existing cases');
  exact(evidence?.cleanup?.temporaryAccountsDecommissioned, 3, 'WP134 account cleanup');
  exact(evidence?.cleanup?.credentialsRevoked, true, 'WP134 credential cleanup');
  exact(evidence?.cleanup?.privateVaultDeleted, true, 'WP134 vault cleanup');
  exact(evidence?.cleanup?.auditHistoryRetained, true, 'WP134 audit retention');
  exact(evidence?.portfolioEffect?.promotedRequirement, 'staging-support-simulation-lifecycle', 'WP134 requirement');
  exact(evidence?.portfolioEffect?.state, 'PASS', 'WP134 portfolio state');
  exact(JSON.stringify(evidence?.portfolioEffect?.totals), JSON.stringify({ pass: 18, partial: 6, open: 8 }), 'WP134 totals');
  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    if (key.startsWith('contains') || key.endsWith('Changed') || key.endsWith('Sent')
        || key === 'realUserChanged' || key === 'realMoneyUsed'
        || key === 'onePlusContacted' || key === 'pullRequestMerged') {
      exact(value, false, `WP134 boundary ${key}`);
    }
  }
  if (/\/Users\/|@[a-z0-9.-]+\.[a-z]{2,}|"(?:accessToken|refreshToken|password|secret)"/iu
    .test(JSON.stringify(evidence))) {
    fail('WP134 committed evidence contains private material.');
  }
  if (verifyInventory) {
    const inventory = evidence?.source?.sourceInventory ?? {};
    for (const [path, expected] of Object.entries(inventory)) {
      exact(
        sha256AtClosure(repositoryRoot, path),
        expected,
        `WP134 source inventory ${path}`,
      );
    }
  }
  if (verifyAncestry) {
    if (!ancestor(repositoryRoot, wp134ClosureHead)
        || !ancestor(repositoryRoot, evidence.source.candidateSourceCommit)
        || !ancestor(repositoryRoot, evidence.source.stagingRuntimeHead)) {
      fail('WP134 candidate or runtime is not an ancestor of HEAD.');
    }
  }
  exact(pointer?.candidate?.versionCode, evidence.candidate.versionCode, 'WP134 candidate pointer');
  exact(pointer?.evidenceRef, 'docs/evidence/release-readiness/wp134-current-candidate-staging-support-20260913.json', 'WP134 evidence pointer');
  exact(pointer?.deviceVerification?.authenticatedPilotMatrix, 'partial-exact-current-report-block-search-saved-and-support-passed', 'WP134 matrix pointer');
  return evidence;
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const evidence = validateWp134();
  process.stdout.write(
    `WP134 support evidence valid: candidate=${evidence.candidate.versionCode}, requirement=${evidence.portfolioEffect.state}\n`,
  );
}
