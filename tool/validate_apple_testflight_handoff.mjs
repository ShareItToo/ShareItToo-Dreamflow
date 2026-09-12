#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const forbiddenKey = /(password|passcode|secret|token|credential|private.?key|api.?key|otp|pin)$/i;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} does not match the fail-closed Apple handoff.`);
}

function includes(source, needle, label) {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}.`);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function noCredentials(value, path = 'handoff') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => noCredentials(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenKey.test(key)) fail(`${path}.${key} is a forbidden credential-shaped field.`);
    noCredentials(entry, `${path}.${key}`);
  }
}

function source(root, relativePath, overrides) {
  if (Object.hasOwn(overrides, relativePath)) return overrides[relativePath];
  return readFileSync(resolve(root, relativePath), 'utf8');
}

function plistScalar(xml, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`).exec(xml);
  return match?.[1] ?? null;
}

function privacyDataType(xml, type) {
  return xml.includes(`<string>${type}</string>`);
}

export function validateAppleTestFlightHandoff({
  root,
  handoffOverride,
  sourceOverrides = {},
  allowAndroidCandidateRollover = false,
}) {
  const handoff = object(handoffOverride ?? JSON.parse(source(
    root, 'store/apple/testflight-handoff.json', sourceOverrides)), 'handoff');
  noCredentials(handoff);
  same(handoff.schemaVersion, 1, 'schemaVersion');
  same(handoff.status, 'static-config-ready-tooling-and-account-gates-pending', 'status');
  same(handoff.submissionAllowed, false, 'submissionAllowed');
  same(handoff.distribution, 'testflight-internal', 'distribution');
  same(handoff.containsSecrets, false, 'containsSecrets');
  same(handoff.containsAccountIdentifiers, false, 'containsAccountIdentifiers');

  const candidate = object(handoff.candidate, 'candidate');
  same(candidate.bundleId, 'com.shareittoo.app', 'candidate.bundleId');
  same(candidate.versionName, '1.0.0', 'candidate.versionName');
  same(candidate.buildNumber, '2026081509', 'candidate.buildNumber');
  same(candidate.commit, '3fa045b98897f9551f91da932136c2b100b2d700', 'candidate.commit');
  same(candidate.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'candidate.apiBaseUrl');
  same(candidate.firebaseConfigured, true, 'candidate.firebaseConfigured');
  same(candidate.firebaseAnalyticsEnabled, false, 'candidate.firebaseAnalyticsEnabled');
  same(candidate.advertisingEnabled, false, 'candidate.advertisingEnabled');

  const pubspec = source(root, 'pubspec.yaml', sourceOverrides);
  if (allowAndroidCandidateRollover) {
    const currentVersion = /^version:\s+([^+\s]+)\+(\d{10})$/mu.exec(pubspec);
    const currentBuildNumber = currentVersion?.[2] ?? '';
    const candidateBuildNumber = String(candidate.buildNumber ?? '');
    const buildNumbersValid = /^\d{10}$/u.test(currentBuildNumber) &&
      /^\d{10}$/u.test(candidateBuildNumber);
    if (currentVersion?.[1] !== candidate.versionName ||
        !buildNumbersValid ||
        BigInt(currentBuildNumber) < BigInt(candidateBuildNumber) ||
        handoff.submissionAllowed !== false) {
      fail('Android-only rollover must keep the unchanged Apple handoff safely pending.');
    }
  } else {
    includes(pubspec, `version: ${candidate.versionName}+${candidate.buildNumber}`, 'pubspec.yaml');
  }
  const infoPlist = source(root, 'ios/Runner/Info.plist', sourceOverrides);
  for (const value of [
    '<string>ShareItToo</string>',
    '<string>shareittoo</string>',
    '<key>NSCameraUsageDescription</key>',
    '<key>NSLocationWhenInUseUsageDescription</key>',
    '<key>NSPhotoLibraryUsageDescription</key>',
    '<key>NSPhotoLibraryAddUsageDescription</key>',
    '<string>remote-notification</string>',
  ]) includes(infoPlist, value, 'ios/Runner/Info.plist');

  const entitlements = source(root, 'ios/Runner/Runner.entitlements', sourceOverrides);
  includes(entitlements, '<string>$(APS_ENVIRONMENT)</string>', 'Runner.entitlements');
  for (const domain of handoff.verifiedStaticConfiguration.associatedDomains) {
    includes(entitlements, `<string>${domain}</string>`, 'Runner.entitlements');
  }

  const project = source(root, 'ios/Runner.xcodeproj/project.pbxproj', sourceOverrides);
  if (count(project, 'PRODUCT_BUNDLE_IDENTIFIER = com.shareittoo.app;') !== 3) {
    fail('Runner Debug, Profile and Release must use the ShareItToo bundle ID.');
  }
  includes(project, 'APS_ENVIRONMENT = development;', 'Xcode project');
  if (count(project, 'APS_ENVIRONMENT = production;') !== 2) {
    fail('Profile and Release must use production APNs entitlements.');
  }
  includes(project, 'scripts/upload_ios_crashlytics_symbols.sh', 'Xcode project');

  const privacyManifest = source(root, 'ios/Runner/PrivacyInfo.xcprivacy', sourceOverrides);
  includes(privacyManifest, '<key>NSPrivacyTracking</key>\n\t<false/>', 'Runner privacy manifest');
  includes(privacyManifest, '<key>NSPrivacyTrackingDomains</key>\n\t<array/>', 'Runner privacy manifest');
  includes(privacyManifest, '<key>NSPrivacyAccessedAPITypes</key>\n\t<array/>', 'Runner privacy manifest');
  for (const type of [
    'NSPrivacyCollectedDataTypeName',
    'NSPrivacyCollectedDataTypeEmailAddress',
    'NSPrivacyCollectedDataTypePhoneNumber',
    'NSPrivacyCollectedDataTypePhysicalAddress',
    'NSPrivacyCollectedDataTypeUserID',
    'NSPrivacyCollectedDataTypeCoarseLocation',
    'NSPrivacyCollectedDataTypePreciseLocation',
    'NSPrivacyCollectedDataTypePhotosorVideos',
    'NSPrivacyCollectedDataTypeEmailsOrTextMessages',
    'NSPrivacyCollectedDataTypeOtherUserContent',
    'NSPrivacyCollectedDataTypePurchaseHistory',
    'NSPrivacyCollectedDataTypeOtherFinancialInfo',
    'NSPrivacyCollectedDataTypeDeviceID',
    'NSPrivacyCollectedDataTypeCrashData',
    'NSPrivacyCollectedDataTypeOtherDiagnosticData',
    'NSPrivacyCollectedDataTypeProductInteraction',
  ]) {
    if (!privacyDataType(privacyManifest, type)) fail(`Runner privacy manifest is missing ${type}.`);
  }
  if (count(project, 'PrivacyInfo.xcprivacy in Resources') !== 2 ||
      count(project, '/* PrivacyInfo.xcprivacy */') !== 3) {
    fail('Runner privacy manifest must be referenced once and bound once to Runner resources.');
  }
  same(
    handoff.verifiedStaticConfiguration.runnerPrivacyManifestPresent,
    true,
    'verifiedStaticConfiguration.runnerPrivacyManifestPresent',
  );
  same(
    handoff.verifiedStaticConfiguration.runnerPrivacyManifestTracking,
    false,
    'verifiedStaticConfiguration.runnerPrivacyManifestTracking',
  );
  same(
    handoff.verifiedStaticConfiguration.runnerPrivacyManifestBoundToTarget,
    true,
    'verifiedStaticConfiguration.runnerPrivacyManifestBoundToTarget',
  );

  const firebaseRelativePath = 'ios/Runner/GoogleService-Info.plist';
  const firebasePath = resolve(root, firebaseRelativePath);
  const firebaseOverridePresent = Object.hasOwn(sourceOverrides, firebaseRelativePath);
  const firebaseOverridden = typeof sourceOverrides[firebaseRelativePath] === 'string';
  const firebasePresent = firebaseOverridden ||
    (!firebaseOverridePresent && existsSync(firebasePath));
  const gitignore = source(root, '.gitignore', sourceOverrides);
  if (!gitignore.includes('/ios/Runner/GoogleService-Info.plist')) {
    fail('Apple Firebase configuration must remain outside version control.');
  }
  if (firebasePresent) {
    const firebase = source(root, firebaseRelativePath, sourceOverrides);
    same(plistScalar(firebase, 'BUNDLE_ID'), candidate.bundleId, 'Firebase BUNDLE_ID');
    const falseBoolean = '<false(?:\\s*\\/|>\\s*<\\/false\\s*)>';
    if (!new RegExp(`<key>IS_ANALYTICS_ENABLED<\\/key>\\s*${falseBoolean}`).test(firebase) ||
        !new RegExp(`<key>IS_ADS_ENABLED<\\/key>\\s*${falseBoolean}`).test(firebase)) {
      fail('Apple Firebase Analytics and ads must remain disabled.');
    }
  }

  const accountGates = object(handoff.accountGates, 'accountGates');
  for (const key of [
    'enrollmentTypeDecision', 'appleAccountWithTwoFactor',
    'developerProgramMembership', 'latestAgreementAccepted',
  ]) same(accountGates[key], 'pending-user', `accountGates.${key}`);
  for (const key of [
    'appRecordCreated', 'bundleIdentifierRegistered', 'signingTeamAvailable',
    'apnsCredentialConfiguredInFirebase',
  ]) same(accountGates[key], false, `accountGates.${key}`);

  const tooling = object(handoff.toolingGates, 'toolingGates');
  for (const [key, value] of Object.entries(tooling)) {
    same(value, key === 'runnerPrivacyManifestValidated', `toolingGates.${key}`);
  }
  const toolingAudit = object(handoff.toolingAudit, 'toolingAudit');
  same(toolingAudit.evidenceRef,
    'docs/evidence/b11/ios-local-tooling-readiness-2026081509-20260815.json',
    'toolingAudit.evidenceRef');
  same(toolingAudit.fullXcodeApplicationPresent, false,
    'toolingAudit.fullXcodeApplicationPresent');
  same(toolingAudit.activeDeveloperDirectory, 'command-line-tools-only',
    'toolingAudit.activeDeveloperDirectory');
  same(toolingAudit.xcodebuildAvailable, false, 'toolingAudit.xcodebuildAvailable');
  same(toolingAudit.cocoaPodsAvailable, false, 'toolingAudit.cocoaPodsAvailable');
  same(toolingAudit.flutterDoctorIosReady, false, 'toolingAudit.flutterDoctorIosReady');
  same(toolingAudit.archiveAttempted, false, 'toolingAudit.archiveAttempted');
  same(toolingAudit.evidenceConclusion,
    'blocked-before-build-by-missing-local-ios-tooling',
    'toolingAudit.evidenceConclusion');
  same(toolingAudit.diagnosticCommand,
    'node tool/diagnose_ios_tooling_readiness.mjs',
    'toolingAudit.diagnosticCommand');
  if (toolingAudit.checkedAt !== '2026-08-15T14:35:12Z') {
    fail('toolingAudit.checkedAt must record the current sanitized tooling audit.');
  }
  const toolingEvidence = object(JSON.parse(source(
    root, toolingAudit.evidenceRef, sourceOverrides)), 'tooling readiness evidence');
  same(toolingEvidence.kind, 'ios-local-tooling-readiness', 'tooling evidence.kind');
  same(toolingEvidence.status, 'pending-local-tooling', 'tooling evidence.status');
  same(toolingEvidence.capturedAt, toolingAudit.checkedAt, 'tooling evidence.capturedAt');
  same(toolingEvidence.candidate?.buildNumber, candidate.buildNumber,
    'tooling evidence.candidate.buildNumber');
  same(toolingEvidence.observed?.fullXcodeApplicationPresent, false,
    'tooling evidence.observed.fullXcodeApplicationPresent');
  same(toolingEvidence.observed?.xcodebuildAvailable, false,
    'tooling evidence.observed.xcodebuildAvailable');
  same(toolingEvidence.observed?.cocoaPodsAvailable, false,
    'tooling evidence.observed.cocoaPodsAvailable');
  same(toolingEvidence.boundaries?.archiveAttempted, false,
    'tooling evidence.boundaries.archiveAttempted');
  same(toolingEvidence.boundaries?.uploadAttempted, false,
    'tooling evidence.boundaries.uploadAttempted');
  same(toolingEvidence.boundaries?.containsSecrets, false,
    'tooling evidence.boundaries.containsSecrets');
  same(toolingEvidence.boundaries?.containsAccountIdentifiers, false,
    'tooling evidence.boundaries.containsAccountIdentifiers');
  for (const [key, value] of Object.entries(object(handoff.postUploadChecks, 'postUploadChecks'))) {
    same(value, 'pending', `postUploadChecks.${key}`);
  }
  for (const [key, value] of Object.entries(object(handoff.hardStops, 'hardStops'))) {
    same(value, true, `hardStops.${key}`);
  }

  const worksheetPath = handoff.worksheetRef;
  if (typeof worksheetPath !== 'string' || !existsSync(resolve(root, worksheetPath))) {
    fail('Apple worksheet reference is unavailable.');
  }
  return { bundleId: candidate.bundleId, buildNumber: candidate.buildNumber };
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--allow-android-candidate-rollover')) {
    fail(`Unknown argument: ${args.find((arg) => arg !== '--allow-android-candidate-rollover')}`);
  }
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateAppleTestFlightHandoff({
    root,
    allowAndroidCandidateRollover: args.includes('--allow-android-candidate-rollover'),
  });
  process.stdout.write(`Apple TestFlight handoff: PASS (build ${result.buildNumber}, account/tooling pending)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Apple TestFlight handoff failed.'}\n`);
    process.exitCode = 1;
  }
}
