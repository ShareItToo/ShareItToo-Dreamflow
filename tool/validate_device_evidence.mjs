#!/usr/bin/env node

import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requiredCells = new Map([
  ['android-wifi-owner', { platform: 'android', network: 'wifi', role: 'owner' }],
  ['android-hotspot-renter', { platform: 'android', network: 'hotspot', role: 'renter' }],
  ['ios-wifi-owner', { platform: 'ios', network: 'wifi', role: 'owner' }],
  ['ios-hotspot-renter', { platform: 'ios', network: 'hotspot', role: 'renter' }],
]);

const requiredDeviceTests = [
  'installAndFirstStart',
  'authenticationAndSession',
  'listingAndBooking',
  'chatAndDeepLink',
  'pushForeground',
  'pushBackground',
  'pushTerminated',
  'handoverAndReturn',
  'moderationAndAccount',
  'offlineRecovery',
  'largeTextAndScreenReader',
];

const requiredReleaseChecks = [
  'candidateIdentityAndSignatures',
  'firebaseFcmAndApns',
  'binaryPrivacyAndNetwork',
  'crashReleaseMapping',
  'storeWarningsLinksAndSigning',
  'stagingCleanupAndHealth',
  'productionInvariant',
];

const deviceGateKeys = [
  'realAndroidAndIosDevices',
  'finalBinaryPrivacyScan',
  'closedStoreAndAccessibilityMatrix',
];

const allowedProgressStates = new Set(['open', 'testing', 'passed', 'failed', 'blocked']);
const forbiddenSecretKeys = /^(password|secret|token|apiKey|privateKey|serviceAccount|reviewCredentials|reviewPassword|reviewUsername)$/i;
const forbiddenDeviceIdentifierKeys = /^(serial|serialNumber|androidId|advertisingId|imei|meid|idfa|udid)$/i;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function nullableString(value, label) {
  if (value === null) return null;
  return nonEmptyString(value, label);
}

function assertNoSensitiveFields(value, label = 'device validation') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveFields(entry, `${label}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenSecretKeys.test(key)) {
      fail(`${label}.${key} must never contain credentials or secrets.`);
    }
    if (forbiddenDeviceIdentifierKeys.test(key)) {
      fail(`${label}.${key} must never contain a raw device identifier.`);
    }
    assertNoSensitiveFields(entry, `${label}.${key}`);
  }
}

function assertSha256(value, label, { required }) {
  if (value === null && !required) return;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) {
    fail(`${label} must be a 64-character SHA-256 value.`);
  }
}

function evidenceRef(root, value, label, { required }) {
  if (value === null && !required) return null;
  const ref = nonEmptyString(value, label);
  if (isAbsolute(ref) || ref.includes('..') || !ref.startsWith('docs/evidence/b11/')) {
    fail(`${label} must stay below docs/evidence/b11/.`);
  }
  if (required || value !== null) {
    const fullPath = resolve(root, ref);
    const allowedRoot = resolve(root, 'docs/evidence/b11');
    const rel = relative(allowedRoot, fullPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      fail(`${label} escapes the B11 evidence directory.`);
    }
    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      fail(`${label} does not exist: ${ref}`);
    }
    if (stat.isSymbolicLink()) {
      fail(`${label} must not reference a symbolic link.`);
    }
    if (!stat.isFile() || stat.size === 0 || stat.size > 1024 * 1024) {
      fail(`${label} must reference a non-empty evidence file.`);
    }
    const canonicalRoot = realpathSync(allowedRoot);
    const canonicalFile = realpathSync(fullPath);
    const canonicalRelative = relative(canonicalRoot, canonicalFile);
    if (canonicalRelative.startsWith('..') || isAbsolute(canonicalRelative)) {
      fail(`${label} must not escape the B11 evidence directory through a linked path.`);
    }
  }
  return ref;
}

function readEvidenceJson(root, ref, label) {
  if (!ref.endsWith('.json')) {
    fail(`${label} must reference a structured JSON evidence file.`);
  }
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(resolve(root, ref), 'utf8'));
  } catch {
    fail(`${label} must contain valid JSON evidence.`);
  }
  object(evidence, label);
  assertNoSensitiveFields(evidence, label);
  return evidence;
}

function assertEvidenceCandidate(evidence, candidate, label) {
  const identity = object(evidence.candidate, `${label}.candidate`);
  for (const key of [
    'applicationId',
    'bundleId',
    'versionName',
    'buildNumber',
    'commit',
    'releaseChannel',
    'apiBaseUrl',
    'firebaseConfigured',
    'paymentMode',
    'stripeLivemode',
  ]) {
    if (identity[key] !== candidate[key]) {
      fail(`${label}.candidate.${key} must match store/device-validation.json.`);
    }
  }
}

function assertEvidenceBoundaries(evidence, label) {
  const boundaries = object(evidence.boundaries, `${label}.boundaries`);
  if (boundaries.containsSecrets !== false ||
      boundaries.containsRawDeviceIdentifiers !== false ||
      boundaries.containsReviewCredentials !== false ||
      boundaries.syntheticAccountsOnly !== true) {
    fail(`${label}.boundaries must prove sanitized, secret-free, synthetic-only evidence.`);
  }
}

function validateDeviceCellEvidence(root, ref, cell, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (evidence.schemaVersion !== 1 || evidence.kind !== 'device-matrix-cell' || evidence.status !== 'passed') {
    fail(`${label} must be a passed device-matrix-cell evidence document.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, label);
  assertEvidenceBoundaries(evidence, label);

  const recordedCell = object(evidence.cell, `${label}.cell`);
  for (const key of [
    'id',
    'platform',
    'network',
    'role',
    'deviceType',
    'deviceModel',
    'osVersion',
    'storeInstall',
    'screenReader',
  ]) {
    if (recordedCell[key] !== cell[key]) {
      fail(`${label}.cell.${key} must match its device matrix entry.`);
    }
  }
  const tests = object(recordedCell.tests, `${label}.cell.tests`);
  if (Object.keys(tests).length !== requiredDeviceTests.length) {
    fail(`${label}.cell.tests must contain exactly the required B11 device checks.`);
  }
  for (const key of requiredDeviceTests) {
    const result = object(tests[key], `${label}.cell.tests.${key}`);
    if (result.status !== 'passed') {
      fail(`${label}.cell.tests.${key}.status must be passed.`);
    }
    isoTimestamp(result.checkedAt, `${label}.cell.tests.${key}.checkedAt`, { required: true });
    nonEmptyString(result.summary, `${label}.cell.tests.${key}.summary`);
  }
}

function validateDeviceCellProgressEvidence(root, ref, cell, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'device-matrix-cell-progress' ||
      evidence.status !== cell.status ||
      !['open', 'testing'].includes(evidence.status)) {
    fail(`${label} must be an open or testing device-matrix-cell-progress document.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, label);
  assertEvidenceBoundaries(evidence, label);

  const recordedCell = object(evidence.cell, `${label}.cell`);
  for (const key of [
    'id',
    'platform',
    'network',
    'role',
    'deviceType',
    'deviceModel',
    'osVersion',
    'storeInstall',
    'screenReader',
  ]) {
    if (recordedCell[key] !== cell[key]) {
      fail(`${label}.cell.${key} must match its device matrix entry.`);
    }
  }
  const tests = object(recordedCell.tests, `${label}.cell.tests`);
  if (Object.keys(tests).length !== requiredDeviceTests.length) {
    fail(`${label}.cell.tests must contain exactly the required B11 device checks.`);
  }
  for (const key of requiredDeviceTests) {
    const result = object(tests[key], `${label}.cell.tests.${key}`);
    if (result.status !== cell.tests[key]) {
      fail(`${label}.cell.tests.${key}.status must match the device matrix progress.`);
    }
    nonEmptyString(result.summary, `${label}.cell.tests.${key}.summary`);
    if (!Array.isArray(result.evidenceRefs)) {
      fail(`${label}.cell.tests.${key}.evidenceRefs must be an array.`);
    }
    if (result.status === 'passed' || result.status === 'testing') {
      isoTimestamp(result.checkedAt, `${label}.cell.tests.${key}.checkedAt`, { required: true });
      if (result.evidenceRefs.length === 0) {
        fail(`${label}.cell.tests.${key} requires at least one evidence reference.`);
      }
      for (const [index, sourceRef] of result.evidenceRefs.entries()) {
        const verifiedRef = evidenceRef(
          root,
          sourceRef,
          `${label}.cell.tests.${key}.evidenceRefs[${index}]`,
          { required: true },
        );
        readEvidenceJson(
          root,
          verifiedRef,
          `${label}.cell.tests.${key}.sourceEvidence[${index}]`,
        );
      }
    } else {
      if (result.checkedAt !== null || result.evidenceRefs.length !== 0) {
        fail(`${label}.cell.tests.${key} must remain without passed evidence while open.`);
      }
    }
  }
}

function validateAndroidDirectDiagnostic(root, diagnostic, candidate) {
  const label = 'candidate.android.directDiagnostic';
  if (diagnostic.status !== 'passed' || diagnostic.installMethod !== 'direct-apk-diagnostic') {
    fail(`${label} must record a passed direct-apk-diagnostic.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }
  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-direct-device-smoke' ||
      evidence.status !== 'installed-launched-pending-manual-matrix') {
    fail(`${label}.evidence must be an installed Android direct-device smoke document.`);
  }
  if (evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence.capturedAt must match the diagnostic manifest.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);
  assertEvidenceBoundaries(evidence, `${label}.evidence`);

  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (evidence.candidate.apkSha256 !== expectedAndroid.apkSha256 ||
      evidence.candidate.signingCertificateSha256 !== expectedAndroid.signingCertificateSha256 ||
      evidence.candidate.privacyScan !== 'passed') {
    fail(`${label}.evidence candidate hash, certificate, or privacy scan does not match.`);
  }
  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true ||
      device.manufacturer !== diagnostic.manufacturer ||
      device.model !== diagnostic.deviceModel ||
      device.osVersion !== diagnostic.osVersion) {
    fail(`${label}.evidence.device must match the recorded physical Android device.`);
  }
  const installation = object(evidence.installation, `${label}.evidence.installation`);
  if (installation.method !== diagnostic.installMethod ||
      installation.installed !== true ||
      installation.installedVersionVerified !== true ||
      installation.installedBuildVerified !== true ||
      installation.firstLaunchEvent !== 'passed' ||
      installation.foregroundActivityVerified !== true ||
      installation.storeInstallationGateSatisfied !== false) {
    fail(`${label}.evidence does not prove the bounded direct installation and first launch.`);
  }
  const boundaries = evidence.boundaries;
  if (boundaries.manualFunctionalMatrixPassed !== false ||
      boundaries.playInternalInstallPassed !== false ||
      boundaries.realPushPassed !== false) {
    fail(`${label}.evidence must keep manual, Play Internal, and real-push gates open.`);
  }
}

