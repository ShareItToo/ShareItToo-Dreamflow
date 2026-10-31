#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

export function validateGoogleCloudAndroidKeyRestriction({
  repositoryRoot,
  evidencePath = resolve(
    repositoryRoot,
    'docs/evidence/b11/google-cloud-android-api-key-restriction-20260813.json',
  ),
} = {}) {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  if (evidence.schemaVersion !== 1
      || evidence.kind !== 'google-cloud-android-api-key-restriction'
      || evidence.status !== 'saved-runtime-regression-passed'
      || evidence.project !== 'shareittoo-staging') {
    fail('Google Cloud Android key evidence state is invalid.');
  }
  const candidate = evidence.candidate ?? {};
  if (candidate.applicationId !== 'com.shareittoo.app'
      || candidate.versionName !== '1.0.0'
      || candidate.buildNumber !== '2026081202'
      || candidate.commit !== '72dd8f13b5d3be0e82392a8b28c31292bdc23b53'
      || candidate.apkSha256 !==
        '4445ff773ae728ef0959b4063e9f687ab86777ca9847d2a3605766de55afafec') {
    fail('Google Cloud Android key evidence is not bound to the exact candidate.');
  }
  const saved = evidence.savedRestriction ?? {};
  if (saved.keyClass !== 'firebase-auto-created-android-key'
      || saved.applicationRestriction !== 'android-applications'
      || saved.packageName !== candidate.applicationId
      || saved.certificateSha1ReadDirectlyFromExactCandidateApk !== true
      || saved.certificateSha1StoredInEvidence !== false
      || saved.apiRestrictionPreserved !== true
      || saved.selectedApiCountObserved !== 25) {
    fail('Google Cloud Android application restriction is incomplete.');
  }
  const verification = evidence.verification ?? {};
  if (verification.consoleSaveCompleted !== true
      || verification.credentialsOverviewShowsAndroidApplicationRestriction !== true
      || verification.postPropagationCandidateRuntimeRegression !==
        'passed-exact-installed-candidate-auth-session-and-full-fcm'
      || verification.authenticatedSession?.status !== 'passed'
      || verification.authenticatedSession?.capturedAt !== '2026-08-13T05:35:42.062Z'
      || verification.authenticatedSession?.result !==
        'authenticated-profile-and-cold-start-session-restore-passed'
      || verification.authenticatedSession?.evidenceRef !==
        'docs/evidence/b11/android-authenticated-session-post-key-restriction-2026081202-20260813T053542Z.json'
      || verification.firebaseMessaging?.status !== 'passed'
      || verification.firebaseMessaging?.capturedAt !== '2026-08-13T05:37:51.745Z'
      || verification.firebaseMessaging?.result !==
        'foreground-background-and-terminated-process-fcm-delivery-passed'
      || verification.firebaseMessaging?.evidenceRef !==
        'docs/evidence/b11/android-controlled-fcm-post-key-restriction-2026081202-20260813T053751Z.json'
      || verification.notificationIconVisual?.status !== 'passed'
      || verification.notificationIconVisual?.result !==
        'brand-glyph-centered-contained-and-evenly-spaced-in-system-circle') {
    fail('Google Cloud Android key runtime verification is incomplete.');
  }
  const sessionEvidence = JSON.parse(readFileSync(resolve(
    repositoryRoot, verification.authenticatedSession.evidenceRef,
  ), 'utf8'));
  if (sessionEvidence.kind !== 'android-authenticated-session-diagnostic'
      || sessionEvidence.status !== 'passed-bounded-authenticated-session-diagnostic'
      || sessionEvidence.capturedAt !== verification.authenticatedSession.capturedAt
      || sessionEvidence.candidate?.buildNumber !== candidate.buildNumber
      || sessionEvidence.installed?.apkSha256 !== candidate.apkSha256
      || sessionEvidence.tests?.authenticatedProfileAccess?.status !== 'passed'
      || sessionEvidence.tests?.coldStartSessionRestore?.status !== 'passed') {
    fail('Google Cloud Android key authenticated-session evidence is stale or incomplete.');
  }
  const fcmEvidence = JSON.parse(readFileSync(resolve(
    repositoryRoot, verification.firebaseMessaging.evidenceRef,
  ), 'utf8'));
  if (fcmEvidence.kind !== 'android-controlled-fcm-diagnostic'
      || fcmEvidence.status !== 'passed-bounded-full-fcm-diagnostic'
      || fcmEvidence.capturedAt !== verification.firebaseMessaging.capturedAt
      || fcmEvidence.candidate?.buildNumber !== candidate.buildNumber
      || fcmEvidence.candidate?.apkSha256 !== candidate.apkSha256
      || fcmEvidence.tests?.foregroundPushDelivery?.status !== 'passed'
      || fcmEvidence.tests?.backgroundPushDelivery?.status !== 'passed'
      || fcmEvidence.tests?.terminatedProcessPushDelivery?.status !== 'passed'
      || fcmEvidence.tests?.notificationIconVisual?.status !== 'passed'
      || fcmEvidence.boundaries?.fullFcmMatrixPassed !== true
      || fcmEvidence.boundaries?.productionPushSent !== false) {
    fail('Google Cloud Android key Firebase Messaging evidence is stale or incomplete.');
  }
  const gates = evidence.remainingSeparateGates ?? {};
  if (gates.googleMapsServerCredentialRestriction !== 'open'
      || gates.googlePlayAppSigningCertificateAddition !==
        'pending-first-play-bundle'
      || gates.iosKeyRestriction !== 'not-changed'
      || gates.browserKeyRestriction !== 'not-changed') {
    fail('Google Cloud Android key evidence conflates separate credential gates.');
  }
  const boundaries = evidence.boundaries ?? {};
  if (Object.keys(boundaries).length !== 10
      || Object.values(boundaries).some((value) => value !== false)
      || JSON.stringify(evidence).includes('@')
      || /(?:[A-F0-9]{2}:){19}[A-F0-9]{2}/i.test(JSON.stringify(evidence))) {
    fail('Google Cloud Android key evidence contains unsafe or secret material.');
  }
  return {
    status: evidence.status,
    project: evidence.project,
    packageName: saved.packageName,
    runtimeRegression: verification.postPropagationCandidateRuntimeRegression,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateGoogleCloudAndroidKeyRestriction({ repositoryRoot });
  process.stdout.write(
    `Google Cloud Android key restriction: PASS (${result.status}, ${result.packageName})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error?.message ?? 'Google Cloud Android key restriction validation failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
