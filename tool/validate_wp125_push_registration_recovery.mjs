#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp125-push-registration-recovery-20260912.json';
const sourcePaths = [
  'lib/services/firebase_runtime.dart',
  'lib/services/backend_repository.dart',
  'lib/screens/notification_settings_screen.dart',
  'lib/services/firebase_service_preferences.dart',
  'lib/services/local_principal_scope.dart',
  'lib/services/backend_realtime_service.dart',
  'lib/widgets/foreground_push_host.dart',
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

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return Buffer.from(execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail(`WP125 source is unavailable: ${path}`);
  }
}

function validateInstalledCandidate(value) {
  if (!exact(value.installedCandidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091110',
    candidateSourceCommit: 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b',
    apkSha256: '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
    environment: 'staging',
    containsWp125: false,
  })) fail('WP125 installed-candidate boundary is invalid.');
}

function validateObservation(value) {
  if (!exact(value.onePlusObservation, {
    visiblePushOptInEnabled: true,
    androidNotificationPermissionGranted: true,
    controlledForegroundProbeCount: 1,
    foregroundBannerObserved: false,
    backendRegistrationCountObserved: 2,
    activationRegistrationAttribution: 'unknown',
    transportResponseLoss: 'hypothesis-not-proven',
    physicalSuccessProven: false,
    furtherProbeAfterDisconnect: false,
    deviceAvailableForWp125Replay: false,
  })) fail('WP125 OnePlus observation overclaims physical truth.');
}

function validateRootCause(value) {
  const rootCause = value.provenRootCauseClass;
  const required = [
    'visibleOptInCouldOutliveFailedRegistration',
    'registrationFailureCouldBeReturnedAsSuccess',
    'tokenRefreshListenerDependedOnInitialToken',
    'resumeRecoveryWasMissing',
    'authenticatedRealtimeRecoveryWasMissing',
    'backendMutationLackedExactOwnerEpoch',
    'pendingCleanupLackedExactOwnerBinding',
    'dialogOutcomeLackedExactRouteOwnership',
  ];
  if (!rootCause || required.some((key) => rootCause[key] !== true)) {
    fail('WP125 proven root-cause class is incomplete.');
  }
}

function validateImplementation(repositoryRoot, value, checkGitState) {
  const implementation = value.implementation;
  const required = [
    'epochBoundSerialOperations',
    'exactOwnerEpochBackendMutations',
    'tokenRefreshListenerInstalledBeforeInitialTokenAttempt',
    'resumeRegistrationRecovery',
    'authenticatedRealtimeRegistrationRecovery',
    'opaqueExactOwnerCleanupBinding',
    'transportFailureNeverPresentedAsRegistrationSuccess',
    'visibleOptInRetainedWhileDeliveryUnconfirmed',
    'staleAccountResultSuppressed',
    'exactDialogRouteOwnership',
  ];
  if (implementation?.sourceHead !== 'a695306350bd868eda64fb9af8b388ed61923578'
      || required.some((key) => implementation[key] !== true)
      || !exact(implementation.sourceInventory?.map((entry) => entry.path), sourcePaths)) {
    fail('WP125 implementation contract is invalid.');
  }
  if (checkGitState) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', implementation.sourceHead, 'HEAD'], {
        cwd: repositoryRoot,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      fail('WP125 source head is not an ancestor of HEAD.');
    }
  }
  for (const entry of implementation.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(sourceAtHead(repositoryRoot, implementation.sourceHead, entry.path))
          !== entry.sha256) {
      fail(`WP125 source hash drift: ${entry.path}`);
    }
  }
}

function validateVerification(value) {
  const verification = value.verification;
  if (verification?.focusedAnalyzerIssues !== 0
      || verification.focusedFlutterTestsPassed !== 37
      || verification.focusedNodeTestsPassed !== 22
      || ['fullScopedLocalTechnicalRegressionPassed', 'webWasmPassed',
        'loopbackSmokePassed', 'androidDebugBuildPassed', 'privacyValidatorPassed',
        'retentionValidatorPassed'].some((key) => verification[key] !== true)
      || !exact(verification.githubRegression, {
        runId: '34700596400',
        headSha: 'a695306350bd868eda64fb9af8b388ed61923578',
        status: 'success',
      })
      || !exact(verification.githubCodeql, {
        runId: '34700596346',
        headSha: 'a695306350bd868eda64fb9af8b388ed61923578',
        status: 'success',
      })
      || verification.openBranchCodeScanningAlerts !== 0) {
    fail('WP125 verification contract is invalid.');
  }
}

function validateBoundaries(value) {
  if (!exact(value.remaining, {
    successorCandidateBuilt: false,
    pixelPhysicalReplayPassed: false,
    onePlusPhysicalReplayPassed: false,
    onePlusRetestRequiredWhileDisconnected: false,
    next: 'strictly-higher-signed-internal-staging-successor-and-pixel-push-replay',
  })) fail('WP125 remaining physical proof is invalid.');
  if (!exact(value.boundaries, {
    productionChanged: false,
    googlePlayChanged: false,
    firebaseChanged: false,
    backendDeploymentChanged: false,
    paymentChanged: false,
    realMoneyUsed: false,
    prMerged: false,
    credentialsRecorded: false,
    emailAddressRecorded: false,
    tokenRecorded: false,
    rawDeviceIdentifierRecorded: false,
  })) fail('WP125 boundary contract is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP125 evidence contains private or secret-shaped data.');
  }
}

export function validateWp125PushRegistrationRecovery({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp125-push-registration-recovery'
      || value.status !== 'source-complete-physical-successor-candidate-replay-pending'
      || value.capturedOn !== '2026-09-12') {
    fail('WP125 evidence identity is invalid.');
  }
  validateInstalledCandidate(value);
  validateObservation(value);
  validateRootCause(value);
  validateImplementation(repositoryRoot, value, checkGitState);
  validateVerification(value);
  validateBoundaries(value);
  return Object.freeze({
    status: value.status,
    sourceHead: value.implementation.sourceHead,
    githubRegression: value.verification.githubRegression.status,
    githubCodeql: value.verification.githubCodeql.status,
    physicalSuccessProven: value.onePlusObservation.physicalSuccessProven,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp125PushRegistrationRecovery(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP125 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