function validateAndroidDirectAppLinks(root, diagnostic, candidate) {
  const label = 'candidate.android.directAppLinks';
  if (diagnostic.status !== 'passed' || diagnostic.installMethod !== 'direct-apk-diagnostic') {
    fail(`${label} must record a passed direct-apk-diagnostic.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }
  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-direct-app-link-diagnostic' ||
      evidence.status !== 'passed-bounded-app-link-diagnostic') {
    fail(`${label}.evidence must be a passed bounded Android app-link diagnostic.`);
  }
  if (evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence.capturedAt must match the diagnostic manifest.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);
  assertEvidenceBoundaries(evidence, `${label}.evidence`);

  const installed = object(evidence.installed, `${label}.evidence.installed`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (installed.packageIdentityVerified !== true ||
      installed.versionName !== candidate.versionName ||
      installed.buildNumber !== candidate.buildNumber ||
      installed.apkSha256 !== expectedAndroid.apkSha256) {
    fail(`${label}.evidence must prove the exact installed candidate APK and package identity.`);
  }

  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true ||
      device.manufacturer !== diagnostic.manufacturer ||
      device.model !== diagnostic.deviceModel ||
      device.osVersion !== diagnostic.osVersion ||
      device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.evidence.device must match the sanitized physical Android device.`);
  }

  const expectedTests = new Map([
    ['verifiedHttpsMissingListing', 'safe-listing-unavailable-surface'],
    ['customSchemeGuestChat', 'authentication-required-surface'],
    ['unsafeIdentifierRejected', 'guest-start-preserved'],
    ['foreignHostNotAssociated', 'shareittoo-package-absent'],
  ]);
  const tests = object(evidence.tests, `${label}.evidence.tests`);
  if (Object.keys(tests).length !== expectedTests.size) {
    fail(`${label}.evidence.tests must contain exactly the four bounded app-link checks.`);
  }
  for (const [key, expectedResult] of expectedTests) {
    const result = object(tests[key], `${label}.evidence.tests.${key}`);
    if (result.status !== 'passed' || result.result !== expectedResult) {
      fail(`${label}.evidence.tests.${key} must contain the expected passed result.`);
    }
  }

  const boundaries = evidence.boundaries;
  if (boundaries.directDiagnosticOnly !== true ||
      boundaries.storeInstallationGateSatisfied !== false ||
      boundaries.manualFunctionalMatrixPassed !== false ||
      boundaries.authenticatedDeepLinksPassed !== false ||
      boundaries.realPushPassed !== false ||
      boundaries.lockCodeUsed !== false) {
    fail(`${label}.evidence must keep store, manual, authenticated, push, and lock-code gates open.`);
  }
}

