import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateDeviceEvidence } from '../../tool/validate_device_evidence.mjs';
import { createTestTempTracker } from './test_temp_fixtures.mjs';

const tempFixtures = createTestTempTracker();

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const baseDeviceManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'store/device-validation.json'), 'utf8'),
);
const baseSubmissionManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'store/submission.json'), 'utf8'),
);
const basePubspec = readFileSync(resolve(repositoryRoot, 'pubspec.yaml'), 'utf8');

function clone(value) {
  return structuredClone(value);
}

function validate({
  root = repositoryRoot,
  deviceManifest = clone(baseDeviceManifest),
  submissionManifest = clone(baseSubmissionManifest),
  pubspecText = basePubspec,
  requirePassed = false,
} = {}) {
  return validateDeviceEvidence({
    root,
    deviceManifest,
    submissionManifest,
    pubspecText,
    requirePassed,
  });
}

function writeEvidence(root, ref, contents) {
  const target = resolve(root, ref);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(contents, null, 2)}\n`);
}

function copyEvidenceTree(root, ref, visited = new Set()) {
  if (visited.has(ref)) return;
  visited.add(ref);
  const source = resolve(repositoryRoot, ref);
  const target = resolve(root, ref);
  mkdirSync(dirname(target), { recursive: true });
  const contents = readFileSync(source, 'utf8');
  writeFileSync(target, contents);
  if (!ref.endsWith('.json')) return;

  const pending = [JSON.parse(contents)];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value !== null && typeof value === 'object') {
      pending.push(...Object.values(value));
    } else if (typeof value === 'string' &&
        /^docs\/evidence\/b11\/[A-Za-z0-9._/-]+\.json$/.test(value)) {
      copyEvidenceTree(root, value, visited);
    }
  }
}

function progressEvidenceRoot() {
  const root = tempFixtures.makeSync('sit-progress-evidence-');
  cpSync(
    resolve(repositoryRoot, 'docs/evidence/b11'),
    resolve(root, 'docs/evidence/b11'),
    { recursive: true },
  );
  return root;
}

function crashProgressFixture() {
  const root = progressEvidenceRoot();
  const deviceManifest = clone(baseDeviceManifest);
  const ref = 'docs/evidence/b11/android-crash-progress-test.json';
  const evidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'docs/evidence/b11/android-crash-release-mapping-2026081027.json'),
    'utf8',
  ));
  evidence.candidate = evidenceCandidate(deviceManifest.candidate);
  evidence.artifacts.aabSha256 = deviceManifest.candidate.android.aabSha256;
  evidence.artifacts.apkSha256 = deviceManifest.candidate.android.apkSha256;
  evidence.artifacts.signingCertificateSha256 =
    deviceManifest.candidate.android.signingCertificateSha256;
  evidence.status = 'mapping-symbols-and-controlled-event-sent-console-pending';
  evidence.verifications.consoleReleaseAssignment = 'pending';
  evidence.verifications.nativeSymbolsPackagedForAllBundledAbis = 'passed';
  evidence.verifications.nativeSymbolGeneration = 'passed';
  evidence.verifications.nativeSymbolUploadToCrashlytics = 'passed';
  evidence.verifications.nativeSymbolUploadBuildResult = 'successful';
  evidence.verifications.nativeSymbolCacheDrainedAfterUpload = 'passed';
  delete evidence.verifications.consoleObservedVersion;
  delete evidence.verifications.consoleObservedEventCount;
  delete evidence.verifications.consoleCustomKeysBoundToCandidate;
  deviceManifest.releaseChecks.crashReleaseMapping = { status: 'testing', evidenceRef: ref };
  return { root, deviceManifest, ref, evidence };
}

function storeLinksProgressFixture() {
  const root = progressEvidenceRoot();
  const deviceManifest = clone(baseDeviceManifest);
  const ref = 'docs/evidence/b11/store-links-signing-progress-test.json';
  const evidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'docs/evidence/b11/store-links-signing-readiness-2026081116.json'),
    'utf8',
  ));
  evidence.candidate = evidenceCandidate(deviceManifest.candidate);
  evidence.artifacts.aabSha256 = deviceManifest.candidate.android.aabSha256;
  evidence.artifacts.apkSha256 = deviceManifest.candidate.android.apkSha256;
  evidence.artifacts.uploadCertificateSha256 =
    deviceManifest.candidate.android.signingCertificateSha256;
  evidence.sources.candidateEvidenceRef =
    deviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef;
  deviceManifest.releaseChecks.storeWarningsLinksAndSigning = { status: 'testing', evidenceRef: ref };
  return { root, deviceManifest, ref, evidence };
}

function crashConsoleObservationFixture() {
  const fixture = crashProgressFixture();
  fixture.evidence.status =
    'mapping-and-native-symbols-uploaded-console-release-observed-controlled-event-pending';
  fixture.evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  fixture.evidence.verifications.consoleReleaseAssignment = 'passed';
  fixture.evidence.verifications.consoleObservedVersion =
    `${fixture.deviceManifest.candidate.versionName} (${fixture.deviceManifest.candidate.buildNumber})`;
  delete fixture.evidence.verifications.deviceDiagnosticUi;
  fixture.evidence.consoleObservation = {
    source: 'firebase-console-read-only',
    latestReleaseMatchesExactCandidate: true,
    issueCountsUsedAsCandidateProof: false,
  };
  fixture.evidence.boundaries.controlledStagingEventGenerated = false;
  return fixture;
}

function evidenceCandidate(candidate) {
  return {
    applicationId: candidate.applicationId,
    bundleId: candidate.bundleId,
    versionName: candidate.versionName,
    buildNumber: candidate.buildNumber,
    commit: candidate.commit,
    releaseChannel: candidate.releaseChannel,
    apiBaseUrl: candidate.apiBaseUrl,
    firebaseConfigured: candidate.firebaseConfigured,
    paymentMode: candidate.paymentMode,
    stripeLivemode: candidate.stripeLivemode,
  };
}

function safeBoundaries() {
  return {
    containsSecrets: false,
    containsRawDeviceIdentifiers: false,
    containsReviewCredentials: false,
    syntheticAccountsOnly: true,
  };
}

function passedFixture() {
  const root = tempFixtures.makeSync('sit-device-evidence-');
  const deviceManifest = clone(baseDeviceManifest);
  const submissionManifest = clone(baseSubmissionManifest);
  const pubspecText = basePubspec.replace(
    /^version:\s*\d+\.\d+\.\d+\+\d{10}\s*$/m,
    'version: 1.0.0+2026080903',
  );

  deviceManifest.state = 'passed';
  deviceManifest.goNoGo = 'go';
  Object.assign(deviceManifest.candidate, {
    buildNumber: '2026080903',
    commit: 'a'.repeat(40),
    firebaseConfigured: true,
    paymentMode: 'stripe-test',
  });
  Object.assign(deviceManifest.candidate.android, {
    delivery: 'play-internal',
    aabSha256: 'b'.repeat(64),
    apkSha256: 'c'.repeat(64),
    signingCertificateSha256: 'd'.repeat(64),
  });
  delete deviceManifest.candidate.android.directDiagnostic;
  delete deviceManifest.candidate.android.directAppLinks;
  delete deviceManifest.candidate.android.authenticatedSession;
  delete deviceManifest.candidate.android.syntheticRoleBooking;
  delete deviceManifest.candidate.android.authenticatedDeepLinks;
  delete deviceManifest.candidate.android.logoutLifecycle;
  delete deviceManifest.candidate.android.offlineRealtime;
  Object.assign(deviceManifest.candidate.ios, {
    delivery: 'testflight-internal',
    ipaSha256: 'e'.repeat(64),
    teamIdentifier: 'ABCDE12345',
    privacyManifestScanned: true,
  });

  for (const cell of deviceManifest.deviceMatrix) {
    cell.deviceModel = `${cell.platform} test device`;
    cell.osVersion = cell.platform === 'android' ? 'Android 16' : 'iOS 19';
    cell.storeInstall = cell.platform === 'android' ? 'play-internal' : 'testflight-internal';
    cell.status = 'passed';
    for (const key of Object.keys(cell.tests)) cell.tests[key] = 'passed';
    cell.evidenceRef = `docs/evidence/b11/${cell.id}.json`;
    const checkedAt = '2026-08-09T18:00:00+02:00';
    writeEvidence(root, cell.evidenceRef, {
      schemaVersion: 1,
      kind: 'device-matrix-cell',
      status: 'passed',
      capturedAt: checkedAt,
      candidate: evidenceCandidate(deviceManifest.candidate),
      cell: {
        id: cell.id,
        platform: cell.platform,
        network: cell.network,
        role: cell.role,
        deviceType: cell.deviceType,
        deviceModel: cell.deviceModel,
        osVersion: cell.osVersion,
        storeInstall: cell.storeInstall,
        screenReader: cell.screenReader,
        tests: Object.fromEntries(Object.keys(cell.tests).map((id) => [id, {
          status: 'passed',
          checkedAt,
          summary: `Sanitized ${id} verification`,
        }])),
      },
      boundaries: safeBoundaries(),
    });
  }

  for (const [key, check] of Object.entries(deviceManifest.releaseChecks)) {
    check.status = 'passed';
    check.evidenceRef = `docs/evidence/b11/release-${key}.json`;
    writeEvidence(root, check.evidenceRef, {
      schemaVersion: 1,
      kind: 'release-check',
      status: 'passed',
      capturedAt: '2026-08-09T18:00:00+02:00',
      candidate: evidenceCandidate(deviceManifest.candidate),
      releaseCheck: {
        id: key,
        status: 'passed',
        verifications: [{
          id: `${key}-verification`,
          status: 'passed',
          checkedAt: '2026-08-09T18:00:00+02:00',
          summary: `Sanitized ${key} verification`,
        }],
      },
      boundaries: safeBoundaries(),
    });
  }

  for (const [key, approval] of Object.entries(deviceManifest.approvals)) {
    approval.status = 'passed';
    approval.approvedAt = '2026-08-09T18:00:00+02:00';
    approval.evidenceRef = `docs/evidence/b11/approval-${key}.json`;
    writeEvidence(root, approval.evidenceRef, {
      schemaVersion: 1,
      kind: 'approval',
      status: 'passed',
      candidate: evidenceCandidate(deviceManifest.candidate),
      approval: {
        type: key,
        decision: 'approved',
        approvedAt: approval.approvedAt,
        statement: `Sanitized ${key} approval`,
      },
      boundaries: safeBoundaries(),
    });
  }

  for (const key of [
    'realAndroidAndIosDevices',
    'finalBinaryPrivacyScan',
    'closedStoreAndAccessibilityMatrix',
  ]) {
    submissionManifest.blockingGates[key] = 'closed';
  }

  return { root, deviceManifest, submissionManifest, pubspecText };
}

function progressFixture() {
  const root = tempFixtures.makeSync('sit-device-progress-');
  const deviceManifest = clone(baseDeviceManifest);
  delete deviceManifest.candidate.android.directAppLinks;
  delete deviceManifest.candidate.android.authenticatedSession;
  delete deviceManifest.candidate.android.syntheticRoleBooking;
  delete deviceManifest.candidate.android.authenticatedDeepLinks;
  delete deviceManifest.candidate.android.logoutLifecycle;
  delete deviceManifest.candidate.android.offlineRealtime;
  const diagnosticRef = 'docs/evidence/b11/android-direct-smoke-progress-fixture.json';
  const capturedAt = '2026-08-09T18:00:00+02:00';
  deviceManifest.candidate.android.directDiagnostic = {
    status: 'passed',
    capturedAt,
    installMethod: 'direct-apk-diagnostic',
    manufacturer: 'Sanitized Android',
    deviceModel: 'Physical test device',
    osVersion: 'Android test version',
    evidenceRef: diagnosticRef,
  };
  writeEvidence(root, diagnosticRef, {
    schemaVersion: 1,
    kind: 'android-direct-device-smoke',
    status: 'installed-launched-pending-manual-matrix',
    capturedAt,
    candidate: {
      ...evidenceCandidate(deviceManifest.candidate),
      apkSha256: deviceManifest.candidate.android.apkSha256,
      signingCertificateSha256:
        deviceManifest.candidate.android.signingCertificateSha256,
      privacyScan: 'passed',
    },
    installation: {
      method: 'direct-apk-diagnostic',
      installed: true,
      installedVersionVerified: true,
      installedBuildVerified: true,
      firstLaunchEvent: 'passed',
      foregroundActivityVerified: true,
      storeInstallationGateSatisfied: false,
    },
    boundaries: {
      ...safeBoundaries(),
      manualFunctionalMatrixPassed: false,
      playInternalInstallPassed: false,
      realPushPassed: false,
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Sanitized Android',
      model: 'Physical test device',
      osVersion: 'Android test version',
      containsRawDeviceIdentifier: false,
    },
  });
  const refs = new Set(
    [
      ...Object.values(deviceManifest.releaseChecks),
      ...deviceManifest.deviceMatrix,
    ]
      .map((entry) => entry.evidenceRef)
      .filter((ref) => ref !== null),
  );
  for (const ref of refs) copyEvidenceTree(root, ref);
  return {
    root,
    deviceManifest,
    submissionManifest: clone(baseSubmissionManifest),
    pubspecText: basePubspec,
  };
}

function appLinkFixture() {
  const fixture = progressFixture();
  const { root, deviceManifest } = fixture;
  const ref = 'docs/evidence/b11/android-app-link-progress-fixture.json';
  const capturedAt = '2026-08-10T06:00:00.000Z';
  deviceManifest.candidate.android.directAppLinks = {
    status: 'passed',
    capturedAt,
    installMethod: 'direct-apk-diagnostic',
    manufacturer: 'Sanitized Android',
    deviceModel: 'Physical test device',
    osVersion: 'Android test version',
    evidenceRef: ref,
  };
  writeEvidence(root, ref, {
    schemaVersion: 1,
    kind: 'android-direct-app-link-diagnostic',
    status: 'passed-bounded-app-link-diagnostic',
    capturedAt,
    candidate: evidenceCandidate(deviceManifest.candidate),
    installed: {
      packageIdentityVerified: true,
      versionName: deviceManifest.candidate.versionName,
      buildNumber: deviceManifest.candidate.buildNumber,
      delivery: 'direct-apk',
      apkSha256: deviceManifest.candidate.android.apkSha256,
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Sanitized Android',
      model: 'Physical test device',
      osVersion: 'Android test version',
      containsRawDeviceIdentifier: false,
    },
    tests: {
      verifiedHttpsMissingListing: { status: 'passed', result: 'safe-listing-unavailable-surface' },
      customSchemeGuestChat: { status: 'passed', result: 'authentication-required-surface' },
      unsafeIdentifierRejected: { status: 'passed', result: 'guest-start-preserved' },
      foreignHostNotAssociated: { status: 'passed', result: 'shareittoo-package-absent' },
    },
    boundaries: {
      ...safeBoundaries(),
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      manualFunctionalMatrixPassed: false,
      authenticatedDeepLinksPassed: false,
      realPushPassed: false,
      lockCodeUsed: false,
    },
  });
  return fixture;
}

function playSyntheticRoleBookingFixture() {
  const fixture = syntheticRoleBookingFixture();
  const diagnostic = fixture.deviceManifest.candidate.android.syntheticRoleBooking;
  diagnostic.installMethod = 'google-play-split';
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, diagnostic.evidenceRef), 'utf8'));
  evidence.installed = {
    packageIdentityVerified: true,
    versionName: fixture.deviceManifest.candidate.versionName,
    buildNumber: fixture.deviceManifest.candidate.buildNumber,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: 4,
  };
  evidence.boundaries.directDiagnosticOnly = false;
  evidence.boundaries.storeInstallationGateSatisfied = true;
  writeEvidence(fixture.root, diagnostic.evidenceRef, evidence);
  return fixture;
}

function authenticatedSessionFixture() {
  const fixture = progressFixture();
  const { root, deviceManifest } = fixture;
  const ref = 'docs/evidence/b11/android-authenticated-session-progress-fixture.json';
  const capturedAt = '2026-08-10T07:11:48.605Z';
  deviceManifest.candidate.android.authenticatedSession = {
    status: 'passed',
    capturedAt,
    installMethod: 'direct-apk-diagnostic',
    manufacturer: 'Sanitized Android',
    deviceModel: 'Physical test device',
    osVersion: 'Android test version',
    evidenceRef: ref,
  };
  writeEvidence(root, ref, {
    schemaVersion: 1,
    kind: 'android-authenticated-session-diagnostic',
    status: 'passed-bounded-authenticated-session-diagnostic',
    capturedAt,
    candidate: evidenceCandidate(deviceManifest.candidate),
    installed: {
      packageIdentityVerified: true,
      versionName: deviceManifest.candidate.versionName,
      buildNumber: deviceManifest.candidate.buildNumber,
      delivery: 'direct-apk',
      apkSha256: deviceManifest.candidate.android.apkSha256,
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Sanitized Android',
      model: 'Physical test device',
      osVersion: 'Android test version',
      apiLevel: 36,
      securityPatch: '2026-04-05',
      containsRawDeviceIdentifier: false,
    },
    tests: {
      authenticatedProfileAccess: { status: 'passed', result: 'authenticated-actions-present' },
      coldStartSessionRestore: {
        status: 'passed',
        result: 'authenticated-profile-restored-after-force-stop',
      },
    },
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
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
    },
  });
  return fixture;
}

function playLogoutLifecycleFixture() {
  const fixture = logoutLifecycleFixture();
  const diagnostic = fixture.deviceManifest.candidate.android.logoutLifecycle;
  diagnostic.installMethod = 'google-play-split';
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, diagnostic.evidenceRef), 'utf8'));
  evidence.installed = {
    packageIdentityVerified: true,
    versionName: fixture.deviceManifest.candidate.versionName,
    buildNumber: fixture.deviceManifest.candidate.buildNumber,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: 4,
  };
  evidence.boundaries.directDiagnosticOnly = false;
  evidence.boundaries.storeInstallationGateSatisfied = true;
  writeEvidence(fixture.root, diagnostic.evidenceRef, evidence);
  return fixture;
}

function offlineAuthenticatedSessionFixture() {
  const fixture = authenticatedSessionFixture();
  const diagnostic = fixture.deviceManifest.candidate.android.authenticatedSession;
  diagnostic.networkCondition = 'offline';
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, diagnostic.evidenceRef), 'utf8'));
  evidence.network = {
    condition: 'offline',
    wifiDisabled: true,
    mobileDataDisabled: true,
    connectivityGate: 'passed-no-connectivity',
    networkRestored: 'passed',
  };
  writeEvidence(fixture.root, diagnostic.evidenceRef, evidence);
  return fixture;
}

function syntheticRoleBookingFixture() {
  const fixture = progressFixture();
  const { root, deviceManifest } = fixture;
  const ref = 'docs/evidence/b11/android-synthetic-role-booking-progress-fixture.json';
  const capturedAt = '2026-08-10T07:50:42.053Z';
  deviceManifest.candidate.android.syntheticRoleBooking = {
    status: 'passed',
    capturedAt,
    installMethod: 'direct-apk-diagnostic',
    manufacturer: 'Sanitized Android',
    deviceModel: 'Physical test device',
    osVersion: 'Android test version',
    evidenceRef: ref,
  };
  writeEvidence(root, ref, {
    schemaVersion: 1,
    kind: 'android-synthetic-role-booking-diagnostic',
    status: 'passed-bounded-synthetic-role-booking-diagnostic',
    capturedAt,
    candidate: evidenceCandidate(deviceManifest.candidate),
    installed: {
      packageIdentityVerified: true,
      versionName: deviceManifest.candidate.versionName,
      buildNumber: deviceManifest.candidate.buildNumber,
      delivery: 'direct-apk',
      apkSha256: deviceManifest.candidate.android.apkSha256,
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Sanitized Android',
      model: 'Physical test device',
      osVersion: 'Android test version',
      apiLevel: 36,
      securityPatch: '2026-04-05',
      containsRawDeviceIdentifier: false,
    },
    backendFixture: {
      accountCount: 2,
      roles: ['owner', 'renter'],
      registration: 'public-staging-accepted',
      verification: 'isolated-staging-fixture',
      listingStatus: 'active',
      workflow: ['requested', 'accepted', 'active', 'completed'],
      confirmations: {
        pickup: {
          status: 'passed', presenterRole: 'owner', verifierRole: 'renter', verificationVersion: 3,
        },
        return: {
          status: 'passed', presenterRole: 'renter', verifierRole: 'owner', verificationVersion: 3,
        },
      },
      paymentMode: 'memory',
      stripeLivemode: false,
      paymentEndpointCalled: false,
    },
    tests: {
      ownerRequestVisibility: { status: 'passed', result: 'requested-visible-to-owner' },
      renterUpcomingVisibility: { status: 'passed', result: 'accepted-visible-to-renter' },
      renterRunningVisibility: { status: 'passed', result: 'active-visible-to-renter' },
      renterCompletedVisibility: { status: 'passed', result: 'completed-visible-to-renter' },
    },
    isolation: {
      protectedReviewFixtureUnchanged: true,
      temporaryVaultRemovedAfterProbe: true,
      temporaryBookingCompleted: true,
      temporaryListingPaused: true,
      containsReviewCredentials: false,
    },
    boundaries: {
      ...safeBoundaries(),
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      fullDeviceMatrixPassed: false,
      wifiOnlyDiagnostic: true,
      hotspotPassed: false,
      authenticatedDeepLinksPassed: false,
      realPushPassed: false,
      manualTalkBackTraversalPassed: false,
      iosTestFlightPassed: false,
      paymentEndpointCalled: false,
      stripeLivemode: false,
      lockCodeUsed: false,
      accountIdentityRecorded: false,
      containsPersonalAccountData: false,
    },
  });
  return fixture;
}

function authenticatedDeepLinksFixture() {
  const fixture = progressFixture();
  const { root, deviceManifest } = fixture;
  const ref = 'docs/evidence/b11/android-authenticated-deep-links-progress-fixture.json';
  const capturedAt = '2026-08-10T08:12:06.707Z';
  deviceManifest.candidate.android.authenticatedDeepLinks = {
    status: 'passed',
    capturedAt,
    installMethod: 'direct-apk-diagnostic',
    manufacturer: 'Sanitized Android',
    deviceModel: 'Physical test device',
    osVersion: 'Android test version',
    evidenceRef: ref,
  };
  writeEvidence(root, ref, {
    schemaVersion: 1,
    kind: 'android-authenticated-deep-link-diagnostic',
    status: 'passed-bounded-authenticated-deep-link-diagnostic',
    capturedAt,
    candidate: evidenceCandidate(deviceManifest.candidate),
    installed: {
      packageIdentityVerified: true,
      versionName: deviceManifest.candidate.versionName,
      buildNumber: deviceManifest.candidate.buildNumber,
      apkSha256: deviceManifest.candidate.android.apkSha256,
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Sanitized Android',
      model: 'Physical test device',
      osVersion: 'Android test version',
      apiLevel: 36,
      securityPatch: '2026-04-05',
      containsRawDeviceIdentifier: false,
    },
    tests: {
      authenticatedHttpsListing: { status: 'passed', result: 'synthetic-listing-visible' },
      authenticatedHttpsBooking: { status: 'passed', result: 'completed-booking-visible' },
      authenticatedCustomSchemeChat: { status: 'passed', result: 'booking-chat-visible' },
    },
    boundaries: {
      syntheticAccountsOnly: true,
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
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
    },
    isolation: {
      protectedReviewFixtureUnchanged: true,
      protectedReviewSessionRestored: true,
      temporaryBookingCompleted: true,
      temporaryListingPaused: true,
      temporaryListingDeleted: false,
      temporaryVaultRemovedAfterProbe: true,
      containsReviewCredentials: false,
    },
  });
  return fixture;
}

function playAuthenticatedDeepLinksFixture() {
  const fixture = authenticatedDeepLinksFixture();
  const diagnostic = fixture.deviceManifest.candidate.android.authenticatedDeepLinks;
  diagnostic.installMethod = 'google-play-split';
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, diagnostic.evidenceRef), 'utf8'));
  evidence.installed = {
    packageIdentityVerified: true,
    versionName: fixture.deviceManifest.candidate.versionName,
    buildNumber: fixture.deviceManifest.candidate.buildNumber,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: 4,
  };
  evidence.boundaries.directDiagnosticOnly = false;
  evidence.boundaries.storeInstallationGateSatisfied = true;
  writeEvidence(fixture.root, diagnostic.evidenceRef, evidence);
  return fixture;
}

function logoutLifecycleFixture() {
  const fixture = progressFixture();
  const { root, deviceManifest } = fixture;
  const ref = 'docs/evidence/b11/android-logout-lifecycle-progress-fixture.json';
  const capturedAt = '2026-08-10T17:50:31Z';
  deviceManifest.candidate.android.logoutLifecycle = {
    status: 'passed',
    capturedAt,
    installMethod: 'direct-apk-diagnostic',
    manufacturer: 'Sanitized Android',
    deviceModel: 'Physical test device',
    osVersion: 'Android test version',
    evidenceRef: ref,
  };
  writeEvidence(root, ref, {
    schemaVersion: 1,
    kind: 'android-logout-lifecycle-diagnostic',
    status: 'passed-bounded-logout-lifecycle-diagnostic',
    capturedAt,
    candidate: evidenceCandidate(deviceManifest.candidate),
    installed: {
      packageIdentityVerified: true,
      versionName: deviceManifest.candidate.versionName,
      buildNumber: deviceManifest.candidate.buildNumber,
      apkSha256: deviceManifest.candidate.android.apkSha256,
    },
    device: {
      platform: 'android',
      physical: true,
      manufacturer: 'Sanitized Android',
      model: 'Physical test device',
      osVersion: 'Android test version',
      apiLevel: 36,
      securityPatch: '2026-04-05',
      containsRawDeviceIdentifier: false,
    },
    tests: {
      uiLogout: { status: 'passed', result: 'logout-confirmed-and-session-cleared' },
      coldStartGuestPersistence: { status: 'passed', result: 'guest-profile-restored-after-process-restart' },
      protectedChatAfterLogout: { status: 'passed', result: 'authentication-required-private-content-hidden' },
      postLogoutProcessAbsentPush: { status: 'passed', result: 'controlled-message-created-no-device-notification' },
    },
    notificationProbe: {
      processAbsent: true,
      messageAccepted: true,
      observedNotificationCountBefore: 0,
      observedNotificationCountAfter: 0,
      notificationCountUnchanged: true,
      observationSeconds: 35,
    },
    boundaries: {
      syntheticAccountsOnly: true,
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
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
    },
  });
  return fixture;
}

test('accepts the honest in-progress B11 evidence state', () => {
  const summary = validate();
  const expectedPassedReleaseChecks = Object.values(baseDeviceManifest.releaseChecks)
    .filter((check) => check.status === 'passed').length;
  assert.deepEqual(summary, {
    state: 'testing',
    goNoGo: 'hold',
    matrixPassed: 0,
    matrixTotal: 4,
    releaseChecksPassed: expectedPassedReleaseChecks,
    releaseChecksTotal: 7,
    minimumBuild: '2026080903',
  });
});

test('rejects a restricted permission added to the exact release inventory', () => {
  const root = progressEvidenceRoot();
  const candidateRef = baseDeviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef;
  const candidateEvidence = JSON.parse(readFileSync(resolve(root, candidateRef), 'utf8'));
  const ref = candidateEvidence.privacyAndNetwork.permissionInventoryEvidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(root, ref), 'utf8'));
  evidence.analysis.declaredPermissions.push('android.permission.READ_SMS');
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root }),
    /must preserve the exact expected permissions and avoid permission-form preclaims/,
  );
});

test('accepts an exact permission inventory after Store upload when Console warnings are resolved', () => {
  const root = progressEvidenceRoot();
  const candidateRef = baseDeviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef;
  const candidateEvidence = JSON.parse(readFileSync(resolve(root, candidateRef), 'utf8'));
  const ref = candidateEvidence.privacyAndNetwork.permissionInventoryEvidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(root, ref), 'utf8'));
  evidence.analysis.consoleWarningsPendingAfterAabUpload = false;
  evidence.boundaries.storeUploadPerformed = true;
  writeEvidence(root, ref, evidence);
  assert.equal(validate({ root }).state, 'testing');
});

test('rejects a permission inventory whose Store-upload and Console-warning states conflict', () => {
  const root = progressEvidenceRoot();
  const candidateRef = baseDeviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef;
  const candidateEvidence = JSON.parse(readFileSync(resolve(root, candidateRef), 'utf8'));
  const ref = candidateEvidence.privacyAndNetwork.permissionInventoryEvidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(root, ref), 'utf8'));
  evidence.analysis.consoleWarningsPendingAfterAabUpload = true;
  evidence.boundaries.storeUploadPerformed = true;
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root }),
    /must consistently bind the Store-upload phase to the Console-warning state/,
  );
});

test('Android FCM progress evidence must match the exact candidate APK', () => {
  const root = progressEvidenceRoot();
  const deviceManifest = clone(baseDeviceManifest);
  const previousManifest = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'docs/evidence/b11/android-controlled-fcm-2026081302-20260813T151533Z.json'),
    'utf8',
  ));
  const ref = 'docs/evidence/b11/android-controlled-fcm-progress-fixture.json';
  previousManifest.candidate = {
    ...previousManifest.candidate,
    applicationId: deviceManifest.candidate.applicationId,
    bundleId: deviceManifest.candidate.bundleId,
    versionName: deviceManifest.candidate.versionName,
    buildNumber: deviceManifest.candidate.buildNumber,
    commit: deviceManifest.candidate.commit,
    releaseChannel: deviceManifest.candidate.releaseChannel,
    apiBaseUrl: deviceManifest.candidate.apiBaseUrl,
    firebaseConfigured: deviceManifest.candidate.firebaseConfigured,
    paymentMode: deviceManifest.candidate.paymentMode,
    stripeLivemode: deviceManifest.candidate.stripeLivemode,
    apkSha256: deviceManifest.candidate.android.apkSha256,
  };
  previousManifest.installed = {
    applicationId: deviceManifest.candidate.applicationId,
    versionName: deviceManifest.candidate.versionName,
    buildNumber: deviceManifest.candidate.buildNumber,
    delivery: 'direct-apk',
    apkSha256: deviceManifest.candidate.android.apkSha256,
  };
  writeEvidence(root, ref, previousManifest);
  deviceManifest.releaseChecks.firebaseFcmAndApns = { status: 'testing', evidenceRef: ref };
  const evidence = JSON.parse(readFileSync(resolve(root, ref), 'utf8'));
  evidence.candidate.apkSha256 = 'f'.repeat(64);
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must match the exact current Android candidate and Staging boundary/,
  );
});

test('accepts exact Play FCM evidence that preserves and reconciles an existing protected fixture', () => {
  const root = progressEvidenceRoot();
  const deviceManifest = clone(baseDeviceManifest);
  const ref = 'docs/evidence/b11/android-controlled-fcm-protected-fixture.json';
  const evidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'docs/evidence/b11/android-controlled-fcm-2026081302-20260813T151533Z.json'),
    'utf8',
  ));
  evidence.candidate = {
    applicationId: deviceManifest.candidate.applicationId,
    versionName: deviceManifest.candidate.versionName,
    buildNumber: deviceManifest.candidate.buildNumber,
    commit: deviceManifest.candidate.commit,
    apkSha256: deviceManifest.candidate.android.apkSha256,
    apiBaseUrl: deviceManifest.candidate.apiBaseUrl,
    stripeLivemode: false,
  };
  evidence.installed = {
    applicationId: deviceManifest.candidate.applicationId,
    versionName: deviceManifest.candidate.versionName,
    buildNumber: deviceManifest.candidate.buildNumber,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: 4,
  };
  evidence.boundaries.directDiagnosticOnly = false;
  evidence.boundaries.storeInstallationGateSatisfied = true;
  evidence.isolation = {
    mode: 'existing-protected-synthetic-fixture',
    protectedReviewFixturePreserved: true,
    fixtureReconciledActiveAfterProbe: true,
    diagnosticMessagesOnly: true,
    temporaryVaultCreated: false,
    listingCreatedDuringProbe: false,
    listingDeleted: false,
    containsReviewCredentials: false,
  };
  writeEvidence(root, ref, evidence);
  deviceManifest.releaseChecks.firebaseFcmAndApns = { status: 'testing', evidenceRef: ref };
  assert.equal(validate({ root, deviceManifest }).state, 'testing');
});

test('rejects protected-fixture FCM evidence without active post-probe reconciliation', () => {
  const root = progressEvidenceRoot();
  const deviceManifest = clone(baseDeviceManifest);
  const ref = 'docs/evidence/b11/android-controlled-fcm-protected-fixture-invalid.json';
  const evidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'docs/evidence/b11/android-controlled-fcm-2026081302-20260813T151533Z.json'),
    'utf8',
  ));
  evidence.candidate = {
    applicationId: deviceManifest.candidate.applicationId,
    versionName: deviceManifest.candidate.versionName,
    buildNumber: deviceManifest.candidate.buildNumber,
    commit: deviceManifest.candidate.commit,
    apkSha256: deviceManifest.candidate.android.apkSha256,
    apiBaseUrl: deviceManifest.candidate.apiBaseUrl,
    stripeLivemode: false,
  };
  evidence.installed = {
    applicationId: deviceManifest.candidate.applicationId,
    versionName: deviceManifest.candidate.versionName,
    buildNumber: deviceManifest.candidate.buildNumber,
    delivery: 'google-play-split',
    installerPackageName: 'com.android.vending',
    splitCount: 4,
  };
  evidence.boundaries.directDiagnosticOnly = false;
  evidence.boundaries.storeInstallationGateSatisfied = true;
  evidence.isolation = {
    mode: 'existing-protected-synthetic-fixture',
    protectedReviewFixturePreserved: true,
    fixtureReconciledActiveAfterProbe: false,
    diagnosticMessagesOnly: true,
    temporaryVaultCreated: false,
    listingCreatedDuringProbe: false,
    listingDeleted: false,
    containsReviewCredentials: false,
  };
  writeEvidence(root, ref, evidence);
  deviceManifest.releaseChecks.firebaseFcmAndApns = { status: 'testing', evidenceRef: ref };
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must prove either a retired temporary fixture or a preserved active protected fixture/,
  );
});

test('accepts the exact bounded offline realtime recovery evidence', () => {
  assert.equal(validate().state, 'testing');
});

test('rejects crash-mapping progress evidence for a different AAB', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.artifacts.aabSha256 = 'f'.repeat(64);
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must match the exact Android candidate binaries/,
  );
});

test('accepts the earlier mapping-uploaded event-pending progress stage', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status = 'mapping-and-native-symbols-uploaded-controlled-event-pending';
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  delete evidence.verifications.deviceDiagnosticUi;
  evidence.boundaries.controlledStagingEventGenerated = false;
  writeEvidence(root, ref, evidence);
  assert.equal(validate({ root, deviceManifest }).state, 'testing');
});

test('rejects a completed native-symbol upload claim without cache-drain proof', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status = 'mapping-and-native-symbols-uploaded-controlled-event-pending';
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  evidence.verifications.nativeSymbolCacheDrainedAfterUpload = 'pending';
  delete evidence.verifications.deviceDiagnosticUi;
  evidence.boundaries.controlledStagingEventGenerated = false;
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must prove the completed Crashlytics native-symbol upload and drained local cache/,
  );
});

test('accepts mapping upload while keeping packaged native-symbol upload pending', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status = 'mapping-uploaded-native-symbols-packaged-controlled-event-pending';
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  evidence.verifications.nativeSymbolsPackagedForAllBundledAbis = 'passed';
  evidence.verifications.nativeSymbolUploadToCrashlytics = 'pending';
  delete evidence.verifications.deviceDiagnosticUi;
  evidence.boundaries.controlledStagingEventGenerated = false;
  writeEvidence(root, ref, evidence);
  assert.equal(validate({ root, deviceManifest }).state, 'testing');
});

test('accepts a read-only nonmatching Crashlytics release observation as pending evidence', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status = 'mapping-and-native-symbols-uploaded-controlled-event-pending';
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  delete evidence.verifications.deviceDiagnosticUi;
  evidence.boundaries.controlledStagingEventGenerated = false;
  evidence.consoleObservation = {
    capturedAt: '2026-08-12T01:01:00Z',
    source: 'firebase-console-read-only',
    observedLatestRelease: '1.0.0 (2026081104)',
    latestReleaseMatchesExactCandidate: false,
    issueCountsUsedAsCandidateProof: false,
    settingsChanged: false,
    eventGenerated: false,
  };
  writeEvidence(root, ref, evidence);
  assert.equal(validate({ root, deviceManifest }).state, 'testing');
});

test('rejects a matching release mislabeled as a pending nonmatching observation', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status = 'mapping-and-native-symbols-uploaded-controlled-event-pending';
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  delete evidence.verifications.deviceDiagnosticUi;
  evidence.boundaries.controlledStagingEventGenerated = false;
  evidence.consoleObservation = {
    capturedAt: '2026-08-12T01:01:00Z',
    source: 'firebase-console-read-only',
    observedLatestRelease: `${deviceManifest.candidate.versionName} (${deviceManifest.candidate.buildNumber})`,
    latestReleaseMatchesExactCandidate: false,
    issueCountsUsedAsCandidateProof: false,
    settingsChanged: false,
    eventGenerated: false,
  };
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must record only an honest read-only nonmatching Console observation while the exact release remains pending/,
  );
});

test('rejects a controlled-event claim without the sanitized staging boundary', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.boundaries.eventContainsAccountData = true;
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /sanitized staging event while console assignment remains pending/,
  );
});

test('rejects a Crashlytics console observation for a different release build', () => {
  const { root, deviceManifest, ref, evidence } = crashConsoleObservationFixture();
  evidence.verifications.consoleObservedVersion = '1.0.0 (2026081199)';
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must prove only the exact console release assignment while keeping the controlled event pending/,
  );
});

test('rejects using aggregate Crashlytics issue counts as exact candidate proof', () => {
  const { root, deviceManifest, ref, evidence } = crashConsoleObservationFixture();
  evidence.consoleObservation.issueCountsUsedAsCandidateProof = true;
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must prove only the exact console release assignment while keeping the controlled event pending/,
  );
});

test('accepts exact Crashlytics release observation while native-symbol upload remains pending', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status =
    'mapping-uploaded-native-symbols-packaged-console-release-observed-controlled-event-pending';
  evidence.verifications.consoleReleaseAssignment = 'passed';
  evidence.verifications.consoleObservedVersion =
    `${deviceManifest.candidate.versionName} (${deviceManifest.candidate.buildNumber})`;
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  evidence.verifications.nativeSymbolsPackagedForAllBundledAbis = 'passed';
  evidence.verifications.nativeSymbolUploadToCrashlytics = 'pending';
  evidence.verifications.nativeSymbolUploadBuildResult = 'pending';
  evidence.verifications.nativeSymbolCacheDrainedAfterUpload = 'pending';
  evidence.boundaries.controlledStagingEventGenerated = false;
  evidence.consoleObservation = {
    capturedAt: '2026-08-14T00:58:00+02:00',
    source: 'firebase-console-read-only',
    observedLatestRelease:
      `${deviceManifest.candidate.versionName} (${deviceManifest.candidate.buildNumber})`,
    latestReleaseMatchesExactCandidate: true,
    issueCountsUsedAsCandidateProof: false,
    settingsChanged: false,
    eventGenerated: false,
  };
  writeEvidence(root, ref, evidence);
  assert.equal(validate({ root, deviceManifest }).state, 'testing');
});

test('rejects claiming a native-symbol upload in the packaged-only console stage', () => {
  const { root, deviceManifest, ref, evidence } = crashProgressFixture();
  evidence.status =
    'mapping-uploaded-native-symbols-packaged-console-release-observed-controlled-event-pending';
  evidence.verifications.consoleReleaseAssignment = 'passed';
  evidence.verifications.consoleObservedVersion =
    `${deviceManifest.candidate.versionName} (${deviceManifest.candidate.buildNumber})`;
  evidence.verifications.controlledSanitizedCrashEvent = 'pending';
  evidence.verifications.nativeSymbolUploadToCrashlytics = 'passed';
  evidence.boundaries.controlledStagingEventGenerated = false;
  evidence.consoleObservation = {
    capturedAt: '2026-08-14T00:58:00+02:00',
    source: 'firebase-console-read-only',
    observedLatestRelease:
      `${deviceManifest.candidate.versionName} (${deviceManifest.candidate.buildNumber})`,
    latestReleaseMatchesExactCandidate: true,
    issueCountsUsedAsCandidateProof: false,
    settingsChanged: false,
    eventGenerated: false,
  };
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /native-symbol upload honestly pending/,
  );
});

test('accepts bounded Store links and signing progress without closing Store gates', () => {
  const { root, deviceManifest, ref, evidence } = storeLinksProgressFixture();
  writeEvidence(root, ref, evidence);
  assert.equal(validate({ root, deviceManifest }).state, 'testing');
});

test('rejects Store links and signing progress for a different upload certificate', () => {
  const { root, deviceManifest, ref, evidence } = storeLinksProgressFixture();
  evidence.artifacts.uploadCertificateSha256 = 'f'.repeat(64);
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must match the exact Android candidate plus upload and Play signing certificates/,
  );
});

test('rejects a premature Store-console or public-route pass claim', () => {
  const { root, deviceManifest, ref, evidence } = storeLinksProgressFixture();
  evidence.verifications.playConsoleWarnings = 'passed';
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /must keep public routes and Store-console checks honestly pending/,
  );
});

test('strict mode rejects the in-progress evidence state', () => {
  const expectedPassedReleaseChecks = Object.values(baseDeviceManifest.releaseChecks)
    .filter((check) => check.status === 'passed').length;
  assert.throws(
    () => validate({ requirePassed: true }),
    new RegExp(`remains testing: matrix=0/4, releaseChecks=${expectedPassedReleaseChecks}/7`),
  );
});

test('accepts the current exact-candidate bounded Android Wi-Fi progress', () => {
  const summary = validate();
  assert.equal(summary.state, 'testing');
  assert.equal(baseDeviceManifest.deviceMatrix[0].status, 'testing');
  assert.equal(
    Object.values(baseDeviceManifest.deviceMatrix[0].tests)
      .filter((status) => status === 'passed').length,
    9,
  );
  assert.match(baseDeviceManifest.deviceMatrix[0].evidenceRef, /android-wifi-owner-progress-2026081509/);
  assert.equal(baseDeviceManifest.candidate.android.authenticatedSession, undefined);
  assert.equal(baseDeviceManifest.candidate.android.syntheticRoleBooking.status, 'passed');
});

test('rejects partial matrix evidence that overstates a manifest test status', () => {
  const root = progressEvidenceRoot();
  const deviceManifest = clone(baseDeviceManifest);
  const ref = 'docs/evidence/b11/android-wifi-owner-progress-test.json';
  const cell = deviceManifest.deviceMatrix[0];
  cell.status = 'testing';
  cell.deviceModel = 'Pixel 7 Pro';
  cell.osVersion = 'Android 16';
  cell.storeInstall = 'play-internal';
  cell.tests.largeTextAndScreenReader = 'testing';
  cell.evidenceRef = ref;
  const evidence = {
    schemaVersion: 1,
    kind: 'device-matrix-cell-progress',
    status: 'testing',
    capturedAt: '2026-08-15T08:00:00Z',
    candidate: evidenceCandidate(deviceManifest.candidate),
    cell: {
      id: cell.id,
      platform: cell.platform,
      network: cell.network,
      role: cell.role,
      deviceType: cell.deviceType,
      deviceModel: cell.deviceModel,
      osVersion: cell.osVersion,
      storeInstall: cell.storeInstall,
      screenReader: cell.screenReader,
      tests: Object.fromEntries(Object.entries(cell.tests).map(([key, status]) => [key, {
        status,
        checkedAt: status === 'open' ? null : '2026-08-15T08:00:00Z',
        summary: `${key} remains bounded in the test fixture.`,
        evidenceRefs: status === 'open' ? [] : [
          deviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef,
        ],
      }])),
    },
    boundaries: {
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
      syntheticAccountsOnly: true,
    },
  };
  evidence.cell.tests.largeTextAndScreenReader.status = 'passed';
  writeEvidence(root, ref, evidence);
  assert.throws(
    () => validate({ root, deviceManifest }),
    /largeTextAndScreenReader.status must match the device matrix progress/,
  );
});

test('rejects a premature go decision', () => {
  const deviceManifest = clone(baseDeviceManifest);
  deviceManifest.goNoGo = 'go';
  assert.throws(() => validate({ deviceManifest }), /forbidden before the full device validation passes/);
});

test('rejects a missing required platform, network, and role cell', () => {
  const deviceManifest = clone(baseDeviceManifest);
  deviceManifest.deviceMatrix = deviceManifest.deviceMatrix.slice(1);
  assert.throws(() => validate({ deviceManifest }), /Missing required device matrix cell/);
});

test('rejects additional cells that could dilute the required matrix', () => {
  const deviceManifest = clone(baseDeviceManifest);
  const extra = clone(deviceManifest.deviceMatrix[0]);
  extra.id = 'android-extra';
  deviceManifest.deviceMatrix.push(extra);
  assert.throws(() => validate({ deviceManifest }), /must contain exactly 4 required cells/);
});

test('rejects credential-shaped fields anywhere in the evidence manifest', () => {
  const deviceManifest = clone(baseDeviceManifest);
  deviceManifest.reviewPassword = null;
  assert.throws(() => validate({ deviceManifest }), /must never contain credentials or secrets/);
});

test('rejects a referenced progress artifact that does not exist', () => {
  const deviceManifest = clone(baseDeviceManifest);
  deviceManifest.releaseChecks.candidateIdentityAndSignatures.evidenceRef =
    'docs/evidence/b11/missing-progress-evidence.md';
  assert.throws(
    () => validate({ deviceManifest }),
    /does not exist: docs\/evidence\/b11\/missing-progress-evidence.md/,
  );
});

test('accepts a complete, evidence-backed B11 pass', () => {
  const fixture = passedFixture();
  const summary = validate({ ...fixture, requirePassed: true });
  assert.equal(summary.state, 'passed');
  assert.equal(summary.goNoGo, 'go');
  assert.equal(summary.matrixPassed, 4);
  assert.equal(summary.releaseChecksPassed, 7);
});

test('a passed state fails closed when an evidence file is missing', () => {
  const fixture = passedFixture();
  fixture.deviceManifest.deviceMatrix[0].evidenceRef =
    'docs/evidence/b11/missing-device-evidence.md';
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /does not exist: docs\/evidence\/b11\/missing-device-evidence.md/,
  );
});

test('a non-empty but unstructured device evidence file cannot satisfy a passed cell', () => {
  const fixture = passedFixture();
  const ref = fixture.deviceManifest.deviceMatrix[0].evidenceRef;
  writeFileSync(resolve(fixture.root, ref), 'sanitized but unstructured evidence\n');
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /must contain valid JSON evidence/,
  );
});

test('device evidence must be bound to the same candidate commit', () => {
  const fixture = passedFixture();
  const ref = fixture.deviceManifest.deviceMatrix[0].evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.candidate.commit = 'f'.repeat(40);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /candidate.commit must match store\/device-validation.json/,
  );
});

test('device evidence rejects raw device identifier fields', () => {
  const fixture = passedFixture();
  const ref = fixture.deviceManifest.deviceMatrix[0].evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.cell.serialNumber = 'PRIVATE-SERIAL';
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /must never contain a raw device identifier/,
  );
});

test('release-check evidence cannot prove a different release check', () => {
  const fixture = passedFixture();
  const ref = fixture.deviceManifest.releaseChecks.firebaseFcmAndApns.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.releaseCheck.id = 'binaryPrivacyAndNetwork';
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /must identify firebaseFcmAndApns as passed/,
  );
});

test('passed evidence cannot be supplied through a symbolic link', () => {
  const fixture = passedFixture();
  const cell = fixture.deviceManifest.deviceMatrix[0];
  const originalRef = cell.evidenceRef;
  const linkedRef = 'docs/evidence/b11/linked-device-evidence.json';
  symlinkSync(resolve(fixture.root, originalRef), resolve(fixture.root, linkedRef));
  cell.evidenceRef = linkedRef;
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /must not reference a symbolic link/,
  );
});

test('passed evidence cannot escape through a linked parent directory', () => {
  const fixture = passedFixture();
  const cell = fixture.deviceManifest.deviceMatrix[0];
  const outside = resolve(fixture.root, 'outside-evidence');
  mkdirSync(outside, { recursive: true });
  const outsideFile = resolve(outside, 'device.json');
  writeFileSync(outsideFile, readFileSync(resolve(fixture.root, cell.evidenceRef)));
  const linkedDirectory = resolve(fixture.root, 'docs/evidence/b11/linked-parent');
  symlinkSync(outside, linkedDirectory, 'dir');
  cell.evidenceRef = 'docs/evidence/b11/linked-parent/device.json';
  assert.throws(
    () => validate({ ...fixture, requirePassed: true }),
    /must not escape the B11 evidence directory through a linked path/,
  );
});

test('direct diagnostic evidence must stay bound to the same candidate commit', () => {
  const fixture = progressFixture();
  const ref = fixture.deviceManifest.candidate.android.directDiagnostic.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.candidate.commit = 'f'.repeat(40);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /candidate.commit must match store\/device-validation.json/,
  );
});

test('direct diagnostic evidence cannot claim Play Internal or real push', () => {
  const fixture = progressFixture();
  const ref = fixture.deviceManifest.candidate.android.directDiagnostic.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.boundaries.playInternalInstallPassed = true;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must keep manual, Play Internal, and real-push gates open/,
  );
});

test('accepts exact, bounded direct app-link evidence without closing device gates', () => {
  const fixture = appLinkFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('direct app-link evidence cannot claim an authenticated or store-install pass', () => {
  const fixture = appLinkFixture();
  const ref = fixture.deviceManifest.candidate.android.directAppLinks.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.boundaries.authenticatedDeepLinksPassed = true;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must keep store, manual, authenticated, push, and lock-code gates open/,
  );
});

test('direct app-link evidence rejects a different installed candidate APK', () => {
  const fixture = appLinkFixture();
  const ref = fixture.deviceManifest.candidate.android.directAppLinks.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.installed.apkSha256 = 'f'.repeat(64);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove the exact installed candidate APK and package identity/,
  );
});

test('accepts exact, bounded authenticated-session evidence without closing device gates', () => {
  const fixture = authenticatedSessionFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('accepts an authenticated-session diagnostic bound to an offline gate', () => {
  const fixture = offlineAuthenticatedSessionFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
});

test('offline authenticated-session evidence must prove connectivity loss and restoration', () => {
  const fixture = offlineAuthenticatedSessionFixture();
  const ref = fixture.deviceManifest.candidate.android.authenticatedSession.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.network.networkRestored = 'pending';
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove the bounded offline gate and network restoration/,
  );
});

test('authenticated-session evidence rejects a different installed candidate APK', () => {
  const fixture = authenticatedSessionFixture();
  const ref = fixture.deviceManifest.candidate.android.authenticatedSession.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.installed.apkSha256 = 'f'.repeat(64);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove the exact installed candidate APK and package identity/,
  );
});

test('authenticated-session evidence cannot record identity or close the synthetic role matrix', () => {
  const fixture = authenticatedSessionFixture();
  const ref = fixture.deviceManifest.candidate.android.authenticatedSession.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.boundaries.accountIdentityRecorded = true;
  evidence.boundaries.syntheticRoleMatrixPassed = true;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must remain identity-free and keep store, role, booking, link, push, TalkBack, and lock-code gates open/,
  );
});

test('accepts exact, bounded synthetic-role booking evidence without closing the device matrix', () => {
  const fixture = syntheticRoleBookingFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('accepts the exact Google Play split for bounded synthetic-role booking evidence', () => {
  const fixture = playSyntheticRoleBookingFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('synthetic-role booking evidence rejects a different candidate APK', () => {
  const fixture = syntheticRoleBookingFixture();
  const ref = fixture.deviceManifest.candidate.android.syntheticRoleBooking.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.installed.apkSha256 = 'f'.repeat(64);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove the exact directly installed candidate APK/,
  );
});

test('synthetic-role booking evidence cannot claim payment, hotspot, or the full matrix', () => {
  const fixture = syntheticRoleBookingFixture();
  const ref = fixture.deviceManifest.candidate.android.syntheticRoleBooking.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.boundaries.paymentEndpointCalled = true;
  evidence.boundaries.hotspotPassed = true;
  evidence.boundaries.fullDeviceMatrixPassed = true;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must truthfully record installation provenance while keeping matrix, hotspot, link, push, TalkBack, iOS, payment, identity, and lock-code gates open/,
  );
});

test('synthetic-role booking evidence must preserve the active review fixture', () => {
  const fixture = syntheticRoleBookingFixture();
  const ref = fixture.deviceManifest.candidate.android.syntheticRoleBooking.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.isolation.protectedReviewFixtureUnchanged = false;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must preserve the active protected review fixture through an isolated temporary vault/,
  );
});

test('accepts exact authenticated deep-link evidence without closing the device matrix', () => {
  const fixture = authenticatedDeepLinksFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('accepts exact authenticated deep-link evidence from Google Play', () => {
  const fixture = playAuthenticatedDeepLinksFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('authenticated deep-link evidence rejects a different candidate APK', () => {
  const fixture = authenticatedDeepLinksFixture();
  const ref = fixture.deviceManifest.candidate.android.authenticatedDeepLinks.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.installed.apkSha256 = 'f'.repeat(64);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove the exact installed candidate APK and package identity/,
  );
});

test('authenticated deep-link evidence cannot claim push, hotspot, payment, or a sent message', () => {
  const fixture = authenticatedDeepLinksFixture();
  const ref = fixture.deviceManifest.candidate.android.authenticatedDeepLinks.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.boundaries.realPushPassed = true;
  evidence.boundaries.hotspotPassed = true;
  evidence.boundaries.paymentEndpointCalled = true;
  evidence.boundaries.messageSent = true;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove only the three identity-free Staging links while keeping store, matrix, hotspot, push, TalkBack, iOS, payment, and message gates open/,
  );
});

test('authenticated deep-link evidence must restore the protected review fixture', () => {
  const fixture = authenticatedDeepLinksFixture();
  const ref = fixture.deviceManifest.candidate.android.authenticatedDeepLinks.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.isolation.protectedReviewSessionRestored = false;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must preserve and restore the protected review fixture while completing and pausing the isolated temporary fixture/,
  );
});

test('accepts exact bounded logout lifecycle evidence without closing the device matrix', () => {
  const fixture = logoutLifecycleFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('accepts exact bounded logout lifecycle evidence from Google Play', () => {
  const fixture = playLogoutLifecycleFixture();
  const summary = validate(fixture);
  assert.equal(summary.state, 'testing');
  assert.equal(summary.matrixPassed, 0);
});

test('logout lifecycle evidence rejects a different candidate APK', () => {
  const fixture = logoutLifecycleFixture();
  const ref = fixture.deviceManifest.candidate.android.logoutLifecycle.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.installed.apkSha256 = 'f'.repeat(64);
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove the exact directly installed candidate APK/,
  );
});

test('logout lifecycle evidence requires a process-absent unchanged notification observation', () => {
  const fixture = logoutLifecycleFixture();
  const ref = fixture.deviceManifest.candidate.android.logoutLifecycle.evidenceRef;
  const evidence = JSON.parse(readFileSync(resolve(fixture.root, ref), 'utf8'));
  evidence.notificationProbe.processAbsent = false;
  evidence.notificationProbe.observedNotificationCountAfter = 1;
  writeEvidence(fixture.root, ref, evidence);
  assert.throws(
    () => validate(fixture),
    /must prove a process-absent, accepted-message suppression observation/,
  );
});
