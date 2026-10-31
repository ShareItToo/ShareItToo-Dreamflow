#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/r4-android-lifecycle-failure-matrix-20260824.json';
const r4ImplementationCommit =
  'a843e33e7b86d2e7fd1a8dec288a834af51f49fc';
const verifiedHead =
  'c7dba0d0af5d00c5e2b4c5439bf0002e1185a9c5';
const physicalCandidateCommit =
  '19fc3221bc3879788db9c48b70a89a33656116b6';

const expectedCaseIds = Object.freeze([
  'cold_start',
  'warm_start',
  'process_kill',
  'app_resume',
  'background_foreground',
  'repeated_navigation',
  'configuration_orientation',
  'large_text_accessibility_semantics',
  'permission_denied',
  'permission_permanently_denied',
  'camera_unavailable',
  'image_access_unavailable',
  'backend_unavailable',
  'mock_ai_timeout',
  'malformed_ai_response',
  'price_engine_unavailable',
  'stale_quote',
  'local_state_restoration',
  'logout_login_synthetic',
  'deep_link_rejection_acceptance',
  'duplicate_submission',
  'double_tap',
  'interrupted_draft',
  'interrupted_publication',
  'app_restart_during_draft',
  'server_restart_during_draft',
  'server_restart_during_cart_request',
  'offline_to_online_recovery',
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, {
    label: `R4 source ${path}`,
  });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) {
      fail(`R4 marker missing in ${path}: ${marker}`);
    }
  }
}