function validateAndroidAuthenticatedSession(root, diagnostic, candidate) {
  const label = 'candidate.android.authenticatedSession';
  if (diagnostic.status !== 'passed'
      || !['direct-apk-diagnostic', 'google-play-split'].includes(diagnostic.installMethod)) {
    fail(`${label} must record a passed supported Android installation diagnostic.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }

  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-authenticated-session-diagnostic' ||
      evidence.status !== 'passed-bounded-authenticated-session-diagnostic') {
    fail(`${label}.evidence must be a passed bounded authenticated-session diagnostic.`);
  }
  if (evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence.capturedAt must match the diagnostic manifest.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);

  const installed = object(evidence.installed, `${label}.evidence.installed`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (installed.packageIdentityVerified !== true ||
      installed.versionName !== candidate.versionName ||
      installed.buildNumber !== candidate.buildNumber) {
    fail(`${label}.evidence must prove the exact installed candidate version and package identity.`);
  }
  const directInstall = installed.delivery === undefined || installed.delivery === 'direct-apk';
  const playInstall = installed.delivery === 'google-play-split';
  if (directInstall) {
    if (installed.apkSha256 !== expectedAndroid.apkSha256
        || diagnostic.installMethod !== 'direct-apk-diagnostic') {
      fail(`${label}.evidence must prove the exact installed candidate APK and package identity.`);
    }
  } else if (!playInstall
      || diagnostic.installMethod !== 'google-play-split'
      || installed.installerPackageName !== 'com.android.vending'
      || !Number.isInteger(installed.splitCount)
      || installed.splitCount < 2
      || installed.apkSha256 !== undefined) {
    fail(`${label}.evidence must prove an exact-version Google Play split installation.`);
  }

  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true ||
      device.manufacturer !== diagnostic.manufacturer ||
      device.model !== diagnostic.deviceModel ||
      device.osVersion !== diagnostic.osVersion ||
      !Number.isInteger(device.apiLevel) || device.apiLevel <= 0 ||
      typeof device.securityPatch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(device.securityPatch) ||
      device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.evidence.device must match the sanitized physical Android device.`);
  }

  const expectedTests = new Map([
    ['authenticatedProfileAccess', 'authenticated-actions-present'],
    ['coldStartSessionRestore', 'authenticated-profile-restored-after-force-stop'],
  ]);
  const tests = object(evidence.tests, `${label}.evidence.tests`);
  if (Object.keys(tests).length !== expectedTests.size) {
    fail(`${label}.evidence.tests must contain exactly the two bounded session checks.`);
  }
  for (const [key, expectedResult] of expectedTests) {
    const result = object(tests[key], `${label}.evidence.tests.${key}`);
    if (result.status !== 'passed' || result.result !== expectedResult) {
      fail(`${label}.evidence.tests.${key} must contain the expected passed result.`);
    }
  }

  if (diagnostic.networkCondition !== undefined) {
    if (diagnostic.networkCondition !== 'offline') {
      fail(`${label}.networkCondition must be offline when recorded.`);
    }
    const network = object(evidence.network, `${label}.evidence.network`);
    if (network.condition !== 'offline' ||
        network.wifiDisabled !== true ||
        network.mobileDataDisabled !== true ||
        network.connectivityGate !== 'passed-no-connectivity' ||
        network.networkRestored !== 'passed') {
      fail(`${label}.evidence.network must prove the bounded offline gate and network restoration.`);
    }
  }

  const expectedBoundaries = {
    directDiagnosticOnly: directInstall,
    storeInstallationGateSatisfied: playInstall,
    syntheticRoleMatrixPassed: false,
    bookingFlowPassed: false,
    authenticatedDeepLinksPassed: false,
    realPushPassed: false,
    manualTalkBackTraversalPassed: false,
    lockCodeUsed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  };
  const boundaries = object(evidence.boundaries, `${label}.evidence.boundaries`);
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length ||
      Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.evidence must remain identity-free and keep store, role, booking, link, push, TalkBack, and lock-code gates open.`);
  }
}

function validateAndroidSyntheticRoleBooking(root, diagnostic, candidate) {
  const label = 'candidate.android.syntheticRoleBooking';
  if (diagnostic.status !== 'passed'
      || !['direct-apk-diagnostic', 'google-play-split'].includes(diagnostic.installMethod)) {
    fail(`${label} must record a passed supported Android installation diagnostic.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }
  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-synthetic-role-booking-diagnostic' ||
      evidence.status !== 'passed-bounded-synthetic-role-booking-diagnostic') {
    fail(`${label}.evidence must be a passed bounded synthetic-role booking diagnostic.`);
  }
  if (evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence.capturedAt must match the diagnostic manifest.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);
  assertEvidenceBoundaries(evidence, `${label}.evidence`);

  const installed = object(evidence.installed, `${label}.evidence.installed`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (installed.packageIdentityVerified !== true ||
      installed.versionName !== candidate.versionName ||
      installed.buildNumber !== candidate.buildNumber) {
    fail(`${label}.evidence must prove the exact installed candidate version and package identity.`);
  }
  const directInstall = installed.delivery === undefined || installed.delivery === 'direct-apk';
  const playInstall = installed.delivery === 'google-play-split';
  if (directInstall) {
    if (installed.apkSha256 !== expectedAndroid.apkSha256
        || diagnostic.installMethod !== 'direct-apk-diagnostic') {
      fail(`${label}.evidence must prove the exact directly installed candidate APK.`);
    }
  } else if (!playInstall
      || diagnostic.installMethod !== 'google-play-split'
      || installed.installerPackageName !== 'com.android.vending'
      || !Number.isInteger(installed.splitCount)
      || installed.splitCount < 2
      || installed.apkSha256 !== undefined) {
    fail(`${label}.evidence must prove an exact-version Google Play split installation.`);
  }
  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true ||
      device.manufacturer !== diagnostic.manufacturer ||
      device.model !== diagnostic.deviceModel ||
      device.osVersion !== diagnostic.osVersion ||
      !Number.isInteger(device.apiLevel) || device.apiLevel <= 0 ||
      typeof device.securityPatch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(device.securityPatch) ||
      device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.evidence.device must match the sanitized physical Android device.`);
  }

  const fixture = object(evidence.backendFixture, `${label}.evidence.backendFixture`);
  if (fixture.accountCount !== 2 ||
      !Array.isArray(fixture.roles) ||
      fixture.roles.length !== 2 ||
      fixture.roles[0] !== 'owner' || fixture.roles[1] !== 'renter' ||
      fixture.registration !== 'public-staging-accepted' ||
      fixture.verification !== 'isolated-staging-fixture' ||
      fixture.listingStatus !== 'active' ||
      !Array.isArray(fixture.workflow) ||
      fixture.workflow.join(',') !== 'requested,accepted,active,completed' ||
      fixture.paymentMode !== 'memory' ||
      fixture.stripeLivemode !== false ||
      fixture.paymentEndpointCalled !== false) {
    fail(`${label}.evidence must prove the isolated two-role Staging lifecycle without payment.`);
  }
  const confirmations = object(fixture.confirmations, `${label}.evidence.backendFixture.confirmations`);
  const expectedConfirmations = {
    pickup: { presenterRole: 'owner', verifierRole: 'renter' },
    return: { presenterRole: 'renter', verifierRole: 'owner' },
  };
  for (const [segment, roles] of Object.entries(expectedConfirmations)) {
    const confirmation = object(
      confirmations[segment],
      `${label}.evidence.backendFixture.confirmations.${segment}`,
    );
    if (confirmation.status !== 'passed'
        || confirmation.presenterRole !== roles.presenterRole
        || confirmation.verifierRole !== roles.verifierRole
        || confirmation.verificationVersion !== 3
        || Object.keys(confirmation).length !== 4) {
      fail(`${label}.evidence must prove the V4 ${segment} counterparty confirmation.`);
    }
  }

  const expectedTests = new Map([
    ['ownerRequestVisibility', 'requested-visible-to-owner'],
    ['renterUpcomingVisibility', 'accepted-visible-to-renter'],
    ['renterRunningVisibility', 'active-visible-to-renter'],
    ['renterCompletedVisibility', 'completed-visible-to-renter'],
  ]);
  const tests = object(evidence.tests, `${label}.evidence.tests`);
  if (Object.keys(tests).length !== expectedTests.size) {
    fail(`${label}.evidence.tests must contain exactly the four bounded role-booking checks.`);
  }
  for (const [key, expectedResult] of expectedTests) {
    const result = object(tests[key], `${label}.evidence.tests.${key}`);
    if (result.status !== 'passed' || result.result !== expectedResult) {
      fail(`${label}.evidence.tests.${key} must contain the expected passed result.`);
    }
  }

  const isolation = object(evidence.isolation, `${label}.evidence.isolation`);
  if (isolation.protectedReviewFixtureUnchanged !== true ||
      isolation.temporaryVaultRemovedAfterProbe !== true ||
      isolation.temporaryBookingCompleted !== true ||
      isolation.temporaryListingPaused !== true ||
      isolation.containsReviewCredentials !== false ||
      Object.keys(isolation).length !== 5) {
    fail(`${label}.evidence must preserve the active protected review fixture through an isolated temporary vault.`);
  }

  const boundaries = object(evidence.boundaries, `${label}.evidence.boundaries`);
  if (boundaries.directDiagnosticOnly !== directInstall ||
      boundaries.storeInstallationGateSatisfied !== playInstall ||
      boundaries.fullDeviceMatrixPassed !== false ||
      boundaries.wifiOnlyDiagnostic !== true ||
      boundaries.hotspotPassed !== false ||
      boundaries.authenticatedDeepLinksPassed !== false ||
      boundaries.realPushPassed !== false ||
      boundaries.manualTalkBackTraversalPassed !== false ||
      boundaries.iosTestFlightPassed !== false ||
      boundaries.paymentEndpointCalled !== false ||
      boundaries.stripeLivemode !== false ||
      boundaries.lockCodeUsed !== false ||
      boundaries.accountIdentityRecorded !== false ||
      boundaries.containsPersonalAccountData !== false) {
    fail(`${label}.evidence must truthfully record installation provenance while keeping matrix, hotspot, link, push, TalkBack, iOS, payment, identity, and lock-code gates open.`);
  }
}

function validateAndroidAuthenticatedDeepLinks(root, diagnostic, candidate) {
  const label = 'candidate.android.authenticatedDeepLinks';
  if (diagnostic.status !== 'passed'
      || !['direct-apk-diagnostic', 'google-play-split'].includes(diagnostic.installMethod)) {
    fail(`${label} must record a passed supported Android installation diagnostic.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }
  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1
      || evidence.kind !== 'android-authenticated-deep-link-diagnostic'
      || evidence.status !== 'passed-bounded-authenticated-deep-link-diagnostic') {
    fail(`${label}.evidence must be a passed bounded authenticated deep-link diagnostic.`);
  }
  if (evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence.capturedAt must match the diagnostic manifest.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);

  const installed = object(evidence.installed, `${label}.evidence.installed`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (installed.packageIdentityVerified !== true
      || installed.versionName !== candidate.versionName
      || installed.buildNumber !== candidate.buildNumber) {
    fail(`${label}.evidence must prove the exact installed candidate APK and package identity.`);
  }
  const directInstall = installed.delivery === undefined || installed.delivery === 'direct-apk';
  const playInstall = installed.delivery === 'google-play-split';
  if (directInstall) {
    if (installed.apkSha256 !== expectedAndroid.apkSha256
        || diagnostic.installMethod !== 'direct-apk-diagnostic') {
      fail(`${label}.evidence must prove the exact installed candidate APK and package identity.`);
    }
  } else if (!playInstall
      || diagnostic.installMethod !== 'google-play-split'
      || installed.installerPackageName !== 'com.android.vending'
      || !Number.isInteger(installed.splitCount)
      || installed.splitCount < 2
      || installed.apkSha256 !== undefined) {
    fail(`${label}.evidence must prove an exact-version Google Play split installation.`);
  }
  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true
      || device.manufacturer !== diagnostic.manufacturer
      || device.model !== diagnostic.deviceModel
      || device.osVersion !== diagnostic.osVersion
      || !Number.isInteger(device.apiLevel) || device.apiLevel <= 0
      || typeof device.securityPatch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(device.securityPatch)
      || device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.evidence.device must match the sanitized physical Android device.`);
  }

  const expectedTests = new Map([
    ['authenticatedHttpsListing', 'synthetic-listing-visible'],
    ['authenticatedHttpsBooking', 'completed-booking-visible'],
    ['authenticatedCustomSchemeChat', 'booking-chat-visible'],
  ]);
  const tests = object(evidence.tests, `${label}.evidence.tests`);
  if (Object.keys(tests).length !== expectedTests.size) {
    fail(`${label}.evidence.tests must contain exactly the three authenticated deep-link checks.`);
  }
  for (const [key, expectedResult] of expectedTests) {
    const result = object(tests[key], `${label}.evidence.tests.${key}`);
    if (result.status !== 'passed' || result.result !== expectedResult) {
      fail(`${label}.evidence.tests.${key} must contain the expected passed result.`);
    }
  }

  const expectedBoundaries = {
    syntheticAccountsOnly: true,
    directDiagnosticOnly: directInstall,
    storeInstallationGateSatisfied: playInstall,
    fullDeviceMatrixPassed: false,
    wifiOnlyDiagnostic: true,
    hotspotPassed: false,
    authenticatedDeepLinksPassed: true,
    realPushPassed: false,
    manualTalkBackTraversalPassed: false,
    iosTestFlightPassed: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    messageSent: false,
    lockCodeUsed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  };
  const boundaries = object(evidence.boundaries, `${label}.evidence.boundaries`);
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length
      || Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.evidence must prove only the three identity-free Staging links while keeping store, matrix, hotspot, push, TalkBack, iOS, payment, and message gates open.`);
  }
  const isolation = object(evidence.isolation, `${label}.evidence.isolation`);
  if (Object.keys(isolation).length !== 7
      || isolation.protectedReviewFixtureUnchanged !== true
      || isolation.protectedReviewSessionRestored !== true
      || isolation.temporaryBookingCompleted !== true
      || isolation.temporaryListingPaused !== true
      || isolation.temporaryListingDeleted !== false
      || isolation.temporaryVaultRemovedAfterProbe !== true
      || isolation.containsReviewCredentials !== false) {
    fail(`${label}.evidence must preserve and restore the protected review fixture while completing and pausing the isolated temporary fixture.`);
  }
}

