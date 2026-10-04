#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { r10ExpectedPermissions } from './run_r10_clean_reproducibility.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidencePath = path.join(
  repositoryRoot,
  'docs/evidence/48h-remote/r11-android-security-permission-surface-20260824.json',
);
const implementationHead = '9ec9c62c7ca806e16ab5beb354e4872b3f513e13';
const sha256Pattern = /^[0-9a-f]{64}$/u;

function fail(code) {
  throw new Error(code);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function requireExact(actual, expected, code) {
  if (!exact(actual, expected)) fail(code);
}

export function validateR11AndroidSecuritySurface(value) {
  if (value?.schemaVersion !== 1
      || value?.kind !== 'sit-48h-r11-android-security-permission-surface'
      || value?.status !== 'verified-merged-debug-artifact-regression-and-codeql-passed'
      || value?.observedOn !== '2026-08-24') {
    fail('r11_evidence_identity_invalid');
  }
  requireExact(value.source, {
    branch: 'codex/master-workflow-20260808',
    implementationHead,
  }, 'r11_source_identity_invalid');
  if (value.artifact?.buildType !== 'debug'
      || !Number.isSafeInteger(value.artifact?.bytes)
      || value.artifact.bytes <= 0
      || !sha256Pattern.test(value.artifact?.sha256 ?? '')) {
    fail('r11_artifact_identity_invalid');
  }
  requireExact({
    applicationId: value.artifact.applicationId,
    versionName: value.artifact.versionName,
    versionCode: value.artifact.versionCode,
    compileSdk: value.artifact.compileSdk,
    minSdk: value.artifact.minSdk,
    targetSdk: value.artifact.targetSdk,
  }, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026082302',
    compileSdk: 35,
    minSdk: 24,
    targetSdk: 35,
  }, 'r11_android_identity_invalid');

  requireExact(value.permissions, r10ExpectedPermissions, 'r11_permission_surface_invalid');
  requireExact(value.components?.counts, {
    activity: 12,
    service: 13,
    receiver: 7,
    provider: 8,
  }, 'r11_component_counts_invalid');
  if (value.components?.inventorySha256
        !== 'dbed9b89f1d6cbedfa6f199a9bba232cb4447b63dde38352474cd6fa63cc8d40'
      || value.components?.allProvidersNonExported !== true) {
    fail('r11_component_inventory_invalid');
  }
  requireExact(value.components.exported, [
    { type: 'activity', name: 'com.shareittoo.app.MainActivity', permission: null },
    { type: 'receiver', name: 'io.flutter.plugins.firebase.messaging.FlutterFirebaseMessagingReceiver', permission: 'com.google.android.c2dm.permission.SEND' },
    { type: 'activity', name: 'com.google.firebase.auth.internal.GenericIdpActivity', permission: null },
    { type: 'activity', name: 'com.google.firebase.auth.internal.RecaptchaActivity', permission: null },
    { type: 'service', name: 'com.google.android.gms.auth.api.signin.RevocationBoundService', permission: 'com.google.android.gms.auth.api.signin.permission.REVOCATION_NOTIFICATION' },
    { type: 'activity', name: 'com.facebook.CustomTabActivity', permission: null },
    { type: 'receiver', name: 'com.google.firebase.iid.FirebaseInstanceIdReceiver', permission: 'com.google.android.c2dm.permission.SEND' },
    { type: 'receiver', name: 'androidx.profileinstaller.ProfileInstallReceiver', permission: 'android.permission.DUMP' },
  ], 'r11_exported_components_invalid');

  if (value.intentSurface?.notificationAction
        !== 'com.shareittoo.app.SIT_NOTIFICATION_CLICK'
      || value.intentSurface?.inventorySha256
        !== '996ec536b88d2495e6557ea822c0942aa90cf925ea486c47a9d8e5e0b2407650'
      || value.intentSurface?.browsableRoutes?.length !== 7
      || value.intentSurface.browsableRoutes.some((route) =>
        !['https', 'shareittoo', 'genericidp', 'recaptcha', 'fbconnect'].includes(route.scheme))) {
    fail('r11_intent_surface_invalid');
  }
  requireExact(
    value.intentSurface.browsableRoutes.slice(0, 3).map((route) => ({
      component: route.component,
      autoVerify: route.autoVerify,
      scheme: route.scheme,
      host: route.host,
      pathPrefix: route.pathPrefix,
    })),
    ['shareittoo.com', 'www.shareittoo.com', 'staging.shareittoo.com'].map((host) => ({
      component: 'com.shareittoo.app.MainActivity',
      autoVerify: true,
      scheme: 'https',
      host,
      pathPrefix: '/api/v1/open/',
    })),
    'r11_verified_app_links_invalid',
  );

  requireExact(value.fileProviders, [
    { name: 'dev.fluttercommunity.plus.share.ShareFileProvider', authority: 'com.shareittoo.app.flutter.share_provider', pathsResource: 'flutter_share_file_paths', exported: false, grantUriPermissions: true },
    { name: 'io.flutter.plugins.imagepicker.ImagePickerFileProvider', authority: 'com.shareittoo.app.flutter.image_provider', pathsResource: 'flutter_image_picker_file_paths', exported: false, grantUriPermissions: true },
    { name: 'net.nfet.flutter.printing.PrintFileProvider', authority: 'com.shareittoo.app.flutter.printing', pathsResource: 'flutter_printing_file_paths', exported: false, grantUriPermissions: true },
  ], 'r11_file_provider_surface_invalid');
  requireExact(value.packageVisibility, {
    intents: [
      { actions: ['android.intent.action.PROCESS_TEXT'], mimeTypes: ['text/plain'] },
      { actions: ['android.intent.action.GET_CONTENT'], mimeTypes: ['*/*'] },
    ],
    packages: ['com.facebook.katana'],
  }, 'r11_package_visibility_invalid');

  requireExact(value.policies, {
    debuggableTestArtifact: true,
    backupDisabled: true,
    completeBackupExclusionsPresent: true,
    cleartextTrafficDisabled: true,
    networkSecurityConfig: 'absent-platform-default-plus-cleartext-disabled',
    legacyExternalStorageDisabled: true,
  }, 'r11_android_policy_invalid');
  requireExact(value.access, {
    camera: 'declared-runtime-permission',
    location: 'coarse-and-fine-runtime-permissions-no-background-location',
    notifications: 'post-notifications-runtime-permission',
    media: 'system-photo-picker-plus-legacy-read-max32-write-max28',
  }, 'r11_access_surface_invalid');
  requireExact(value.firebase, {
    messagingSdkPresent: true,
    authenticationSdkPresent: true,
    crashlyticsSdkPresent: true,
    messagingAutoInitDisabled: true,
    analyticsSdkPresent: false,
    analyticsCollectionDisabled: true,
    crashlyticsCollectionDisabled: true,
  }, 'r11_firebase_surface_invalid');
  requireExact(value.stageA, {
    backendEnabledInDebugByDefault: false,
    productionBackendOriginCompiledButInactive: true,
    productionEndpointEnabled: false,
    externalAiEnabled: false,
    realPaymentEnabled: false,
    publicG3Enabled: false,
    publicG4Enabled: false,
    publicG5Enabled: false,
    supportEvidenceIntakeEnabledByDefault: false,
    supportEvidenceScannerTransport: 'none',
    supportEvidenceScannerUploadEnabled: false,
  }, 'r11_stage_a_surface_invalid');
  requireExact(value.boundaries, {
    productionChanged: false,
    vpsChanged: false,
    cloudChanged: false,
    firebaseProjectChanged: false,
    storeChanged: false,
    paymentChanged: false,
    credentialsReadOrExtracted: false,
    artifactInstalled: false,
    artifactPublished: false,
    pullRequestMerged: false,
  }, 'r11_boundary_invalid');
  requireExact(value.ciAndCodeql, {
    exactGithubVerification: 'passed',
    localCodeqlClaimed: false,
  }, 'r11_ci_state_invalid');
  requireExact(value.githubVerification, {
    implementationHead,
    verifiedHead: 'edf6a0a4ebcdcdfb2af8dae12cbdf0d24e82586f',
    pullRequest: {
      number: 7,
      draft: true,
      state: 'OPEN',
      merged: false,
    },
    regression: {
      runId: 32770744048,
      conclusion: 'success',
      jobs: {
        postgresRunnerProof: { jobId: 97570288015, conclusion: 'success' },
        backendRegression: { jobId: 97570287853, conclusion: 'success' },
        flutterRegression: {
          jobId: 97570287894,
          conclusion: 'success',
          parallelStressStep: 'skipped',
          signedCandidateStep: 'skipped',
        },
        r10CleanReproducibility: { jobId: 97570287713, conclusion: 'success' },
        publishApiImage: { jobId: 97572282995, conclusion: 'skipped' },
      },
    },
    codeql: {
      workflowRunId: 32770744022,
      workflowConclusion: 'success',
      advancedSecurityCheckId: 97570928981,
      advancedSecurityConclusion: 'success',
      newAlerts: 0,
    },
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      documentedBaseCommit: 'e64defd0df62fb047c6fbc90733e4caf318ac7c4',
      documentedBaseCheckId: 97395091283,
      currentCheckId: 97570272993,
      currentConclusion: 'failure',
      reportedPullRequestCommitScope: 250,
      credentialDetailsInspected: false,
      classifiedAsR11Regression: false,
    },
  }, 'r11_github_verification_invalid');
  if (value.nextPackage !== 'R12') fail('r11_next_package_invalid');

  return Object.freeze({
    status: value.status,
    implementationHead: value.source.implementationHead,
    permissionCount: value.permissions.length,
    exportedComponentCount: value.components.exported.length,
    nextPackage: value.nextPackage,
  });
}

if (process.argv[1] !== undefined
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const result = validateR11AndroidSecuritySurface(value);
  process.stdout.write(
    `R11 evidence valid: permissions=${result.permissionCount}, `
      + `exported=${result.exportedComponentCount}, next=${result.nextPackage}\n`,
  );
}
