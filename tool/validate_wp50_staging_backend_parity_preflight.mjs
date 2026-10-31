#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp50-staging-backend-parity-deployment-preflight-20260907.json';
const deployedHead = '68c97a437969dc98f17eb151da3e006259ffbafa';
const targetHead = '9de283ab0d5386f054606ac615a52ff05059f4db';
const sessionLimitHead = '146e0d29b81089768959ee8473ac73ac3f63e627';
const changedBackendFiles = [
  'backend/ops/secret_scan_history_baseline.json',
  'backend/ops/validate_stripe_staging_secrets.mjs',
  'backend/src/app.js',
  'backend/src/auth_session_actions.js',
  'backend/src/config.js',
  'backend/src/openai_listing_ai_provider.js',
  'backend/test/auth_session_actions.test.js',
  'backend/test/v52_handover_return_workflow.test.js',
];
const runwayIds = [
  'current-vps-read-only-inventory',
  'exact-target-image-build',
  'pre-deploy-integrity-and-rollback-capture',
  'bounded-staging-rollout',
  'post-deploy-readback-and-session-limit-smoke',
  'automatic-rollback-on-gate-failure',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(repositoryRoot, arguments_) {
  return execFileSync('git', arguments_, {
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
    fail(`WP50 commit ancestry is invalid: ${ancestor} -> ${descendant}`);
  }
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|tokenvalue|email|phonenumber|accountid|credentialvalue|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`WP50 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function validateSourceInventory(repositoryRoot, inventory) {
  if (!Array.isArray(inventory) || inventory.length !== 4) {
    fail('WP50 source inventory is incomplete.');
  }
  for (const entry of inventory) {
    if (typeof entry?.path !== 'string'
        || typeof entry.sha256 !== 'string'
        || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      fail('WP50 source inventory entry is invalid.');
    }
    const bytes = readFileSync(resolve(repositoryRoot, entry.path));
    if (sha256(bytes) !== entry.sha256) fail(`WP50 source hash drift: ${entry.path}`);
  }
}

function validateGitDelta(repositoryRoot, value) {
  assertAncestor(repositoryRoot, deployedHead, targetHead);
  assertAncestor(repositoryRoot, sessionLimitHead, targetHead);
  assertAncestor(repositoryRoot, value.repository.preflightBaseHead);

  const observedBackendFiles = git(repositoryRoot, [
    'diff', '--name-only', `${deployedHead}..${targetHead}`, '--', 'backend',
  ]).split('\n').filter(Boolean);
  if (!exact(observedBackendFiles, changedBackendFiles)) {
    fail('WP50 deployed-to-target Backend delta has drifted.');
  }
  const sqlDelta = git(repositoryRoot, [
    'diff', '--name-only', `${deployedHead}..${targetHead}`, '--', 'backend/sql',
  ]);
  if (sqlDelta !== '') fail('WP50 target unexpectedly contains a SQL delta.');
  const targetToHeadBackend = git(repositoryRoot, [
    'diff', '--name-only', `${targetHead}..HEAD`, '--', 'backend',
  ]);
  if (targetToHeadBackend !== '') fail('WP50 target Backend no longer matches current HEAD.');

  for (const path of ['backend/ops/deploy_release.sh', 'backend/compose.staging.yml']) {
    const deployed = git(repositoryRoot, ['show', `${deployedHead}:${path}`]);
    const target = git(repositoryRoot, ['show', `${targetHead}:${path}`]);
    if (sha256(deployed) !== sha256(target)) {
      fail(`WP50 immutable deployment source changed unexpectedly: ${path}`);
    }
  }
  const actions = git(repositoryRoot, ['show', `${targetHead}:backend/src/auth_session_actions.js`]);
  const app = git(repositoryRoot, ['show', `${targetHead}:backend/src/app.js`]);
  const config = git(repositoryRoot, ['show', `${targetHead}:backend/src/config.js`]);
  for (const marker of [
    'SELECT id FROM users WHERE id = $1 FOR UPDATE',
    'OFFSET $2',
    "revoked_reason, 'session_limit'",
    'DELETE FROM push_devices',
  ]) {
    if (!actions.includes(marker)) fail(`WP50 session-limit marker is absent: ${marker}`);
  }
  if (!app.includes('enforceActiveSessionLimitBeforeIssue')
      || !app.includes('if (!sessionId)')
      || !config.includes('maximumActiveSessionsPerUser: 100')) {
    fail('WP50 bounded-session wiring has drifted.');
  }
}

export function validateWp50StagingBackendParityPreflight({
  repositoryRoot = root,
  evidence,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp50-staging-backend-parity-deployment-preflight'
      || value.status !== 'prepared-read-only-external-deployment-not-started'
      || value.workPackage !== 'WP50') {
    fail('WP50 identity is invalid.');
  }
  if (!exact(value.repository, {
    worktree: '/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808',
    branch: 'codex/master-workflow-20260808',
    preflightBaseHead: '265e39d9c773eb265002c84db498b14931702a81',
    proposedDeploymentTargetHead: targetHead,
    targetBackendMatchesPreflightBase: true,
    cleanAtStart: true,
    remoteDivergenceAtStart: '0/0',
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) {
    fail('WP50 repository binding is invalid.');
  }
  if (checkGitCommit) validateGitDelta(repositoryRoot, value);

  if (!exact(value.currentStagingReadback, {
    mode: 'public-read-only',
    environment: 'staging',
    versionEndpointHttpStatus: 200,
    readinessEndpointHttpStatus: 503,
    deployedCommit: deployedHead,
    version: '0.1.0-68c97a437969',
    buildTime: '2026-09-06T05:48:02.000Z',
    readiness: 'degraded-only-noncritical-support-next-update-overdue',
    database: 'ok',
    mail: 'ok',
    notificationPending: 0,
    notificationDead: 0,
    paymentTransport: 'memory',
    paymentLiveMode: false,
    paymentProvider: 'disabled',
    listingAiProvider: 'mock',
    listingAiBudgetCents: 0,
    listingAiExternalExecutionAllowed: false,
    listingAiAutomaticPublicationAllowed: false,
    supportDeadlineWatchdogStale: false,
    supportP0WithoutOwner: 0,
    supportNextUpdateOverdue: 1,
    supportCriticalNextUpdateOverdue: 0,
    privacyDeadlineOverdue: 0,
    privacyIncidentDeadlineOverdue: 0,
  })) {
    fail('WP50 current Staging readback is invalid or overstated.');
  }
  if (!exact(value.sourceDelta.changedBackendFiles, changedBackendFiles)
      || value.sourceDelta.deployedHead !== deployedHead
      || value.sourceDelta.targetHead !== targetHead
      || value.sourceDelta.sessionLimitImplementationHead !== sessionLimitHead
      || value.sourceDelta.sqlFilesChanged !== 0
      || value.sourceDelta.schemaMigrationRequired !== false
      || value.sourceDelta.deployHarnessChanged !== false
      || value.sourceDelta.stagingComposeChanged !== false
      || value.sourceDelta.maximumActiveSessionsPerUser !== 100
      || value.sourceDelta.accountRowLockBeforeIssue !== true
      || value.sourceDelta.oldestExcessSessionsRevoked !== true
      || value.sourceDelta.associatedRefreshTokensRevoked !== true
      || value.sourceDelta.associatedPushDevicesRemoved !== true
      || value.sourceDelta.refreshRotationReusesExistingSession !== true) {
    fail('WP50 source-delta classification is invalid.');
  }
  validateSourceInventory(repositoryRoot, value.sourceInventory);

  if (!exact(value.targetVerification, {
    githubRegressionRun: 34132354257,
    githubRegression: 'passed-all-required-jobs',
    githubCodeqlRun: 34132354214,
    githubCodeql: 'passed',
    openCodeScanningAlerts: 0,
    cleanCheckoutReproducibility: 'passed',
    apiImagePublicationJob: 'skipped',
    exactTargetImagePublished: 'not-proven',
    localFullRegression: 'passed',
    toolTests: 'passed-2429',
    backendTests: 'passed-850-with-2-declared-skips',
  })) {
    fail('WP50 target verification is invalid or overclaims image publication.');
  }
  if (!exact(value.protectedRuntimeConfiguration.requiredDeploymentOverlaysInOrder, [
    'compose.staging.yml',
    'compose.staging.pilot.yml',
    'compose.staging.fcm.yml',
    'compose.staging.smtp.yml',
  ]) || !exact(value.protectedRuntimeConfiguration.forbiddenDeploymentOverlays, [
    'compose.staging.listing-ai.yml',
    'compose.staging.stripe.yml',
  ]) || value.protectedRuntimeConfiguration.currentReadbackRequired !== true
      || value.protectedRuntimeConfiguration.credentialContentsRead !== false
      || value.protectedRuntimeConfiguration.credentialPathsRecorded !== false) {
    fail('WP50 protected runtime boundary is invalid.');
  }

  if (!Array.isArray(value.deploymentRunway)
      || value.deploymentRunway.length !== runwayIds.length
      || !exact(value.deploymentRunway.map((step) => step.id), runwayIds)) {
    fail('WP50 deployment runway is incomplete or reordered.');
  }
  value.deploymentRunway.forEach((step, index) => {
    if (step.order !== index + 1
        || step.mutationAllowed !== false
        || typeof step.state !== 'string'
        || typeof step.completion !== 'string'
        || step.completion.length < 30) {
      fail(`WP50 deployment runway step is unsafe: ${step?.id ?? index}`);
    }
  });
  if (!exact(value.externalGate, {
    name: 'STAGING_BACKEND_PARITY_DEPLOYMENT_GO',
    state: 'closed',
    deploymentReady: false,
    blockingFacts: [
      'No current authenticated VPS readback is available in this worktree.',
      'The exact target image is not proven built or published.',
      'The protected Staging runtime configuration was last sanitized on 4 September and must be re-read immediately before deployment.',
      'The current release record, rollback image identity and server resource headroom have not been re-read for this target.',
    ],
    ownerPresenceRequired: 'only-if-the-existing-Hostinger-session-requires-reauthentication-or-2fa',
    maximusEscalation: 'only-for-a-real-nondelegable-owner-authentication-step',
  })) {
    fail('WP50 external gate must remain closed.');
  }
  if (value.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP50 cannot claim a runtime, external, device or data mutation.');
  }
  const serialized = JSON.stringify(value);
  if (/@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP50 evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    deployedHead: value.currentStagingReadback.deployedCommit,
    targetHead: value.repository.proposedDeploymentTargetHead,
    changedBackendFiles: value.sourceDelta.changedBackendFiles.length,
    sqlFilesChanged: value.sourceDelta.sqlFilesChanged,
    runwaySteps: value.deploymentRunway.length,
    deploymentReady: value.externalGate.deploymentReady,
    gate: value.externalGate.name,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateWp50StagingBackendParityPreflight();
    process.stdout.write(
      `WP50 Staging Backend parity preflight valid: deployed=${result.deployedHead}, `
      + `target=${result.targetHead}, backendFiles=${result.changedBackendFiles}, `
      + `sqlFiles=${result.sqlFilesChanged}, runway=${result.runwaySteps}, `
      + `deploymentReady=${result.deploymentReady}, gate=${result.gate}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP50 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