function validateAndroidLogoutLifecycle(root, diagnostic, candidate) {
  const label = 'candidate.android.logoutLifecycle';
  if (diagnostic.status !== 'passed'
      || !['direct-apk-diagnostic', 'google-play-split'].includes(diagnostic.installMethod)) {
    fail(`${label} must record a passed supported Android installation diagnostic.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }
  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1
      || evidence.kind !== 'android-logout-lifecycle-diagnostic'
      || evidence.status !== 'passed-bounded-logout-lifecycle-diagnostic') {
    fail(`${label}.evidence must be a passed bounded logout-lifecycle diagnostic.`);
  }
  if (evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence.capturedAt must match the diagnostic manifest.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);
  assertEvidenceBoundaries(evidence, `${label}.evidence`);

  const installed = object(evidence.installed, `${label}.evidence.installed`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (installed.packageIdentityVerified !== true
      || installed.versionName !== candidate.versionName
      || installed.buildNumber !== candidate.buildNumber) {
    fail(`${label}.evidence must prove the exact installed candidate version and package identity.`);
  }
  const directInstall = installed.delivery === undefined || installed.delivery === 'direct-apk';
  const playInstall = installed.delivery === 'google-play-split';
  if (directInstall) {
    if (installed.apkSha256 !== expectedAndroid.apkSha256
        || diagnostic.installMethod !== 'direct-apk-diagnostic') {
      fail(`${label}.evidence must prove the exact directly installed candidate APK.`);
    }
  } else if (!playInstall
      || diagnostic.installMethod !== 'google-play-split'
      || installed.installerPackageName !== 'com.android.vending'
      || !Number.isInteger(installed.splitCount)
      || installed.splitCount < 2
      || installed.apkSha256 !== undefined) {
    fail(`${label}.evidence must prove an exact-version Google Play split installation.`);
  }
  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true
      || device.manufacturer !== diagnostic.manufacturer
      || device.model !== diagnostic.deviceModel
      || device.osVersion !== diagnostic.osVersion
      || !Number.isInteger(device.apiLevel) || device.apiLevel <= 0
      || typeof device.securityPatch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(device.securityPatch)
      || device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.evidence.device must match the sanitized physical Android device.`);
  }

  const expectedTests = new Map([
    ['uiLogout', 'logout-confirmed-and-session-cleared'],
    ['coldStartGuestPersistence', 'guest-profile-restored-after-process-restart'],
    ['protectedChatAfterLogout', 'authentication-required-private-content-hidden'],
    ['postLogoutProcessAbsentPush', 'controlled-message-created-no-device-notification'],
  ]);
  const tests = object(evidence.tests, `${label}.evidence.tests`);
  if (Object.keys(tests).length !== expectedTests.size) {
    fail(`${label}.evidence.tests must contain exactly the four logout lifecycle checks.`);
  }
  for (const [key, expectedResult] of expectedTests) {
    const result = object(tests[key], `${label}.evidence.tests.${key}`);
    if (result.status !== 'passed' || result.result !== expectedResult) {
      fail(`${label}.evidence.tests.${key} must contain the expected passed result.`);
    }
  }

  const probe = object(evidence.notificationProbe, `${label}.evidence.notificationProbe`);
  if (probe.processAbsent !== true
      || probe.messageAccepted !== true
      || !Number.isInteger(probe.observedNotificationCountBefore)
      || probe.observedNotificationCountBefore < 0
      || probe.observedNotificationCountAfter !== probe.observedNotificationCountBefore
      || probe.notificationCountUnchanged !== true
      || !Number.isInteger(probe.observationSeconds)
      || probe.observationSeconds < 30) {
    fail(`${label}.evidence.notificationProbe must prove a process-absent, accepted-message suppression observation.`);
  }

  const expectedBoundaries = {
    syntheticAccountsOnly: true,
    directDiagnosticOnly: directInstall,
    storeInstallationGateSatisfied: playInstall,
    fullDeviceMatrixPassed: false,
    wifiOnlyDiagnostic: true,
    hotspotPassed: false,
    authenticatedDeepLinksPassed: false,
    realPushPassed: false,
    controlledPushSuppressionPassed: true,
    manualTalkBackTraversalPassed: false,
    iosTestFlightPassed: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    messageSent: true,
    lockCodeUsed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  };
  const boundaries = object(evidence.boundaries, `${label}.evidence.boundaries`);
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length
      || Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.evidence must prove only the identity-free logout lifecycle and post-logout push suppression while keeping remaining gates open.`);
  }
}

function validateAndroidOfflineRealtime(root, diagnostic, candidate) {
  const label = 'candidate.android.offlineRealtime';
  if (diagnostic.status !== 'passed'
      || !['direct-apk-diagnostic', 'google-play-split'].includes(diagnostic.installMethod) ||
      diagnostic.offlineWindowSeconds !== 15 || diagnostic.sameProcessRecovery !== 'passed' ||
      diagnostic.originalNetworkRestored !== 'passed') {
    fail(`${label} must record the passed bounded 15-second same-process recovery.`);
  }
  isoTimestamp(diagnostic.capturedAt, `${label}.capturedAt`, { required: true });
  for (const key of ['manufacturer', 'deviceModel', 'osVersion']) {
    nonEmptyString(diagnostic[key], `${label}.${key}`);
  }
  const ref = evidenceRef(root, diagnostic.evidenceRef, `${label}.evidenceRef`, { required: true });
  const evidence = readEvidenceJson(root, ref, `${label}.evidence`);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-offline-realtime-diagnostic' ||
      evidence.status !== 'passed-bounded-offline-realtime-diagnostic' ||
      evidence.capturedAt !== diagnostic.capturedAt) {
    fail(`${label}.evidence must be the matching passed offline/realtime diagnostic.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.evidence.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, `${label}.evidence`);

  const installed = object(evidence.installed, `${label}.evidence.installed`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (installed.packageIdentityVerified !== true ||
      installed.versionName !== candidate.versionName ||
      installed.buildNumber !== candidate.buildNumber) {
    fail(`${label}.evidence must prove the exact installed candidate version.`);
  }
  const directInstall = installed.delivery === undefined || installed.delivery === 'direct-apk';
  const playInstall = installed.delivery === 'google-play-split';
  if (directInstall) {
    if (installed.apkSha256 !== expectedAndroid.apkSha256
        || diagnostic.installMethod !== 'direct-apk-diagnostic') {
      fail(`${label}.evidence must prove the exact directly installed candidate APK.`);
    }
  } else if (!playInstall
      || diagnostic.installMethod !== 'google-play-split'
      || installed.installerPackageName !== 'com.android.vending'
      || !Number.isInteger(installed.splitCount)
      || installed.splitCount < 2
      || installed.apkSha256 !== undefined) {
    fail(`${label}.evidence must prove an exact-version Google Play split installation.`);
  }
  const device = object(evidence.device, `${label}.evidence.device`);
  if (device.platform !== 'android' || device.physical !== true ||
      device.manufacturer !== diagnostic.manufacturer ||
      device.model !== diagnostic.deviceModel ||
      device.osVersion !== diagnostic.osVersion ||
      !Number.isInteger(device.apiLevel) || device.apiLevel <= 0 ||
      typeof device.securityPatch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(device.securityPatch) ||
      device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.evidence.device must match the sanitized physical Android device.`);
  }

  const expectedTests = {
    authenticatedChatPreloaded: 'chat-visible-before-offline-window',
    messageHiddenWhileOffline: 'new-message-absent-during-15-second-offline-window',
    sameProcessRealtimeRecovery: 'new-message-visible-after-network-restoration',
    originalNetworkRestored: 'wifi-and-mobile-data-restored-to-original-state',
  };
  const tests = object(evidence.tests, `${label}.evidence.tests`);
  if (Object.keys(tests).length !== Object.keys(expectedTests).length ||
      Object.entries(expectedTests).some(([key, expected]) =>
        tests[key]?.status !== 'passed' || tests[key]?.result !== expected)) {
    fail(`${label}.evidence.tests must prove the four bounded offline/realtime checks.`);
  }
  const observation = object(evidence.diagnostic, `${label}.evidence.diagnostic`);
  if (observation.offlineWindowSeconds !== 15 || observation.appProcessSurvived !== true ||
      observation.processIdentityStable !== true || observation.appForegroundAfterRecovery !== true ||
      observation.packageCrashBufferEntries !== 0 || observation.networkRestored !== true) {
    fail(`${label}.evidence.diagnostic must prove a crash-free same-process recovery and network restoration.`);
  }
  const expectedBoundaries = {
    syntheticAccountsOnly: true,
    directDiagnosticOnly: directInstall,
    storeInstallationGateSatisfied: playInstall,
    fullDeviceMatrixPassed: false,
    wifiOnlyDiagnostic: true,
    hotspotPassed: false,
    manualTalkBackTraversalPassed: false,
    iosTestFlightPassed: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    messageSent: true,
    lockCodeUsed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  };
  const boundaries = object(evidence.boundaries, `${label}.evidence.boundaries`);
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length ||
      Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.evidence must keep Store, matrix, hotspot, TalkBack, iOS, payment, identity, and secret gates open.`);
  }
}

function validateAndroidControlledFcmProgressEvidence(root, ref, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (evidence.schemaVersion !== 1
      || evidence.kind !== 'android-controlled-fcm-diagnostic'
      || evidence.status !== 'passed-bounded-full-fcm-diagnostic') {
    fail(`${label} must be the passed bounded Android FCM diagnostic while APNs remains pending.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  const evidenceCandidate = object(evidence.candidate, `${label}.candidate`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (evidenceCandidate.applicationId !== candidate.applicationId
      || evidenceCandidate.versionName !== candidate.versionName
      || evidenceCandidate.buildNumber !== candidate.buildNumber
      || evidenceCandidate.commit !== candidate.commit
      || evidenceCandidate.apkSha256 !== expectedAndroid.apkSha256
      || evidenceCandidate.apiBaseUrl !== candidate.apiBaseUrl
      || evidenceCandidate.stripeLivemode !== false) {
    fail(`${label}.candidate must match the exact current Android candidate and Staging boundary.`);
  }
  const device = object(evidence.device, `${label}.device`);
  if (device.platform !== 'android' || device.physical !== true
      || !Number.isInteger(device.apiLevel) || device.apiLevel <= 0
      || typeof device.securityPatch !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(device.securityPatch)
      || device.containsRawDeviceIdentifier !== false) {
    fail(`${label}.device must identify only a sanitized physical Android device.`);
  }
  for (const key of ['manufacturer', 'model', 'osVersion']) {
    nonEmptyString(device[key], `${label}.device.${key}`);
  }
  const installed = object(evidence.installed, `${label}.installed`);
  if (installed.applicationId !== candidate.applicationId
      || installed.versionName !== candidate.versionName
      || installed.buildNumber !== candidate.buildNumber
      || !['direct-apk', 'google-play-split'].includes(installed.delivery)) {
    fail(`${label}.installed must match the exact installed Android candidate.`);
  }
  if (installed.delivery === 'direct-apk') {
    if (installed.apkSha256 !== expectedAndroid.apkSha256
        || installed.installerPackageName !== undefined
        || installed.splitCount !== undefined) {
      fail(`${label}.installed must prove the exact direct APK without a Store installer claim.`);
    }
  } else if (installed.installerPackageName !== 'com.android.vending'
      || !Number.isInteger(installed.splitCount) || installed.splitCount < 2
      || installed.apkSha256 !== undefined) {
    fail(`${label}.installed must prove a Google Play delivered split installation.`);
  }
  const tests = object(evidence.tests, `${label}.tests`);
  if (tests.foregroundPushDelivery?.status !== 'passed'
      || tests.foregroundPushDelivery?.result !== 'foreground-fcm-banner-visible'
      || tests.backgroundPushDelivery?.status !== 'passed'
      || tests.backgroundPushDelivery?.result !== 'android-system-notification-visible'
      || tests.terminatedProcessPushDelivery?.status !== 'passed'
      || tests.terminatedProcessPushDelivery?.result !== 'process-absent-before-send-and-android-system-notification-visible-after-send'
      || tests.notificationIconVisual?.status !== 'passed'
      || tests.notificationIconVisual?.result !== 'brand-glyph-centered-and-fully-contained-within-system-circle-with-even-visible-safety-margin'
      || !/^[a-f0-9]{64}$/.test(tests.notificationIconVisual?.privateDiagnosticScreenshotSha256 ?? '')
      || tests.notificationIconVisual?.privateDiagnosticScreenshotCommitted !== false) {
    fail(`${label}.tests must prove foreground, background, terminated-process FCM and the contained notification icon.`);
  }
  for (const key of ['backgroundPushDelivery', 'terminatedProcessPushDelivery']) {
    const test = tests[key];
    if (!Number.isInteger(test.observedNotificationRecordsBefore)
        || !Number.isInteger(test.observedNotificationRecordsAfter)
        || test.observedNotificationRecordsAfter <= test.observedNotificationRecordsBefore) {
      fail(`${label}.tests.${key} must prove that a new system notification appeared.`);
    }
  }
  const expectedBoundaries = {
    directDiagnosticOnly: installed.delivery === 'direct-apk',
    storeInstallationGateSatisfied: installed.delivery === 'google-play-split',
    fullFcmMatrixPassed: true,
    productionPushSent: false,
    paymentEndpointCalled: false,
    stripeLivemode: false,
    syntheticAccountsOnly: true,
    lockCodeUsed: false,
    accountIdentityRecorded: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  };
  const boundaries = object(evidence.boundaries, `${label}.boundaries`);
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length
      || Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.boundaries must keep Store, production, payment, identity and secret gates closed.`);
  }
  const isolation = object(evidence.isolation, `${label}.isolation`);
  const retiredTemporaryFixture = {
    protectedReviewFixtureUnchanged: true,
    temporaryVaultRemovedAfterProbe: true,
    temporaryBookingCompleted: true,
    temporaryListingPaused: true,
    listingDeleted: false,
    containsReviewCredentials: false,
  };
  const reusedProtectedFixture = {
    mode: 'existing-protected-synthetic-fixture',
    protectedReviewFixturePreserved: true,
    fixtureReconciledActiveAfterProbe: true,
    diagnosticMessagesOnly: true,
    temporaryVaultCreated: false,
    listingCreatedDuringProbe: false,
    listingDeleted: false,
    containsReviewCredentials: false,
  };
  const matchesIsolation = (expected) => (
    Object.keys(isolation).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => isolation[key] === value)
  );
  if (!matchesIsolation(retiredTemporaryFixture) && !matchesIsolation(reusedProtectedFixture)) {
    fail(`${label}.isolation must prove either a retired temporary fixture or a preserved active protected fixture.`);
  }
}