export function validateR4AndroidLifecycleFailureMatrix({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'verified-physical-and-focused-regression-pending',
    'verified-r4-full-regression-passed-ci-pending',
    'verified-r4-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r4-android-lifecycle-failure-matrix'
      || !validStatuses.includes(value.status)
      || value.observedOn !== '2026-08-24'
      || !exact(value.source, {
        branch: 'codex/master-workflow-20260808',
        r4ImplementationCommit,
        physicalCandidateCommit,
        applicationId: 'com.shareittoo.app',
        versionName: '1.0.0',
        buildNumber: '2026082404',
      })) {
    fail('R4 evidence identity is invalid.');
  }

  if (!exact(value.physicalDeviceObservation, {
    status: 'passed-bounded-device-lifecycle-diagnostic',
    capturedAt: '2026-08-24T13:25:17.522Z',
    platform: 'android',
    physical: true,
    manufacturer: 'Google',
    model: 'Pixel 7 Pro',
    osVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    installedCandidateHashMatched: true,
    appDataPreserved: true,
    navigationDestinationCount: 5,
    fatalOrAnrEntries: 0,
    containsRawDeviceIdentifier: false,
  })) fail('R4 physical-device observation is invalid.');

  if (!exact(value.systemSettings, {
    orientationReadBeforeChange: true,
    orientationChangedReversibly: true,
    orientationRestoredExactly: true,
    cameraPermissionObservedDenied: true,
    cameraPermissionChanged: false,
    talkBackChanged: false,
    fontScaleChanged: false,
    networkChanged: false,
    accessibilitySettingsChanged: false,
    deviceLeftAltered: false,
  })) fail('R4 system-setting restoration is invalid.');

  if (!Array.isArray(value.matrix)
      || value.matrix.length !== expectedCaseIds.length
      || !exact(value.matrix.map((entry) => entry.id), expectedCaseIds)
      || value.matrix.some((entry) => (
        !/^passed-/u.test(entry.result)
        || typeof entry.method !== 'string'
        || entry.method.length < 8
        || typeof entry.evidence !== 'string'
        || entry.evidence.length < 8
      ))) {
    fail('R4 lifecycle/failure matrix is incomplete or not passed.');
  }
  const cases = new Map(value.matrix.map((entry) => [entry.id, entry]));
  for (const id of [
    'cold_start',
    'warm_start',
    'process_kill',
    'app_resume',
    'background_foreground',
    'repeated_navigation',
    'configuration_orientation',
    'permission_denied',
    'deep_link_rejection_acceptance',
  ]) {
    if (cases.get(id)?.method !== 'physical-device-bounded') {
      fail(`R4 physical case is not bound to bounded device evidence: ${id}`);
    }
  }
  if (cases.get('permission_permanently_denied')?.method
        !== 'automated-fail-closed-contract'
      || cases.get('offline_to_online_recovery')?.method
        !== 'automated-fail-closed-contract') {
    fail('R4 non-mutating permission/offline classification is invalid.');
  }

  if (!exact(value.localRecovery, {
    encryptedPlatformStorage: true,
    ownerBound: true,
    retentionHours: 24,
    maximumEncodedBytes: 131072,
    rawImageBytesStored: false,
    credentialsStored: false,
    ownerConfirmationsStored: false,
    readyFingerprintStored: false,
    freshConsentAndReviewRequired: true,
    clearedOnLogout: true,
    clearedOnPublication: true,
    clearedOnPhotoMutation: true,
  })) fail('R4 local recovery control is invalid.');

  if (!exact(value.publicationRecovery, {
    explicitOwnerActionStillRequired: true,
    ownerAndDraftBound: true,
    appendOnlyReceiptRequired: true,
    sameListingReturnedOnRetry: true,
    automaticPublicationAllowed: false,
    missingReceiptFailsClosed: true,
  })) fail('R4 publication recovery control is invalid.');

  const fullRegressionPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === validStatuses[2];
  if (!exact(value.verification, {
    focusedR4NodeTests: 'passed-109',
    focusedR4FlutterTests: 'passed-19',
    quoteLogoutOfflineNodeTests: 'passed-24',
    logoutResilienceFlutterTests: 'passed-5',
    postgresRestartIntegration: 'passed-one-complete-scenario-and-cleaned',
    flutterAnalyze: 'passed-no-issues',
    privacyDisclosureValidator: 'passed-draft-fail-closed',
    retentionValidator: 'passed-draft-fail-closed',
    fullTechnicalRegression: fullRegressionPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R4 verification record is invalid.');

  if (!exact(value.limitations, {
    physicalCandidatePrecedesR4Implementation: true,
    permanentlyDeniedPermissionPhysicallyMutated: false,
    offlineNetworkPhysicallyMutated: false,
    newR4RecoveryCodeClaimedPhysical: false,
    performanceCertificationClaimed: false,
    releaseCertificationClaimed: false,
    temporaryWorkaroundMadePermanent: false,
  })) fail('R4 evidence limitations are invalid.');

  if (!exact(value.boundaries, {
    privateDeviceMediaRead: false,
    screenshotsCaptured: false,
    rawDeviceIdentifierRecorded: false,
    deviceUninstalled: false,
    deviceDataReset: false,
    apiBillingCreated: false,
    externalAiProviderCalled: false,
    realMoneyUsed: false,
    productionChanged: false,
    cloudChanged: false,
    firebaseChanged: false,
    paymentChanged: false,
    storeChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    pilotActivated: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    credentialsPersistedInRepository: false,
    containsSecrets: false,
  })) fail('R4 live or privacy boundary is invalid.');

  if (value.nextPackage !== 'R5_REPEATED_DEVICE_STABILITY') {
    fail('R4 next package is invalid.');
  }
  if (value.githubVerification !== undefined && !githubPassed) {
    fail('R4 pending evidence must not claim GitHub verification.');
  }
  if (githubPassed) {
    const github = value.githubVerification;
    if (github?.implementationCommit !== r4ImplementationCommit
        || github.verifiedHead !== verifiedHead
        || github.regression?.conclusion !== 'success'
        || github.regression.runId !== 32736181817
        || github.regression.postgresJobId !== 97459436744
        || github.regression.postgresConclusion !== 'success'
        || github.regression.flutterJobId !== 97459437155
        || github.regression.flutterConclusion !== 'success'
        || github.regression.backendJobId !== 97459437367
        || github.regression.backendConclusion !== 'success'
        || github.regression.parallelStabilityExecuted !== false
        || github.regression.signedCandidateBuilt !== false
        || github.regression.apiImageBuilt !== true
        || github.regression.apiImagePublished !== false
        || github.regression.publishApiImageJobId !== 97461834174
        || github.regression.publishApiImageConclusion !== 'skipped'
        || github.codeql?.workflowConclusion !== 'success'
        || github.codeql.workflowRunId !== 32736181796
        || github.codeql.advancedSecurityConclusion !== 'success'
        || github.codeql.advancedSecurityCheckId !== 97459435293
        || github.codeql.newAlerts !== 0) {
      fail('R4 GitHub verification is invalid.');
    }
  }

  const recoveryPath = 'lib/services/blue_ocean_draft_recovery_service.dart';
  requireMarkers(source(repositoryRoot, recoveryPath), recoveryPath, [
    'package:flutter_secure_storage/flutter_secure_storage.dart',
    'retention = Duration(hours: 24)',
    '_maximumEncodedBytes = 128 * 1024',
    "payload['ownerId'] != normalizedOwnerId",
    "candidate.startsWith('data:')",
  ]);
  const screenPath = 'lib/screens/create_listing_screen.dart';
  requireMarkers(source(repositoryRoot, screenPath), screenPath, [
    'with WidgetsBindingObserver',
    'AppLifecycleState.paused',
    'Future<void> _restoreBlueOceanRecoverySnapshot',
    '_blueOceanConsentAccepted = false;',
    '_blueOceanReadyFingerprint = null;',
    'if (_submitBusy) return;',
    'Die Kamera ist nicht verfügbar oder der Zugriff wurde abgelehnt.',
    'Auf Fotos kann gerade nicht zugegriffen werden.',
  ]);
  const authPath = 'lib/services/auth_service.dart';
  requireMarkers(source(repositoryRoot, authPath), authPath, [
    'await prefs.remove(_sessionKey);',
    'await BlueOceanDraftRecoveryService().clear();',
  ]);
  const appPath = 'backend/src/app.js';
  requireMarkers(source(repositoryRoot, appPath), appPath, [
    "stored.row.status === 'published'",
    'listing_ai_publication_receipts AS receipt',
    "res.set('Cache-Control', 'private, no-store').status(200)",
    'replayed: true',
    'autoPublishAllowed: false',
    "throw new HttpError(500, 'blue_ocean_publication_receipt_missing')",
  ]);
  const integrationPath = 'backend/test/postgres_foundation.integration.test.js';
  const integration = source(repositoryRoot, integrationPath);
  requireMarkers(integration, integrationPath, [
    'const restartApplicationServer = async () =>',
    'await restartApplicationServer();',
    'blueOceanPublishReplay.assistant.replayed',
    'assert.equal((await replayB6.json()).replayed, true);',
  ]);
  if ((integration.match(/await restartApplicationServer\(\);/gu) ?? []).length < 13) {
    fail('R4 PostgreSQL restart coverage regressed.');
  }
  const diagnosticPath = 'tool/diagnose_r4_android_lifecycle.mjs';
  requireMarkers(source(repositoryRoot, diagnosticPath), diagnosticPath, [
    physicalCandidateCommit,
    "'coldStart'",
    "'warmStart'",
    "'processKill'",
    "'orientationRestored'",
    "'cameraPermissionDeniedObserved'",
    "setSetting(commandRunner, adbPath, device, 'user_rotation', originalOrientation.rotation)",
  ]);

  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R4 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    cases: value.matrix.length,
    physicalDevice: value.physicalDeviceObservation.model,
    fatalOrAnrEntries: value.physicalDeviceObservation.fatalOrAnrEntries,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateR4AndroidLifecycleFailureMatrix();
  process.stdout.write(
    `R4 lifecycle matrix valid: cases=${result.cases}, device=${result.physicalDevice}, fatalOrAnr=${result.fatalOrAnrEntries}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
