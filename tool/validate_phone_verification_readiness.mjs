#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function source(root, path, overrides) {
  return Object.hasOwn(overrides, path)
    ? overrides[path]
    : readFileSync(resolve(root, path), 'utf8');
}

function includes(text, marker, label) {
  if (!text.includes(marker)) fail(`${label} is missing: ${marker}`);
}

function evidence(root, path, overrides) {
  try {
    return JSON.parse(source(root, path, overrides));
  } catch {
    fail(`Phone verification evidence is missing or invalid: ${path}`);
  }
}

export function validatePhoneVerificationReadiness({
  root,
  readiness = JSON.parse(readFileSync(resolve(root, 'store/phone-verification-readiness.json'), 'utf8')),
  sourceOverrides = {},
  allowCandidateRollover = false,
} = {}) {
  const allowedStates = [
    'implementation-complete-external-gates-open',
    'firebase-console-activated-staging-test-pending',
    'android-real-device-sms-passed',
  ];
  if (readiness.schemaVersion !== 1
      || readiness.kind !== 'firebase-phone-verification-readiness'
      || !allowedStates.includes(readiness.state)) {
    fail('Phone verification readiness state is invalid.');
  }

  const sourceBuild = readiness.sourceBuild ?? {};
  const pubspec = source(root, 'pubspec.yaml', sourceOverrides);
  const version = /^version:\s+(\d+\.\d+\.\d+)\+(\d{10})$/mu.exec(pubspec);
  const sourceBuildNumberValid = /^\d{10}$/u.test(sourceBuild.buildNumber ?? '');
  const buildMatches = version
    && (sourceBuild.buildNumber === version[2]
      || (allowCandidateRollover
        && sourceBuildNumberValid
        && BigInt(sourceBuild.buildNumber) < BigInt(version[2])));
  if (!version
      || sourceBuild.applicationId !== 'com.shareittoo.app'
      || sourceBuild.versionName !== version[1]
      || !buildMatches) {
    fail('Phone verification readiness is not bound to the current source build.');
  }

  const implementation = readiness.implementation ?? {};
  const expectedImplementation = {
    provider: 'firebase-phone',
    backendFeatureFlag: 'FIREBASE_PHONE_VERIFICATION_ENABLED',
    enabledByDefault: false,
    backendStatusGate: '/v1/auth/phone-verification/status',
    backendConfirmationEndpoint: '/v1/auth/phone-verification/confirm',
    firebaseTokenRevocationChecked: true,
    firebasePhoneProviderRequired: true,
    requestedAndVerifiedPhoneMustMatch: true,
    verifiedPhoneUniquePerAccount: true,
    phoneNumbersAndSmsCodesExcludedFromAuditMetadata: true,
    temporaryFirebasePhoneIdentityDeleted: true,
    explicitTransferNoticeBeforeSms: true,
    clientSideVerificationBypassRemoved: true,
  };
  if (JSON.stringify(implementation) !== JSON.stringify(expectedImplementation)) {
    fail('Phone verification implementation claims are incomplete or stale.');
  }

  const consoleEvidence = readiness.consoleEvidence ?? {};
  const activated = readiness.state !== 'implementation-complete-external-gates-open';
  const devicePassed = readiness.state === 'android-real-device-sms-passed';
  const expectedConsoleEvidence = {
    firebaseAuthenticationInitialized: true,
    enabledSignInProviders: activated ? ['phone'] : [],
    canonicalAndroidSigningFingerprintsRegistered: true,
    phoneProviderEnabled: activated,
    smsRegionPolicySaved: activated,
    smsRegionPolicy: activated ? 'allow-only-de' : 'not-saved',
    evidenceRef: activated
      ? 'docs/evidence/b11/firebase-phone-console-activation-20260814.json'
      : null,
  };
  if (JSON.stringify(consoleEvidence) !== JSON.stringify(expectedConsoleEvidence)) {
    fail('Phone verification console evidence is incomplete or unsafe.');
  }

  const realDeviceEvidence = readiness.androidRealDeviceEvidence;
  if (devicePassed) {
    const expectedEvidence = {
      testedBuildNumber: '2026081403',
      delivery: 'google-play-internal',
      playSigningAllowlistPassed: true,
      realSmsDelivered: true,
      validLatestCodeAccepted: true,
      verifiedStatePersistedAfterFreshLogin: true,
      invalidCodeRejected: true,
      accountRemainedUnverifiedAfterInvalidCode: true,
      currentSourceHasCenteredReasonSpecificErrors: true,
      evidenceRefs: [
        'docs/evidence/b11/firebase-phone-play-signing-allowlist-20260814.json',
        'docs/evidence/b11/firebase-phone-real-sms-verification-2026081403-20260814.json',
        `docs/evidence/b11/android-candidate-${sourceBuild.buildNumber}.json`,
      ],
    };
    if (JSON.stringify(realDeviceEvidence) !== JSON.stringify(expectedEvidence)) {
      fail('Android real-device SMS evidence binding is incomplete or stale.');
    }

    const signing = evidence(root, realDeviceEvidence.evidenceRefs[0], sourceOverrides);
    const sms = evidence(root, realDeviceEvidence.evidenceRefs[1], sourceOverrides);
    const currentCandidate = evidence(root, realDeviceEvidence.evidenceRefs[2], sourceOverrides);
    if (signing.kind !== 'firebase-phone-play-signing-allowlist'
        || signing.candidate?.buildNumber !== realDeviceEvidence.testedBuildNumber
        || signing.candidate?.delivery !== realDeviceEvidence.delivery
        || signing.realDeviceObservation?.playStoreInstallVerified !== true
        || signing.realDeviceObservation?.firebaseResult !== 'REAL_SMS_VERIFICATION_PASSED'
        || signing.realDeviceObservation?.smsSent !== true
        || signing.realDeviceObservation?.finalRetest !== 'valid-code-accepted-invalid-code-rejected') {
      fail('Play-signing SMS evidence does not prove the declared Android result.');
    }
    if (sms.kind !== 'firebase-phone-real-sms-verification'
        || sms.candidate?.buildNumber !== realDeviceEvidence.testedBuildNumber
        || sms.candidate?.delivery !== realDeviceEvidence.delivery
        || sms.realDeviceResults?.realSmsDelivered !== true
        || sms.realDeviceResults?.validLatestCodeAccepted !== true
        || sms.realDeviceResults?.verifiedStatePersistedAfterFreshLogin !== true
        || sms.realDeviceResults?.invalidCodeRejected !== true
        || sms.realDeviceResults?.accountRemainedUnverifiedAfterInvalidCode !== true) {
      fail('Real-device SMS evidence does not prove the declared Android result.');
    }
    if (currentCandidate.kind !== 'android-release-candidate'
        || currentCandidate.candidate?.buildNumber !== sourceBuild.buildNumber
        || currentCandidate.googlePlayInternalRelease?.status !== 'store-install-verified') {
      fail('Phone verification readiness is not bound to the current Play candidate.');
    }
  } else if (realDeviceEvidence !== undefined) {
    fail('Pending phone verification readiness must not include passed device evidence.');
  }

  const externalGates = readiness.externalGates ?? {};
  const expectedGates = {
    firebasePhoneProvider: activated ? 'enabled-owner-authorized' : 'pending-explicit-owner-acceptance-and-enable',
    smsRegionPolicy: activated ? 'germany-only-saved' : 'pending-germany-only-owner-approval',
    androidAppVerification: devicePassed ? 'play-signing-passed' : 'signing-fingerprints-registered-successor-build-check-pending',
    androidRealDeviceSms: devicePassed ? 'passed' : 'pending',
    appleApnsConfiguration: 'pending-apple-account-and-apns',
    appleRealDeviceSms: 'pending',
    privacyAndProviderClassification: activated ? 'successor-candidate-copy-updated-play-form-pending' : 'pending-successor-candidate-reclassification',
    abuseAndQuotaObservation: devicePassed ? 'initial-real-device-observation-passed' : 'pending-staging-observation',
  };
  if (JSON.stringify(externalGates) !== JSON.stringify(expectedGates)
      || readiness.activationAllowed !== devicePassed
      || readiness.storeSubmissionAllowed !== false) {
    fail('Phone verification external gates must remain fail-closed.');
  }

  const boundaries = readiness.boundaries ?? {};
  const expectedBoundaries = {
    googleProviderEnabled: false,
    firebasePhoneProviderEnabled: activated,
    smsRegionPolicySaved: activated,
    smsSent: devicePassed,
    productionChanged: false,
    storeSubmissionChanged: false,
    externalConsoleChanged: activated,
    containsPhoneNumbers: false,
    containsSmsCodes: false,
    containsFirebaseTokens: false,
    containsCredentials: false,
    containsSecrets: false,
  };
  if (JSON.stringify(boundaries) !== JSON.stringify(expectedBoundaries)) {
    fail('Phone verification evidence crosses a protected boundary.');
  }
  const serialized = JSON.stringify(readiness);
  if (serialized.includes('@')
      || /\+\d{8,15}/u.test(serialized)
      || /AIza[0-9A-Za-z_-]{30,}/u.test(serialized)) {
    fail('Phone verification readiness contains account data or a secret.');
  }

  const backendConfig = source(root, 'backend/src/config.js', sourceOverrides);
  includes(backendConfig, "process.env.FIREBASE_PHONE_VERIFICATION_ENABLED ?? 'false'", 'backend config');
  includes(backendConfig, 'phoneVerification: Object.freeze({', 'backend config');

  const backendVerifier = source(root, 'backend/src/firebase_phone_verification.js', sourceOverrides);
  includes(backendVerifier, "sign_in_provider, 40) !== 'phone'", 'phone token verifier');
  includes(backendVerifier, 'await verify(token, true)', 'phone token verifier');
  includes(backendVerifier, 'config.phoneVerification.enabled', 'phone token verifier');
  includes(backendVerifier, "providers[0]?.providerId !== 'phone'", 'temporary phone identity cleanup');
  includes(backendVerifier, 'await remove(firebaseUserId)', 'temporary phone identity cleanup');
  includes(backendVerifier, "PhoneVerificationError(502, 'phone_identity_cleanup_failed'", 'temporary phone identity cleanup');

  const backendApp = source(root, 'backend/src/app.js', sourceOverrides);
  includes(backendApp, "app.get('/v1/auth/phone-verification/status'", 'backend app');
  includes(backendApp, "app.post('/v1/auth/phone-verification/confirm'", 'backend app');
  includes(backendApp, "throw new HttpError(422, 'phone_verification_mismatch')", 'backend app');
  includes(backendApp, "metadata: { provider: 'firebase-phone' }", 'backend app');
  includes(backendApp, 'await deletePhoneIdentity(verified)', 'backend app');

  const migration = source(root, 'backend/sql/migrations/010_phone_verification.up.sql', sourceOverrides);
  includes(migration, 'CREATE UNIQUE INDEX IF NOT EXISTS users_verified_phone_unique_idx', 'phone migration');
  includes(migration, 'phone_verified_at IS NOT NULL', 'phone migration');

  const authService = source(root, 'lib/services/auth_service.dart', sourceOverrides);
  includes(authService, "path: '/auth/phone-verification/status'", 'Flutter auth service');
  includes(authService, "path: '/auth/phone-verification/confirm'", 'Flutter auth service');
  includes(authService, 'FirebaseAuth.instance.verifyPhoneNumber(', 'Flutter auth service');
  if (authService.includes('phoneVerified: true')) {
    fail('Flutter auth service must not grant client-side phone verification.');
  }

  const contactScreen = source(root, 'lib/screens/contact_data_screen.dart', sourceOverrides);
  includes(contactScreen, 'Firebase Authentication (Google)', 'phone consent UI');
  includes(contactScreen, 'ShareItToo speichert keinen SMS-Code', 'phone consent UI');
  if (contactScreen.includes('Demo SMS code') || contactScreen.includes('Demo‑Code')) {
    fail('Demo phone verification bypass remains in the UI.');
  }

  const privacy = JSON.parse(source(root, 'store/privacy-disclosures.json', sourceOverrides));
  const phone = privacy.dataTypes?.find((entry) => entry?.id === 'phoneNumber');
  if (phone?.collected !== true
      || phone?.optional !== true
      || phone?.tracking !== false
      || !phone?.purposes?.includes('fraudPreventionSecurityCompliance')) {
    fail('Phone number privacy disclosure is missing or unsafe.');
  }

  return {
    state: readiness.state,
    buildNumber: sourceBuild.buildNumber,
    openGates: Object.values(externalGates).filter((value) => value.includes('pending')).length,
    activationAllowed: readiness.activationAllowed,
  };
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const unknownArgs = process.argv.slice(2).filter(
    (arg) => arg !== '--allow-candidate-rollover',
  );
  if (unknownArgs.length > 0) {
    fail(`Unknown argument: ${unknownArgs[0]}`);
  }
  const result = validatePhoneVerificationReadiness({
    root,
    allowCandidateRollover: process.argv.includes('--allow-candidate-rollover'),
  });
  process.stdout.write(
    `Phone verification readiness: PASS (${result.state}, build ${result.buildNumber}, open gates ${result.openGates})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Phone verification readiness validation failed.'}\n`);
    process.exitCode = 1;
  }
}