function validateAndroidReleasePermissionInventory(root, ref, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-release-permission-inventory' ||
      evidence.status !== 'passed-exact-merged-release-apk') {
    fail(`${label} must be a passed exact merged-release permission inventory.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, label);
  const artifacts = object(evidence.artifacts, `${label}.artifacts`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  if (artifacts.apkSha256 !== expectedAndroid.apkSha256 ||
      artifacts.aabSha256 !== expectedAndroid.aabSha256 ||
      artifacts.targetSdkVersion !== 35) {
    fail(`${label}.artifacts must match the exact candidate and target SDK.`);
  }

  const analysis = object(evidence.analysis, `${label}.analysis`);
  const usesSystemPhotoPicker = BigInt(candidate.buildNumber) >= 2026081506n;
  const expectedDeclaredPermissions = [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.READ_EXTERNAL_STORAGE:maxSdkVersion=32',
    ...(!usesSystemPhotoPicker ? ['android.permission.READ_MEDIA_IMAGES'] : []),
    'android.permission.USE_BIOMETRIC',
    'android.permission.USE_FINGERPRINT',
    'android.permission.WAKE_LOCK',
    'android.permission.WRITE_EXTERNAL_STORAGE:maxSdkVersion=28',
    'com.google.android.c2dm.permission.RECEIVE',
    'com.google.android.providers.gsf.permission.READ_GSERVICES',
    'com.shareittoo.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
  ];
  const expectedAbsent = [
    'android.permission.BIND_ACCESSIBILITY_SERVICE',
    'android.permission.MANAGE_EXTERNAL_STORAGE',
    'android.permission.QUERY_ALL_PACKAGES',
    'android.permission.READ_CALL_LOG',
    'android.permission.READ_CONTACTS',
    'android.permission.READ_SMS',
    ...(usesSystemPhotoPicker ? [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
    ] : []),
    'android.permission.RECORD_AUDIO',
    'android.permission.REQUEST_INSTALL_PACKAGES',
    'android.permission.SEND_SMS',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.WRITE_CALL_LOG',
    'android.permission.WRITE_CONTACTS',
  ];
  const boundaries = object(evidence.boundaries, `${label}.boundaries`);
  const storeUploadPerformed = boundaries.storeUploadPerformed;
  const consoleWarningsPending = analysis.consoleWarningsPendingAfterAabUpload;
  if (typeof storeUploadPerformed !== 'boolean' ||
      typeof consoleWarningsPending !== 'boolean' ||
      consoleWarningsPending === storeUploadPerformed) {
    fail(`${label} must consistently bind the Store-upload phase to the Console-warning state.`);
  }
  if (analysis.source !== 'merged-release-apk' ||
      JSON.stringify(analysis.declaredPermissions) !== JSON.stringify(expectedDeclaredPermissions) ||
      JSON.stringify(analysis.restrictedOrUnrequestedPermissionsAbsent) !== JSON.stringify(expectedAbsent) ||
      !Array.isArray(analysis.unexpectedPermissions) || analysis.unexpectedPermissions.length !== 0 ||
      analysis.permissionDeclarationFormPreclaim !== false) {
    fail(`${label}.analysis must preserve the exact expected permissions and avoid permission-form preclaims.`);
  }
  const expectedBoundaries = {
    productionChanged: false,
    containsSecrets: false,
    containsPersonalAccountData: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
  };
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length + 1 ||
      Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.boundaries must remain sanitized and keep production, identity and secret gates closed.`);
  }
}

function validateLegacyCandidateReleaseEvidence(root, evidence, candidate, checkId, label) {
  if (evidence.schemaVersion !== 1 || evidence.kind !== 'android-release-candidate') return false;
  assertEvidenceCandidate(evidence, candidate, label);
  const android = object(evidence.android, `${label}.android`);
  const expectedAndroid = object(candidate.android, 'candidate.android');
  for (const key of ['aabSha256', 'apkSha256', 'signingCertificateSha256']) {
    if (android[key] !== expectedAndroid[key]) {
      fail(`${label}.android.${key} must match the candidate manifest.`);
    }
  }
  assertEvidenceBoundaries(evidence, label);

  if (checkId === 'candidateIdentityAndSignatures') {
    if (android.signatureVerified !== true || android.packageIdentityVerified !== true) {
      fail(`${label} does not prove candidate identity and signatures.`);
    }
    const privacy = object(evidence.privacyAndNetwork, `${label}.privacyAndNetwork`);
    if (privacy.permissionInventoryStatus !== 'passed') {
      fail(`${label} must bind a passed merged-release permission inventory.`);
    }
    const permissionRef = evidenceRef(
      root,
      privacy.permissionInventoryEvidenceRef,
      `${label}.privacyAndNetwork.permissionInventoryEvidenceRef`,
      { required: true },
    );
    validateAndroidReleasePermissionInventory(
      root,
      permissionRef,
      candidate,
      `${label}.permissionInventory`,
    );
    return true;
  }
  if (checkId === 'stagingCleanupAndHealth') {
    const staging = object(evidence.staging, `${label}.staging`);
    if (staging.liveHttpStatus !== 200 || staging.readyHttpStatus !== 200) {
      fail(`${label} does not prove healthy staging.`);
    }
    return true;
  }
  if (checkId === 'productionInvariant') {
    if (evidence.staging?.productionInvariant !== 'passed') {
      fail(`${label} does not prove the production invariant.`);
    }
    return true;
  }
  return false;
}

