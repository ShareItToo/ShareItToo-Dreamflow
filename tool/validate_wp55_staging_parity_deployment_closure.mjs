#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp55-authenticated-staging-parity-deployment-closure-20260908.json';
const closurePath =
  'docs/operations/WP55_AUTHENTICATED_STAGING_PARITY_DEPLOYMENT_CLOSURE_2026-09-08.md';
const readinessHead = '7c9713d4797d5b145ee41d9ac7a2de140f898c38';
const runtimeHead = 'd8d1df7f59052c202f824f759693a472b6b8afa1';
const previousHead = '68c97a437969dc98f17eb151da3e006259ffbafa';
const backendTree = 'd991765a159810b88e4e4db874ac6193ae3e804d';
const previousRolloverVersionCode = '2026090711';
const currentRolloverPath = 'store/google-play/current-rollover-candidate.json';
const imageDigest =
  'sha256:e4ae94d740ef83fa80d59762805e1f64cc76f80ecd46531f955ce27ab0289908';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function git(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assertAncestor(repositoryRoot, ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP55 commit ancestry is invalid: ${ancestor} -> ${descendant}`);
  }
}

export function validateWp55CurrentBackendBinding({
  deployedBackendTree,
  currentBackendTree,
  candidateBackendTree = null,
  candidateBackendRuntimeMatchesCurrent = false,
  rollover = null,
} = {}) {
  if (deployedBackendTree !== backendTree) {
    fail('WP55 deployed Backend tree has drifted.');
  }
  if (currentBackendTree === backendTree) return 'deployed-backend-exact';

  const candidate = rollover?.candidate;
  const artifact = rollover?.artifact;
  if (rollover?.schemaVersion !== 1
      || rollover?.kind !== 'android-current-rollover-candidate'
      || rollover?.status !== 'build-ready-play-internal-upload-pending'
      || candidate?.applicationId !== 'com.shareittoo.app'
      || candidate?.releaseChannel !== 'internal'
      || candidate?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || !/^[0-9a-f]{40}$/u.test(candidate?.artifactSourceHead ?? '')
      || !/^\d{10}$/u.test(candidate?.versionCode ?? '')
      || BigInt(candidate.versionCode) <= BigInt(previousRolloverVersionCode)
      || !/^[0-9a-f]{64}$/u.test(artifact?.aabSha256 ?? '')
      || !/^[0-9a-f]{64}$/u.test(artifact?.apkSha256 ?? '')
      || (candidateBackendTree !== currentBackendTree
        && candidateBackendRuntimeMatchesCurrent !== true)) {
    fail('WP55 newer Backend tree is not bound to the current signed Staging candidate.');
  }
  return 'newer-signed-staging-candidate-deployment-pending';
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:passwordvalue|secretvalue|tokenvalue|emailaddress|phonenumber|accountid|credentialvalue|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`WP55 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

export function validateWp55StagingParityDeploymentClosure({
  repositoryRoot = root,
  evidence,
  checkGit = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp55-authenticated-staging-parity-deployment-closure'
      || value.status !== 'complete-staging-runtime-bound-support-degradation-retained'
      || value.workPackage !== 'WP55') {
    fail('WP55 evidence identity is invalid.');
  }
  if (!exact(value.repository, {
    worktree: '/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808',
    branch: 'codex/master-workflow-20260808',
    readinessHead,
    runtimeSourceHead: runtimeHead,
    runtimeBackendTree: backendTree,
    previousRuntimeHead: previousHead,
    cleanBeforeClosureDocumentation: true,
    remoteDivergenceBeforeClosureDocumentation: '0/0',
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) fail('WP55 repository binding is invalid.');

  if (checkGit) {
    assertAncestor(repositoryRoot, runtimeHead);
    assertAncestor(repositoryRoot, readinessHead);
    const deployedBackendTree = git(repositoryRoot, ['rev-parse', `${runtimeHead}:backend`]);
    const currentBackendTree = git(repositoryRoot, ['rev-parse', 'HEAD:backend']);
    let candidateBackendTree = null;
    let candidateBackendRuntimeMatchesCurrent = false;
    let rollover = null;
    if (currentBackendTree !== backendTree) {
      rollover = JSON.parse(readFileSync(resolve(repositoryRoot, currentRolloverPath), 'utf8'));
      const candidateSourceHead = rollover?.candidate?.artifactSourceHead;
      if (!/^[0-9a-f]{40}$/u.test(candidateSourceHead ?? '')) {
        fail('WP55 current candidate source binding is invalid.');
      }
      assertAncestor(repositoryRoot, candidateSourceHead);
      candidateBackendTree = git(
        repositoryRoot,
        ['rev-parse', `${candidateSourceHead}:backend`],
      );
      try {
        execFileSync(
          'git',
          [
            'diff', '--quiet', candidateSourceHead, 'HEAD', '--',
            'backend', ':(exclude)backend/test/**',
          ],
          { cwd: repositoryRoot, stdio: ['ignore', 'ignore', 'ignore'] },
        );
        candidateBackendRuntimeMatchesCurrent = true;
      } catch {
        candidateBackendRuntimeMatchesCurrent = false;
      }
    }
    validateWp55CurrentBackendBinding({
      deployedBackendTree,
      currentBackendTree,
      candidateBackendTree,
      candidateBackendRuntimeMatchesCurrent,
      rollover,
    });
    for (const path of ['backend/ops/deploy_release.sh', 'backend/compose.staging.yml']) {
      if (git(repositoryRoot, ['show', `${runtimeHead}:${path}`])
          !== git(repositoryRoot, ['show', `HEAD:${path}`])) {
        fail(`WP55 protected deployment source drifted: ${path}`);
      }
    }
  }

  if (!exact(value.operatorContinuity, {
    authorizedCodexUnlockObserved: true,
    laterAutomaticUnlockNotGuaranteed: true,
    credentialContentsRead: false,
    credentialContentsCopied: false,
    credentialContentsPersistedToGit: false,
    activeWorkKeptAwakeWithoutDisablingLockSecurity: true,
    dedicatedHeadlessStagingAccessVerified: true,
    dedicatedAccessKeyMode: '0600',
    authorizedKeyCanonicalCount: 1,
    malformedDuplicateEntriesRemoved: 2,
    unrelatedAuthorizedEntriesRetained: 1,
    preRepairBackupRetained: true,
    guiSessionRequiredForIndependentStagingWork: false,
  })) fail('WP55 operator-continuity result is invalid.');

  if (value.preDeployment.authenticatedReadOnlyInventory !== 'passed'
      || value.preDeployment.targetCheckout !== 'detached-clean-exact'
      || value.preDeployment.targetCheckoutHead !== runtimeHead
      || value.preDeployment.targetBackendTree !== backendTree
      || value.preDeployment.protectedEnvironmentMode !== '0600'
      || value.preDeployment.protectedEnvironmentParity
        !== 'byte-exact-from-previous-healthy-runtime'
      || value.preDeployment.imageRevision !== runtimeHead
      || value.preDeployment.imageVersion !== '0.1.0-d8d1df7f5905'
      || value.preDeployment.imageDigest !== imageDigest
      || value.preDeployment.foreignKeyConstraintsBeforeMutation !== 354
      || value.preDeployment.foreignKeyIntegrityBeforeMutation !== 'passed') {
    fail('WP55 pre-deployment proof is incomplete.');
  }

  if (value.deployment.environment !== 'staging'
      || value.deployment.targetHead !== runtimeHead
      || value.deployment.previousHead !== previousHead
      || value.deployment.releaseRecordMode !== '0600'
      || value.deployment.automaticRollbackArmed !== true
      || value.deployment.automaticRollbackUsed !== false
      || value.deployment.pilotId !== 'heilbronn_wave0'
      || value.deployment.firebaseAuthentication !== true
      || value.deployment.firebasePhoneVerification !== true
      || value.deployment.fcm !== true
      || value.deployment.smtp !== true
      || value.deployment.listingAiProvider !== 'mock'
      || value.deployment.listingAiExternalExecutionAllowed !== false
      || value.deployment.listingAiBudgetCents !== 0
      || value.deployment.paymentTransport !== 'memory'
      || value.deployment.stripeLiveMode !== false) {
    fail('WP55 deployment boundary is invalid or overstated.');
  }

  if (value.postDeployment.authenticatedReadOnlyInventory !== 'passed'
      || value.postDeployment.publicVersionHttpStatus !== 200
      || value.postDeployment.publicVersionExact !== true
      || value.postDeployment.runtimeHead !== runtimeHead
      || value.postDeployment.runtimeVersion !== '0.1.0-d8d1df7f5905'
      || value.postDeployment.runtimeImageId !== imageDigest
      || value.postDeployment.apiContainerHealthy !== true
      || value.postDeployment.apiRestartCount !== 0
      || value.postDeployment.databaseContainerHealthy !== true
      || value.postDeployment.databaseRestartCount !== 0
      || value.postDeployment.protectedRuntimeConfiguration !== true
      || value.postDeployment.rollbackImageLocallyAvailable !== true
      || value.postDeployment.diskBelowExistingThreshold !== true) {
    fail('WP55 post-deployment proof is incomplete.');
  }

  if (!exact(value.readiness, {
    httpStatus: 503,
    status: 'degraded',
    classification: 'only-noncritical-support-next-update-overdue',
    database: 'ok',
    mail: 'ok',
    notificationPending: 0,
    notificationDead: 0,
    paymentPending: 0,
    paymentFailedEvents: 0,
    paymentUnbalanced: 0,
    supportWatchdogStale: false,
    supportP0WithoutOwner: 0,
    supportNextUpdateOverdue: 1,
    supportCriticalNextUpdateOverdue: 0,
    privacyDeadlineOverdue: 0,
    privacyIncidentDeadlineOverdue: 0,
  })) fail('WP55 readiness degradation is misstated.');

  if (!exact(value.activeSessionBoundarySmoke, {
    status: 'passed',
    runtimeHead,
    seededActiveSessions: 100,
    loginHttpStatus: 200,
    postLoginTotalSessions: 101,
    postLoginActiveSessions: 100,
    sessionLimitRevocations: 1,
    activeRefreshTokens: 100,
    oldestSessionRevoked: true,
    oldestRefreshTokenRevoked: true,
    oldestPushDeviceDeleted: true,
    replacementSessionActive: true,
    cleanupStatus: 'passed',
    cleanupPath: 'account-deletion-endpoint',
    pseudonymousTombstoneRetained: true,
    passwordRemoved: true,
    accountClosed: true,
    dependentIdentityRows: 0,
    appendOnlyAuditPreserved: true,
    credentialContentsEmitted: false,
  })) fail('WP55 active-session boundary smoke is invalid.');

  if (!exact(value.verification, {
    closureLocalFullRegression: 'passed-with-explicit-candidate-rollover',
    closureToolBackendFlutterWebLoopbackAndroid: 'passed',
    rolloverCandidateVersionCode: '2026090711',
    rolloverMetadataOnly: true,
    targetGithubRegressionRun: 34168650985,
    targetGithubRegression: 'passed-all-required-jobs',
    targetCleanCheckout: 'passed',
    targetImagePublication: 'passed',
    targetGithubCodeqlRun: 34160161823,
    targetGithubCodeql: 'passed',
    targetOpenCodeScanningAlerts: 0,
  })) fail('WP55 exact-target verification is invalid.');

  const expectedBoundaries = {
    stagingBackendChanged: true,
    stagingDatabaseSchemaChanged: false,
    productionChanged: false,
    paymentProviderChanged: false,
    realMoneyUsed: false,
    listingAiExternalProviderChanged: false,
    firebaseConsoleChanged: false,
    dnsChanged: false,
    googlePlayChanged: false,
    testerListChanged: false,
    deviceChanged: false,
    onePlusContacted: false,
    pullRequestMerged: false,
    containsCredential: false,
    containsToken: false,
    containsAccountIdentity: false,
    containsRawInfrastructureAddress: false,
    containsRawDeviceIdentifier: false,
  };
  if (!exact(value.boundaries, expectedBoundaries)) {
    fail('WP55 external boundaries are invalid.');
  }

  const serialized = JSON.stringify(value);
  if (/\+49[0-9]|BEGIN (?:RSA |OPENSSH )?PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b|(?:^|[^0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?:[^0-9]|$)/iu.test(serialized)) {
    fail('WP55 evidence contains private or secret-shaped content.');
  }

  const closure = readFileSync(resolve(repositoryRoot, closurePath), 'utf8');
  for (const marker of [
    runtimeHead,
    imageDigest,
    '100 active sessions',
    'account-deletion endpoint',
    'later automatic unlock',
    'one noncritical Support next',
  ]) {
    if (!closure.includes(marker)) fail(`WP55 closure marker is absent: ${marker}`);
  }

  return Object.freeze({
    status: value.status,
    runtimeHead: value.postDeployment.runtimeHead,
    runtimeVersion: value.postDeployment.runtimeVersion,
    sessionSmoke: value.activeSessionBoundarySmoke.status,
    readiness: value.readiness.classification,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateWp55StagingParityDeploymentClosure();
    process.stdout.write(
      `WP55 Staging parity deployment closure valid: runtime=${result.runtimeHead}, `
      + `version=${result.runtimeVersion}, sessionSmoke=${result.sessionSmoke}, `
      + `readiness=${result.readiness}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP55 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
