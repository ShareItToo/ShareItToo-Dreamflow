#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp138-google-signin-current-candidate-pixel-closure-20260913.json';
const implementationHead = 'e3b7e62b98ad0dcd1a2ca32f342c497f919d331a';
const privacyRatchetHead = 'd574d8da5ce62f63cb56f8443fe14eb9bb05cc5d';
const candidateSourceHead = '904c2b734160544aaeb1128cac15191a521739e7';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP138 ${label} is invalid.`);
  }
}

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return Buffer.from(execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    fail(`WP138 source is unavailable: ${path}`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP138 source head is not an ancestor of HEAD: ${head}`);
  }
}

export function validateWp138GoogleSigninCurrentCandidatePixelClosure({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp138-google-signin-current-candidate-pixel-closure'
      || value.status !== 'passed-google-cancel-login-cold-start-repeat-and-owner-restore'
      || value.capturedAt !== '2026-09-13T11:08:18.878Z') {
    fail('WP138 evidence identity is invalid.');
  }

  exact(value.source?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.source?.implementationCommit, implementationHead, 'implementation commit');
  exact(value.source?.privacyRatchetCommit, privacyRatchetHead, 'privacy ratchet commit');
  exact(value.source?.candidateSourceCommit, candidateSourceHead, 'candidate source');
  if (checkGitState) {
    assertAncestor(repositoryRoot, implementationHead);
    assertAncestor(repositoryRoot, privacyRatchetHead);
    assertAncestor(repositoryRoot, candidateSourceHead);
  }
  const sourceInventory = value.source?.sourceInventory ?? {};
  exact(Object.keys(sourceInventory).sort(), [
    'lib/config/private_pilot_config.dart',
    'pubspec.yaml',
    'store/privacy-disclosures.json',
    'test/tool/diagnose_android_google_social_auth.test.mjs',
    'tool/diagnose_android_google_social_auth.mjs',
  ], 'source inventory');
  for (const [path, expectedHash] of Object.entries(sourceInventory)) {
    exact(sha256(sourceAtHead(repositoryRoot, candidateSourceHead, path)), expectedHash,
      `source hash for ${path}`);
  }

  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091312',
    sourceCommit: candidateSourceHead,
    releaseChannel: 'internal',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    socialAuth: {
      googleEnabled: true,
      appleEnabled: false,
      facebookEnabled: false,
    },
    blueOceanListingAssistantEnabled: true,
    listingAiExecutionLocation: 'android_on_device',
    listingAiExternalImageProviderEnabled: false,
    closedPilotEnvelopeEnabled: true,
    stageAPilotId: 'heilbronn_wave0',
    apkSha256: 'e6d1df85e4e8973765c594b8fe9eb2654c876ee11cafe6d94cfe5c57ff8d7fb9',
    aabSha256: 'c0c0f27fb14d393b97c46b55bf81f201081dce1d9756f3468bfa442c4bdf9c6e',
    privacyReportSha256: '77ecdd7ed447623243c2a04f4100eb284217a2a5f0005efa9487e8581bd84528',
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    archiveValidation: 'passed-owner-only-exact-four-files',
    privacyScan: 'passed',
  }, 'candidate contract');

  exact(value.pixelUpdate, {
    capturedAt: '2026-09-13T11:07:09.783Z',
    physical: true,
    model: 'Pixel 7 Pro',
    androidVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    installedVersionBefore: '1.0.0+2026091311',
    installedVersionAfter: '1.0.0+2026091312',
    strictlyNewerBuildInstalled: true,
    candidateSignatureMatchedInstalledApp: true,
    installedCandidateHashMatched: true,
    firstInstallTimePreserved: true,
    ceDataInodePreserved: true,
    uninstallUsed: false,
    dataResetUsed: false,
  }, 'Pixel update');

  const journey = value.physicalJourney;
  exact(journey?.exactPrivateGoogleAccountSelected, true, 'private account selection');
  exact(journey?.googleChooserCancellation, 'passed-no-session', 'chooser cancellation');
  exact(journey?.cancellationColdStartRemainedGuest, true, 'cancel cold start');
  exact(journey?.firstGoogleLogin, 'passed', 'first login');
  exact(journey?.coldStartSessionPersistence, 'passed', 'cold-start persistence');
  exact(journey?.repeatGoogleLogin, 'passed', 'repeat login');
  exact(journey?.sameStagingProfileAcrossAllThreeObservations, true, 'profile stability');
  exact(journey?.duplicateAccountObserved, false, 'duplicate observation');
  exact(journey?.accountCreationVersusExistingLinkage, 'not-asserted', 'linkage claim');
  exact(journey?.protectedSyntheticOwnerRestored, true, 'owner restoration');
  const profileHashes = journey?.privateProfileHashes ?? {};
  if (Object.keys(profileHashes).sort().join(',') !== 'coldStart,first,repeat'
      || !Object.values(profileHashes).every((hash) => /^[a-f0-9]{64}$/u.test(hash))
      || new Set(Object.values(profileHashes)).size !== 1) {
    fail('WP138 private profile fingerprint contract is invalid.');
  }

  exact(value.ratchetCorrections, {
    pubspecPrivacyInventoryFailureObserved: true,
    pubspecPrivacyInventoryRebound: true,
    v52ClientBuildFailureObserved: true,
    v52ClientBuildRebound: true,
    privacyDisclosureMeaningChanged: false,
    v52LegalContentChanged: false,
    workaroundRetained: false,
  }, 'ratchet corrections');
  exact(value.verification, {
    focusedRunnerContractTests: 'passed-5-of-5',
    googleOnlyFlutterProfileTests: 'passed-3-of-3',
    fullLocalTechnicalRegression: 'passed',
    flutterAnalyzer: 'passed-zero-issues',
    webWasmBuild: 'passed',
    loopbackSmoke: 'passed',
    androidDebugBuild: 'passed-min-sdk-24',
    signedReleaseArchive: 'passed',
    cleanCheckoutReproducibility: 'passed',
    githubRegressionRunId: 34753100834,
    githubRegressionConclusion: 'success',
    githubCodeqlRunId: 34753100820,
    githubCodeqlConclusion: 'success',
    openCodeScanningAlerts: 0,
  }, 'verification contract');
  exact(value.portfolio, {
    before: { pass: 19, partial: 5, open: 8 },
    after: { pass: 20, partial: 4, open: 8 },
    promotedRequirement: 'google-signin',
    promotedFrom: 'PARTIAL',
    promotedTo: 'PASS',
  }, 'portfolio contract');

  const falseBoundaries = [
    'onePlusContacted', 'googlePlayChanged', 'productionChanged',
    'firebaseConfigurationChanged', 'backendDeployed', 'paymentEndpointCalled',
    'stripeLivemode', 'realMoneyUsed', 'appleUsed', 'facebookUsed',
    'publicRegistrationChanged', 'accountCreationOrLinkageClaimed',
    'pullRequestMerged', 'containsAccountIdentity', 'containsCredential',
    'containsToken', 'containsRawDeviceIdentifier', 'containsPrivateFilesystemPath',
  ];
  if (falseBoundaries.some((key) => value.boundaries?.[key] !== false)
      || Object.keys(value.boundaries ?? {}).length !== falseBoundaries.length) {
    fail('WP138 boundary contract is invalid.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP138 evidence contains private or secret-shaped data.');
  }

  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    chooserCancellation: journey.googleChooserCancellation,
    sameStagingProfile: journey.sameStagingProfileAcrossAllThreeObservations,
    githubRegression: value.verification.githubRegressionConclusion,
    portfolio: value.portfolio.after,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp138GoogleSigninCurrentCandidatePixelClosure(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP138 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