function validateReleaseCheckEvidence(root, ref, checkId, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (validateLegacyCandidateReleaseEvidence(root, evidence, candidate, checkId, label)) return;
  if (evidence.schemaVersion !== 1 || evidence.kind !== 'release-check' || evidence.status !== 'passed') {
    fail(`${label} must be a passed release-check evidence document for ${checkId}.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, label);
  assertEvidenceBoundaries(evidence, label);
  const releaseCheck = object(evidence.releaseCheck, `${label}.releaseCheck`);
  if (releaseCheck.id !== checkId || releaseCheck.status !== 'passed') {
    fail(`${label}.releaseCheck must identify ${checkId} as passed.`);
  }
  if (!Array.isArray(releaseCheck.verifications) || releaseCheck.verifications.length === 0) {
    fail(`${label}.releaseCheck.verifications must contain at least one passed verification.`);
  }
  for (const [index, verification] of releaseCheck.verifications.entries()) {
    const item = object(verification, `${label}.releaseCheck.verifications[${index}]`);
    nonEmptyString(item.id, `${label}.releaseCheck.verifications[${index}].id`);
    if (item.status !== 'passed') {
      fail(`${label}.releaseCheck.verifications[${index}].status must be passed.`);
    }
    isoTimestamp(item.checkedAt, `${label}.releaseCheck.verifications[${index}].checkedAt`, { required: true });
    nonEmptyString(item.summary, `${label}.releaseCheck.verifications[${index}].summary`);
  }
}

function validateCrashMappingProgressEvidence(root, ref, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  const mappingUploadedEventPending =
    evidence.status === 'mapping-and-native-symbols-uploaded-controlled-event-pending';
  const mappingUploadedNativePackagedEventPending =
    evidence.status === 'mapping-uploaded-native-symbols-packaged-controlled-event-pending';
  const mappingUploadedConsoleObservedEventPending =
    evidence.status ===
      'mapping-and-native-symbols-uploaded-console-release-observed-controlled-event-pending';
  const mappingUploadedNativePackagedConsoleObservedEventPending =
    evidence.status ===
      'mapping-uploaded-native-symbols-packaged-console-release-observed-controlled-event-pending';
  const controlledEventSentConsolePending =
    evidence.status === 'mapping-symbols-and-controlled-event-sent-console-pending';
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'android-crash-release-mapping' ||
      (!mappingUploadedEventPending &&
       !mappingUploadedNativePackagedEventPending &&
       !mappingUploadedConsoleObservedEventPending &&
       !mappingUploadedNativePackagedConsoleObservedEventPending &&
       !controlledEventSentConsolePending)) {
    fail(`${label} must be the bounded in-progress Android crash mapping evidence.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, label);
  assertEvidenceBoundaries(evidence, label);

  const artifacts = object(evidence.artifacts, `${label}.artifacts`);
  if (artifacts.aabSha256 !== candidate.android.aabSha256 ||
      artifacts.apkSha256 !== candidate.android.apkSha256) {
    fail(`${label}.artifacts must match the exact Android candidate binaries.`);
  }
  for (const key of [
    'embeddedProguardMappingSha256',
    'embeddedMappingIdSha256',
    'nativeDebugSymbolsZipSha256',
  ]) {
    assertSha256(artifacts[key], `${label}.artifacts.${key}`, { required: true });
  }
  if (!Array.isArray(artifacts.nativeSymbolMembers) ||
      artifacts.nativeSymbolMembers.length !== 3) {
    fail(`${label}.artifacts.nativeSymbolMembers must bind exactly the three bundled Android ABIs.`);
  }
  const expectedAbis = new Set(['armeabi-v7a', 'arm64-v8a', 'x86_64']);
  for (const [index, member] of artifacts.nativeSymbolMembers.entries()) {
    const item = object(member, `${label}.artifacts.nativeSymbolMembers[${index}]`);
    const abi = nonEmptyString(item.abi, `${label}.artifacts.nativeSymbolMembers[${index}].abi`);
    if (!expectedAbis.delete(abi)) {
      fail(`${label}.artifacts.nativeSymbolMembers contains an unexpected or duplicate ABI.`);
    }
    assertSha256(item.sha256, `${label}.artifacts.nativeSymbolMembers[${index}].sha256`, { required: true });
  }

  const verifications = object(evidence.verifications, `${label}.verifications`);
  for (const key of [
    'aabIdentity',
    'embeddedMappingPresent',
    'mappingIdPresentAndHashed',
    'nativeSymbolsPresentForAllBundledAbis',
    'nativeSymbolsMatchStandaloneArchive',
    'originalAabMappingUploadedToCrashlytics',
  ]) {
    if (verifications[key] !== 'passed') {
      fail(`${label}.verifications.${key} must be passed.`);
    }
  }
  if (verifications.uploadBuildResult !== 'successful') {
    fail(`${label}.verifications.uploadBuildResult must be successful.`);
  }
  if (mappingUploadedEventPending || mappingUploadedNativePackagedEventPending) {
    if (verifications.consoleReleaseAssignment !== 'pending' ||
        verifications.controlledSanitizedCrashEvent !== 'pending' ||
        evidence.boundaries.productionCrashGenerated !== false ||
        evidence.boundaries.controlledStagingEventGenerated !== false) {
      fail(`${label} must preserve the honest pending controlled-event boundary.`);
    }
    if (mappingUploadedNativePackagedEventPending &&
        (verifications.nativeSymbolsPackagedForAllBundledAbis !== 'passed' ||
         verifications.nativeSymbolUploadToCrashlytics !== 'pending')) {
      fail(`${label} must distinguish packaged native symbols from a completed Crashlytics native-symbol upload.`);
    }
    if (mappingUploadedEventPending &&
        (verifications.nativeSymbolsPackagedForAllBundledAbis !== 'passed' ||
         verifications.nativeSymbolGeneration !== 'passed' ||
         verifications.nativeSymbolUploadToCrashlytics !== 'passed' ||
         verifications.nativeSymbolUploadBuildResult !== 'successful' ||
         verifications.nativeSymbolCacheDrainedAfterUpload !== 'passed')) {
      fail(`${label} must prove the completed Crashlytics native-symbol upload and drained local cache.`);
    }
    if (evidence.consoleObservation !== undefined) {
      const observation = object(evidence.consoleObservation, `${label}.consoleObservation`);
      isoTimestamp(observation.capturedAt, `${label}.consoleObservation.capturedAt`, { required: true });
      const observedLatestRelease = nonEmptyString(
        observation.observedLatestRelease,
        `${label}.consoleObservation.observedLatestRelease`,
      );
      if (observation.source !== 'firebase-console-read-only' ||
          observation.latestReleaseMatchesExactCandidate !== false ||
          observedLatestRelease === `${candidate.versionName} (${candidate.buildNumber})` ||
          observation.issueCountsUsedAsCandidateProof !== false ||
          observation.settingsChanged !== false ||
          observation.eventGenerated !== false) {
        fail(`${label} must record only an honest read-only nonmatching Console observation while the exact release remains pending.`);
      }
    }
  } else if (mappingUploadedConsoleObservedEventPending ||
      mappingUploadedNativePackagedConsoleObservedEventPending) {
    const expectedVersion = `${candidate.versionName} (${candidate.buildNumber})`;
    const observation = object(evidence.consoleObservation, `${label}.consoleObservation`);
    if (verifications.consoleReleaseAssignment !== 'passed' ||
        verifications.consoleObservedVersion !== expectedVersion ||
        verifications.controlledSanitizedCrashEvent !== 'pending' ||
        observation.source !== 'firebase-console-read-only' ||
        observation.latestReleaseMatchesExactCandidate !== true ||
        observation.issueCountsUsedAsCandidateProof !== false ||
        evidence.boundaries.productionCrashGenerated !== false ||
        evidence.boundaries.controlledStagingEventGenerated !== false) {
      fail(`${label} must prove only the exact console release assignment while keeping the controlled event pending.`);
    }
    if (mappingUploadedNativePackagedConsoleObservedEventPending &&
        (verifications.nativeSymbolsPackagedForAllBundledAbis !== 'passed' ||
         verifications.nativeSymbolUploadToCrashlytics !== 'pending' ||
         verifications.nativeSymbolUploadBuildResult !== 'pending' ||
         verifications.nativeSymbolCacheDrainedAfterUpload !== 'pending')) {
      fail(`${label} must keep the separate Crashlytics native-symbol upload honestly pending.`);
    }
  } else if (verifications.consoleReleaseAssignment !== 'pending' ||
      verifications.controlledSanitizedCrashEvent !== 'passed' ||
      verifications.deviceDiagnosticUi !== 'passed' ||
      evidence.boundaries.productionCrashGenerated !== false ||
      evidence.boundaries.controlledStagingEventGenerated !== true ||
      evidence.boundaries.eventContainsAccountData !== false ||
      evidence.boundaries.eventContainsMessageOrAddressData !== false) {
    fail(`${label} must prove a sanitized staging event while console assignment remains pending.`);
  }
}

function validateStoreLinksAndSigningProgressEvidence(root, ref, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'store-links-signing-readiness' ||
      evidence.status !== 'play-signing-observed-assetlinks-prepared-upload-and-public-routes-pending') {
    fail(`${label} must be the bounded in-progress Store links and signing evidence.`);
  }
  isoTimestamp(evidence.capturedAt, `${label}.capturedAt`, { required: true });
  assertEvidenceCandidate(evidence, candidate, label);
  assertEvidenceBoundaries(evidence, label);

  const artifacts = object(evidence.artifacts, `${label}.artifacts`);
  if (artifacts.aabSha256 !== candidate.android.aabSha256 ||
      artifacts.uploadCertificateSha256 !== candidate.android.signingCertificateSha256 ||
      artifacts.playAppSigningCertificateSha256 !==
        '36488abf86c51da07ab2258f31b00e2f1ba8a36d076107b9f006376ade80b956') {
    fail(`${label}.artifacts must match the exact Android candidate plus upload and Play signing certificates.`);
  }

  const sources = object(evidence.sources, `${label}.sources`);
  const candidateRef = evidenceRef(
    root,
    sources.candidateEvidenceRef,
    `${label}.sources.candidateEvidenceRef`,
    { required: true },
  );
  const routeRef = evidenceRef(
    root,
    sources.publicRouteReadinessRef,
    `${label}.sources.publicRouteReadinessRef`,
    { required: true },
  );
  const accountRef = evidenceRef(
    root,
    sources.platformAccountReadinessRef,
    `${label}.sources.platformAccountReadinessRef`,
    { required: true },
  );
  const candidateEvidence = readEvidenceJson(root, candidateRef, `${label}.candidateEvidence`);
  if (candidateEvidence.kind !== 'android-release-candidate' ||
      candidateEvidence.candidate?.buildNumber !== candidate.buildNumber ||
      candidateEvidence.android?.aabSha256 !== candidate.android.aabSha256) {
    fail(`${label}.candidateEvidence must match the exact Android candidate.`);
  }
  const routeEvidence = readEvidenceJson(root, routeRef, `${label}.publicRouteReadiness`);
  if (routeEvidence.kind !== 'public-store-route-rollout-readiness' ||
      routeEvidence.status !== 'ready-awaiting-explicit-production-route-approval' ||
      routeEvidence.deployedState !== 'deployed-config-out-of-date' ||
      routeEvidence.boundaries?.productionChanged !== false ||
      routeEvidence.boundaries?.caddyReloaded !== false) {
    fail(`${label}.publicRouteReadiness must preserve the out-of-date, no-production-change state.`);
  }
  const accountEvidence = readEvidenceJson(root, accountRef, `${label}.platformAccountReadiness`);
  const playBeforeSignup = accountEvidence.googlePlay?.developerAccountCreated === false &&
    accountEvidence.googlePlay?.registrationFeePaid === false &&
    accountEvidence.googlePlay?.identityVerified === false &&
    accountEvidence.googlePlay?.appRecordCreated === false &&
    accountEvidence.boundaries?.purchaseMade === false &&
    accountEvidence.boundaries?.agreementAccepted === false;
  const playIdentityPending = accountEvidence.googlePlay?.developerAccountCreated === true &&
    accountEvidence.googlePlay?.registrationFeePaid === true &&
    accountEvidence.googlePlay?.identityVerified === false &&
    accountEvidence.googlePlay?.appRecordCreated === false &&
    accountEvidence.boundaries?.purchaseMade === true &&
    accountEvidence.boundaries?.agreementAccepted === true;
  const playIdentityVerifiedChecksPending =
    accountEvidence.googlePlay?.developerAccountCreated === true &&
    accountEvidence.googlePlay?.registrationFeePaid === true &&
    accountEvidence.googlePlay?.identityVerified === true &&
    accountEvidence.googlePlay?.appRecordCreated === false &&
    accountEvidence.boundaries?.purchaseMade === true &&
    accountEvidence.boundaries?.agreementAccepted === true;
  const playAccountReady =
    accountEvidence.googlePlay?.developerAccountCreated === true &&
    accountEvidence.googlePlay?.registrationFeePaid === true &&
    accountEvidence.googlePlay?.identityVerified === true &&
    accountEvidence.googlePlay?.deviceVerified === true &&
    accountEvidence.googlePlay?.phoneVerified === true &&
    accountEvidence.googlePlay?.appRecordCreated === true &&
    accountEvidence.boundaries?.purchaseMade === true &&
    accountEvidence.boundaries?.agreementAccepted === true;
  if (accountEvidence.kind !== 'store-platform-account-readiness-observation' ||
      accountEvidence.status !== 'setup-required' ||
      accountEvidence.apple?.membershipActive !== false ||
      (!playBeforeSignup && !playIdentityPending && !playIdentityVerifiedChecksPending &&
       !playAccountReady)) {
    fail(`${label}.platformAccountReadiness must preserve a truthful, sanitized setup-required Store account state.`);
  }

  const expectedVerifications = {
    canonicalUploadCertificate: 'passed',
    localStoreMetadata: 'passed',
    publicRouteContract: 'passed',
    deployedPublicRoutes: 'out-of-date',
    publicSupportPrivacyDeletionRoutes: 'pending',
    playConsoleWarnings: 'pending',
    playAppSigningFingerprint: 'passed',
    assetLinksWithPlayAppSigning: 'prepared-local-not-deployed',
    appleSigningAndAssociatedDomains: 'pending',
  };
  const verifications = object(evidence.verifications, `${label}.verifications`);
  if (Object.keys(verifications).length !== Object.keys(expectedVerifications).length ||
      Object.entries(expectedVerifications).some(([key, value]) => verifications[key] !== value)) {
    fail(`${label}.verifications must keep public routes and Store-console checks honestly pending.`);
  }

  const counts = object(evidence.counts, `${label}.counts`);
  if (counts.draftPublicUrls !== 3 || counts.openStoreGates !== 7) {
    fail(`${label}.counts must preserve the three draft URLs and seven open Store gates.`);
  }
  const expectedBoundaries = {
    uploadedToStore: false,
    caddyReloaded: false,
    productionChanged: false,
    publicRoutesApproved: false,
    storeWarningsReviewed: false,
    playAppSigningObserved: true,
    appleSigningTeamAvailable: false,
    purchaseMade: accountEvidence.boundaries.purchaseMade,
    agreementAccepted: accountEvidence.boundaries.agreementAccepted,
    legalContentApproved: false,
    containsPersonalAccountData: false,
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
    syntheticAccountsOnly: true,
  };
  const boundaries = object(evidence.boundaries, `${label}.boundaries`);
  if (Object.keys(boundaries).length !== Object.keys(expectedBoundaries).length ||
      Object.entries(expectedBoundaries).some(([key, value]) => boundaries[key] !== value)) {
    fail(`${label}.boundaries must preserve the observed account history without claiming an upload or production change.`);
  }
}

