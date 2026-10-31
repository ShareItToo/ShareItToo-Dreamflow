import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runPf17CurrentCandidateAuthenticatedSafeLinks,
} from '../../tool/diagnose_pf17_current_candidate_authenticated_safe_links.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  bundleId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026082302',
  commit: '1b3e86ef1bcfa5a88b1baf965fdad00e9d64f54b',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  firebaseConfigured: true,
  paymentMode: 'memory',
  stripeLivemode: false,
  android: Object.freeze({ apkSha256: 'a'.repeat(64) }),
});
const archive = Object.freeze({ apkSha256: candidate.android.apkSha256 });
const device = Object.freeze({ serial: 'private-device-id' });
const deviceSummary = Object.freeze({
  platform: 'android',
  physical: true,
  manufacturer: 'Google',
  model: 'Pixel 7 Pro',
  osVersion: '17',
  apiLevel: 37,
  securityPatch: '2026-07-05',
  containsRawDeviceIdentifier: false,
});
const capturedAt = '2026-08-23T16:00:00.000Z';

function evidence() {
  return {
    schemaVersion: 1,
    kind: 'android-authenticated-safe-app-link-diagnostic',
    status: 'passed-bounded-authenticated-safe-app-link-diagnostic',
    capturedAt,
    candidate: {
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
    },
    installed: {
      packageIdentityVerified: true,
      versionName: candidate.versionName,
      buildNumber: candidate.buildNumber,
      delivery: 'direct-apk',
      apkSha256: candidate.android.apkSha256,
    },
    device: deviceSummary,
    tests: {
      authenticatedNotificationsBefore: { status: 'passed' },
      verifiedHttpsMissingListing: { status: 'passed' },
      unsafeIdentifierRejected: { status: 'passed' },
      foreignHostNotAssociated: { status: 'passed' },
      authenticatedNotificationsAfter: { status: 'passed' },
    },
    boundaries: {
      directDiagnosticOnly: true,
      storeInstallationGateSatisfied: false,
      authenticatedSafeLinksPassed: true,
      authenticatedFixtureLinksPassed: false,
      manualFunctionalMatrixPassed: false,
      bookingFlowPassed: false,
      realPushPassed: false,
      loginPerformed: false,
      logoutPerformed: false,
      accountMutationPerformed: false,
      accountIdentityRecorded: false,
      lockCodeUsed: false,
      containsPersonalAccountData: false,
      containsSecrets: false,
      containsRawDeviceIdentifiers: false,
      containsReviewCredentials: false,
    },
  };
}

async function run(changed = evidence(), candidateOverride = candidate) {
  let options;
  const result = await runPf17CurrentCandidateAuthenticatedSafeLinks({
    candidate: candidateOverride,
    archive,
    device,
    deviceSummary,
    capturedAt,
    appLinkDiagnostic: async (received) => {
      options = received;
      return changed;
    },
  });
  return { result, options };
}

test('runs only the preserved authenticated read-only route on the exact candidate', async () => {
  const { result, options } = await run();
  assert.equal(result.status, 'passed-bounded-authenticated-safe-app-link-diagnostic');
  assert.equal(options.sessionMode, 'authenticated-preserved');
  assert.equal(options.vaultFile, null);
  assert.equal(options.candidate, candidate);
  assert.equal(options.archive, archive);
});

test('rejects candidate or archive drift before device interaction', async () => {
  const changedCandidate = { ...candidate, buildNumber: '2026082301' };
  await assert.rejects(run(evidence(), changedCandidate), /exact verified current candidate/u);
  await assert.rejects(
    runPf17CurrentCandidateAuthenticatedSafeLinks({
      candidate,
      archive: { apkSha256: 'b'.repeat(64) },
      device,
      deviceSummary,
      appLinkDiagnostic: async () => evidence(),
    }),
    /exact verified current candidate/u,
  );
});

test('rejects result candidate, installed APK or device drift', async () => {
  const candidateDrift = evidence();
  candidateDrift.candidate.buildNumber = '2026082301';
  await assert.rejects(run(candidateDrift), /not bound to the exact current candidate/u);

  const installedDrift = evidence();
  installedDrift.installed.delivery = 'google-play-split';
  await assert.rejects(run(installedDrift), /not bound to the installed direct APK/u);

  const deviceDrift = evidence();
  deviceDrift.device = { ...deviceSummary, osVersion: '16' };
  await assert.rejects(run(deviceDrift), /device summary drifted/u);
});

test('rejects incomplete checks and Store, fixture or mutation overclaims', async () => {
  const incomplete = evidence();
  incomplete.tests.authenticatedNotificationsAfter.status = 'failed';
  await assert.rejects(run(incomplete), /checks are incomplete/u);

  const missingBoundary = evidence();
  delete missingBoundary.boundaries.containsReviewCredentials;
  await assert.rejects(run(missingBoundary), /boundaries are invalid or overstated/u);

  for (const key of [
    'storeInstallationGateSatisfied',
    'authenticatedFixtureLinksPassed',
    'bookingFlowPassed',
    'realPushPassed',
    'logoutPerformed',
    'accountMutationPerformed',
  ]) {
    const overclaim = evidence();
    overclaim.boundaries[key] = true;
    await assert.rejects(run(overclaim), /boundaries are invalid or overstated/u);
  }
});