function validateApprovalEvidence(root, ref, approvalType, approval, candidate, label) {
  const evidence = readEvidenceJson(root, ref, label);
  if (evidence.schemaVersion !== 1 || evidence.kind !== 'approval' || evidence.status !== 'passed') {
    fail(`${label} must be a passed approval evidence document.`);
  }
  assertEvidenceCandidate(evidence, candidate, label);
  assertEvidenceBoundaries(evidence, label);
  const recorded = object(evidence.approval, `${label}.approval`);
  if (recorded.type !== approvalType || recorded.decision !== 'approved' || recorded.approvedAt !== approval.approvedAt) {
    fail(`${label}.approval must match the recorded ${approvalType} approval.`);
  }
  isoTimestamp(recorded.approvedAt, `${label}.approval.approvedAt`, { required: true });
  nonEmptyString(recorded.statement, `${label}.approval.statement`);
}

function parsePubspecVersion(pubspecText) {
  const match = /^version:\s*(\d+\.\d+\.\d+)\+(\d{10})\s*$/m.exec(pubspecText);
  if (!match) fail('pubspec.yaml must use semantic+YYYYMMDDNN versioning.');
  return { versionName: match[1], buildNumber: BigInt(match[2]) };
}

function isoTimestamp(value, label, { required }) {
  if (value === null && !required) return;
  const timestamp = nonEmptyString(value, label);
  if (Number.isNaN(Date.parse(timestamp)) || !/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) {
    fail(`${label} must be an ISO-8601 timestamp.`);
  }
}

export function validateDeviceEvidence({
  root,
  deviceManifest,
  submissionManifest,
  pubspecText,
  requirePassed = false,
}) {
  const manifest = object(deviceManifest, 'store/device-validation.json');
  const submission = object(submissionManifest, 'store/submission.json');
  assertNoSensitiveFields(manifest);

  if (manifest.schemaVersion !== 1) fail('Unsupported device evidence schemaVersion.');
  const state = manifest.state;
  const goNoGo = manifest.goNoGo;
  if (!['planned', 'testing', 'passed'].includes(state)) {
    fail('state must be planned, testing, or passed.');
  }
  if (!['no-go', 'hold', 'go'].includes(goNoGo)) {
    fail('goNoGo must be no-go, hold, or go.');
  }
  if (state === 'passed' && goNoGo !== 'go') {
    fail('A passed device validation must have goNoGo=go.');
  }
  if (state !== 'passed' && goNoGo === 'go') {
    fail('goNoGo=go is forbidden before the full device validation passes.');
  }

  const identity = object(submission.identity, 'submission.identity');
  const gates = object(submission.blockingGates, 'submission.blockingGates');
  const candidate = object(manifest.candidate, 'candidate');
  const pubspec = parsePubspecVersion(pubspecText);
  const expectedId = 'com.shareittoo.app';
  if (candidate.applicationId !== expectedId || candidate.bundleId !== expectedId) {
    fail(`candidate Android and iOS identifiers must both be ${expectedId}.`);
  }
  if (candidate.applicationId !== identity.applicationId || candidate.bundleId !== identity.bundleId) {
    fail('candidate identifiers must match store/submission.json.');
  }
  if (candidate.versionName !== pubspec.versionName || candidate.versionName !== identity.versionName) {
    fail('candidate versionName must match pubspec.yaml and store/submission.json.');
  }
  const minimumBuild = BigInt(nonEmptyString(candidate.minimumBuildNumber, 'candidate.minimumBuildNumber'));
  if (minimumBuild !== BigInt(nonEmptyString(identity.minimumStoreBuildNumber, 'submission.identity.minimumStoreBuildNumber')) || minimumBuild < 2026080903n) {
    fail('candidate minimumBuildNumber must match the store gate and be at least 2026080903.');
  }
  if (candidate.releaseChannel !== 'internal' || candidate.releaseChannel !== identity.releaseChannel) {
    fail('candidate releaseChannel must remain internal.');
  }
  if (candidate.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1' || candidate.apiBaseUrl !== identity.apiBaseUrl) {
    fail('candidate must target only the isolated staging API.');
  }
  if (candidate.stripeLivemode !== false) {
    fail('candidate.stripeLivemode must remain false for B11.');
  }
  if (!['memory', 'stripe-test'].includes(candidate.paymentMode)) {
    fail('candidate.paymentMode must be memory or stripe-test.');
  }

  const strict = state === 'passed';
  const buildNumber = nullableString(candidate.buildNumber, 'candidate.buildNumber');
  const commit = nullableString(candidate.commit, 'candidate.commit');
  if (buildNumber !== null && !/^\d{10}$/.test(buildNumber)) {
    fail('candidate.buildNumber must use YYYYMMDDNN.');
  }
  if (commit !== null && !/^[a-f0-9]{40}$/i.test(commit)) {
    fail('candidate.commit must be a full 40-character Git commit.');
  }
  if (strict) {
    if (buildNumber === null || BigInt(buildNumber) < minimumBuild || BigInt(buildNumber) !== pubspec.buildNumber) {
      fail('A passed candidate build must match pubspec.yaml and meet the minimum store build.');
    }
    if (commit === null) fail('A passed candidate requires a full Git commit.');
    if (candidate.firebaseConfigured !== true) {
      fail('A passed B11 candidate requires complete Firebase configuration.');
    }
  } else if (candidate.firebaseConfigured !== false && candidate.firebaseConfigured !== true) {
    fail('candidate.firebaseConfigured must be boolean.');
  }

  const android = object(candidate.android, 'candidate.android');
  const ios = object(candidate.ios, 'candidate.ios');
  if (!['pending', 'play-internal'].includes(android.delivery)) {
    fail('candidate.android.delivery must be pending or play-internal.');
  }
  if (!['pending', 'testflight-internal'].includes(ios.delivery)) {
    fail('candidate.ios.delivery must be pending or testflight-internal.');
  }
  for (const [key, value] of Object.entries({
    'candidate.android.aabSha256': android.aabSha256,
    'candidate.android.apkSha256': android.apkSha256,
    'candidate.android.signingCertificateSha256': android.signingCertificateSha256,
    'candidate.ios.ipaSha256': ios.ipaSha256,
  })) {
    assertSha256(value, key, { required: strict });
  }
  const teamIdentifier = nullableString(ios.teamIdentifier, 'candidate.ios.teamIdentifier');
  if (teamIdentifier !== null && !/^[A-Z0-9]{10}$/.test(teamIdentifier)) {
    fail('candidate.ios.teamIdentifier must be a 10-character Apple Team ID.');
  }
  if (strict) {
    if (android.delivery !== 'play-internal' || ios.delivery !== 'testflight-internal') {
      fail('A passed candidate must be installed through Play Internal and TestFlight Internal.');
    }
    if (teamIdentifier === null || ios.privacyManifestScanned !== true) {
      fail('A passed iOS candidate requires Team ID and Privacy Manifest scan.');
    }
  } else if (ios.privacyManifestScanned !== false && ios.privacyManifestScanned !== true) {
    fail('candidate.ios.privacyManifestScanned must be boolean.');
  }
  if (android.directDiagnostic !== undefined) {
    validateAndroidDirectDiagnostic(root, object(android.directDiagnostic, 'candidate.android.directDiagnostic'), candidate);
  }
  if (android.directAppLinks !== undefined) {
    validateAndroidDirectAppLinks(root, object(android.directAppLinks, 'candidate.android.directAppLinks'), candidate);
  }
  if (android.authenticatedSession !== undefined) {
    validateAndroidAuthenticatedSession(
      root,
      object(android.authenticatedSession, 'candidate.android.authenticatedSession'),
      candidate,
    );
  }
  if (android.syntheticRoleBooking !== undefined) {
    validateAndroidSyntheticRoleBooking(
      root,
      object(android.syntheticRoleBooking, 'candidate.android.syntheticRoleBooking'),
      candidate,
    );
  }
  if (android.authenticatedDeepLinks !== undefined) {
    validateAndroidAuthenticatedDeepLinks(
      root,
      object(android.authenticatedDeepLinks, 'candidate.android.authenticatedDeepLinks'),
      candidate,
    );
  }
  if (android.logoutLifecycle !== undefined) {
    validateAndroidLogoutLifecycle(
      root,
      object(android.logoutLifecycle, 'candidate.android.logoutLifecycle'),
      candidate,
    );
  }
  if (android.offlineRealtime !== undefined) {
    validateAndroidOfflineRealtime(
      root,
      object(android.offlineRealtime, 'candidate.android.offlineRealtime'),
      candidate,
    );
  }

  if (!Array.isArray(manifest.deviceMatrix)) fail('deviceMatrix must be an array.');
  const cells = new Map();
  for (const raw of manifest.deviceMatrix) {
    const cell = object(raw, 'deviceMatrix entry');
    const id = nonEmptyString(cell.id, 'deviceMatrix.id');
    if (cells.has(id)) fail(`Duplicate device matrix id: ${id}.`);
    cells.set(id, cell);
  }
  for (const [id, expected] of requiredCells) {
    const cell = cells.get(id);
    if (!cell) fail(`Missing required device matrix cell: ${id}.`);
    if (cell.platform !== expected.platform || cell.network !== expected.network || cell.role !== expected.role) {
      fail(`${id} does not match its required platform/network/role.`);
    }
    if (cell.deviceType !== 'physical') fail(`${id} must use a physical device.`);
    const expectedReader = cell.platform === 'android' ? 'talkback' : 'voiceover';
    if (cell.screenReader !== expectedReader) fail(`${id} must use ${expectedReader}.`);
    if (!allowedProgressStates.has(cell.status)) fail(`${id}.status is invalid.`);
    const tests = object(cell.tests, `${id}.tests`);
    if (Object.keys(tests).length !== requiredDeviceTests.length) {
      fail(`${id}.tests must contain exactly the required B11 device checks.`);
    }
    for (const test of requiredDeviceTests) {
      if (!allowedProgressStates.has(tests[test])) fail(`${id}.tests.${test} is invalid.`);
    }
    const cellPassed = cell.status === 'passed';
    if (cellPassed || strict) {
      nonEmptyString(cell.deviceModel, `${id}.deviceModel`);
      nonEmptyString(cell.osVersion, `${id}.osVersion`);
      const expectedInstall = cell.platform === 'android' ? 'play-internal' : 'testflight-internal';
      if (cell.storeInstall !== expectedInstall) fail(`${id}.storeInstall must be ${expectedInstall}.`);
      if (cell.status !== 'passed' || requiredDeviceTests.some((test) => tests[test] !== 'passed')) {
        fail(`${id} and every required device check must be passed.`);
      }
      const ref = evidenceRef(root, cell.evidenceRef, `${id}.evidenceRef`, { required: true });
      validateDeviceCellEvidence(root, ref, cell, candidate, `${id}.evidence`);
    } else {
      if (!['pending', 'play-internal', 'testflight-internal'].includes(cell.storeInstall)) {
        fail(`${id}.storeInstall is invalid.`);
      }
      const progressRef = evidenceRef(root, cell.evidenceRef, `${id}.evidenceRef`, { required: false });
      if (progressRef !== null) {
        validateDeviceCellProgressEvidence(
          root,
          progressRef,
          cell,
          candidate,
          `${id}.progressEvidence`,
        );
      }
    }
  }
  if (cells.size !== requiredCells.size) {
    fail(`deviceMatrix must contain exactly ${requiredCells.size} required cells.`);
  }

  const releaseChecks = object(manifest.releaseChecks, 'releaseChecks');
  if (Object.keys(releaseChecks).length !== requiredReleaseChecks.length) {
    fail('releaseChecks must contain exactly the required B11 release checks.');
  }
  let releaseChecksPassed = 0;
  for (const key of requiredReleaseChecks) {
    const check = object(releaseChecks[key], `releaseChecks.${key}`);
    if (!allowedProgressStates.has(check.status)) fail(`releaseChecks.${key}.status is invalid.`);
    if (check.status === 'passed') releaseChecksPassed += 1;
    const ref = evidenceRef(root, check.evidenceRef, `releaseChecks.${key}.evidenceRef`, {
      required: strict || check.status === 'passed',
    });
    if (check.status === 'passed') {
      validateReleaseCheckEvidence(root, ref, key, candidate, `releaseChecks.${key}.evidence`);
    } else if (key === 'crashReleaseMapping' && check.status === 'testing') {
      validateCrashMappingProgressEvidence(
        root,
        ref,
        candidate,
        `releaseChecks.${key}.evidence`,
      );
    } else if (key === 'storeWarningsLinksAndSigning' && check.status === 'testing') {
      validateStoreLinksAndSigningProgressEvidence(
        root,
        ref,
        candidate,
        `releaseChecks.${key}.evidence`,
      );
    } else if (key === 'firebaseFcmAndApns' && check.status === 'testing' && ref !== null) {
      validateAndroidControlledFcmProgressEvidence(
        root,
        ref,
        candidate,
        `releaseChecks.${key}.evidence`,
      );
    }
    if (strict && check.status !== 'passed') fail(`releaseChecks.${key} must be passed.`);
  }

  const approvals = object(manifest.approvals, 'approvals');
  for (const key of ['technical', 'productOwner']) {
    const approval = object(approvals[key], `approvals.${key}`);
    if (!['open', 'passed'].includes(approval.status)) fail(`approvals.${key}.status is invalid.`);
    const approved = strict || approval.status === 'passed';
    if (approved && approval.status !== 'passed') fail(`approvals.${key} must be passed.`);
    isoTimestamp(approval.approvedAt, `approvals.${key}.approvedAt`, { required: approved });
    const ref = evidenceRef(root, approval.evidenceRef, `approvals.${key}.evidenceRef`, { required: approved });
    if (approved) {
      validateApprovalEvidence(root, ref, key, approval, candidate, `approvals.${key}.evidence`);
    }
  }

  const policy = object(manifest.evidencePolicy, 'evidencePolicy');
  if (policy.root !== 'docs/evidence/b11' ||
      policy.containsSecrets !== false ||
      policy.containsRawDeviceIdentifiers !== false ||
      policy.containsReviewCredentials !== false ||
      policy.syntheticAccountsOnly !== true) {
    fail('evidencePolicy must keep B11 evidence secret-free, sanitized, and synthetic-only.');
  }

  const gateValues = deviceGateKeys.map((key) => gates[key]);
  if (gateValues.some((value) => value !== 'open' && value !== 'closed')) {
    fail('B11 device-related store gates must be open or closed.');
  }
  if (state === 'passed' && gateValues.some((value) => value !== 'closed')) {
    fail('A passed device validation requires all three related store gates closed.');
  }
  if (state !== 'passed' && gateValues.every((value) => value === 'closed')) {
    fail('Device-related store gates cannot all close before device validation passes.');
  }
  if (requirePassed && state !== 'passed') {
    const passedCells = [...requiredCells.keys()].filter((id) => cells.get(id)?.status === 'passed').length;
    fail(`B11 device validation remains ${state}: matrix=${passedCells}/${requiredCells.size}, releaseChecks=${releaseChecksPassed}/${requiredReleaseChecks.length}.`);
  }

  return {
    state,
    goNoGo,
    matrixPassed: [...requiredCells.keys()].filter((id) => cells.get(id)?.status === 'passed').length,
    matrixTotal: requiredCells.size,
    releaseChecksPassed,
    releaseChecksTotal: requiredReleaseChecks.length,
    minimumBuild: minimumBuild.toString(),
  };
}

function parseArguments(arguments_) {
  let requirePassed = false;
  let manifestPath = null;
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === '--require-passed') {
      requirePassed = true;
    } else if (value === '--manifest') {
      manifestPath = arguments_[index + 1] ?? fail('--manifest requires a path.');
      index += 1;
    } else {
      fail(`Unknown argument: ${value}`);
    }
  }
  return { requirePassed, manifestPath };
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { requirePassed, manifestPath } = parseArguments(process.argv.slice(2));
  const devicePath = manifestPath === null ? resolve(root, 'store/device-validation.json') : resolve(manifestPath);
  const summary = validateDeviceEvidence({
    root,
    deviceManifest: JSON.parse(readFileSync(devicePath, 'utf8')),
    submissionManifest: JSON.parse(readFileSync(resolve(root, 'store/submission.json'), 'utf8')),
    pubspecText: readFileSync(resolve(root, 'pubspec.yaml'), 'utf8'),
    requirePassed,
  });
  console.log(
    `Device evidence valid: state=${summary.state}, goNoGo=${summary.goNoGo}, ` +
      `matrix=${summary.matrixPassed}/${summary.matrixTotal}, ` +
      `releaseChecks=${summary.releaseChecksPassed}/${summary.releaseChecksTotal}, ` +
      `minimumBuild=${summary.minimumBuild}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
