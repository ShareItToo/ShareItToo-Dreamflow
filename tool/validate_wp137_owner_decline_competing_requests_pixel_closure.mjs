#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp137-owner-decline-competing-requests-pixel-closure-20260913.json';
const implementationHead = '1ae97c0c653446791867373f3dffe85308b5132d';
const candidateSourceHead = '7b0479c8ee679c3e428f5aad9999d582c1c8455f';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP137 ${label} is invalid.`);
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
    fail(`WP137 source is unavailable: ${path}`);
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
    fail(`WP137 source head is not an ancestor of HEAD: ${head}`);
  }
}

export function validateWp137OwnerDeclineCompetingRequestsPixelClosure({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp137-owner-decline-competing-requests-pixel-closure'
      || value.status !== 'passed-exact-candidate-pixel-competing-request-decline'
      || value.capturedAt !== '2026-09-13T09:45:21.550Z') {
    fail('WP137 evidence identity is invalid.');
  }

  exact(value.source?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.source?.implementationCommit, implementationHead, 'implementation commit');
  exact(value.source?.candidateSourceCommit, candidateSourceHead, 'candidate source');
  exact(value.source?.candidateSourceUnchanged, true, 'candidate source immutability');
  if (checkGitState) {
    assertAncestor(repositoryRoot, implementationHead);
    assertAncestor(repositoryRoot, candidateSourceHead);
  }
  for (const [path, expectedHash] of Object.entries(value.source?.sourceInventory ?? {})) {
    exact(sha256(sourceAtHead(repositoryRoot, implementationHead, path)), expectedHash,
      `source hash for ${path}`);
  }
  exact(Object.keys(value.source?.sourceInventory ?? {}).sort(), [
    'test/tool/diagnose_android_owner_decline_competing_requests.test.mjs',
    'tool/diagnose_android_owner_decline_competing_requests.mjs',
  ], 'source inventory');

  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091311',
    releaseChannel: 'internal',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    firebaseConfigured: true,
    apkSha256: '0488a10dd0aab85cf18ba4ea8c37193b1fdc2334bb7092efb9c0d23311a3da88',
    aabSha256: '59df237569ac71b226b3199a33d3b01b946359f894f5c9ddf09c1e7063ce1cc6',
    privacyReportSha256: 'e17e8960f25fad762eaf8f63d95f37da569e471deaafe71e09a7880fabed0503',
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    privacyScan: 'passed',
    closedPilotEnvelopeEnabled: true,
    stageAPilotId: 'heilbronn_wave0',
  }, 'candidate contract');

  exact(value.pixel, {
    physical: true,
    model: 'Pixel 7 Pro',
    androidVersion: '17',
    apiLevel: 37,
    securityPatch: '2026-07-05',
    installedVersion: '1.0.0+2026091311',
    installedApkHashMatched: true,
    installedCandidateSourceMatched: true,
  }, 'Pixel contract');

  exact(value.physicalJourney, {
    distinctPrincipals: 3,
    twoOverlappingNonBindingRequests: 'passed-requested',
    ownerDeclineThroughPixelUi: 'passed',
    declineConfirmation: 'passed',
    declinedRequestCompletedSurface: 'passed',
    exactlyOneRequestDeclined: true,
    untouchedCompetingRequest: 'passed-still-requested',
    threePrincipalRoleIsolation: 'passed',
    declinedRenterNotification: 'passed',
    cleanup: 'passed-both-terminal-listing-ended-publicly-absent',
    protectedOwnerSessionRestored: true,
  }, 'physical journey');

  exact(value.verification, {
    focusedRunnerContractTests: 'passed-3-of-3',
    fullLocalTechnicalRegression: 'passed',
    flutterAnalyzer: 'passed-zero-issues',
    webWasmBuild: 'passed',
    loopbackSmoke: 'passed',
    androidDebugBuild: 'passed-min-sdk-24',
    cleanCheckoutReproducibility: 'passed',
    githubRegressionRunId: 34750784804,
    githubRegressionConclusion: 'success',
    githubCodeqlRunId: 34750784788,
    githubCodeqlConclusion: 'success',
    openCodeScanningAlerts: 0,
  }, 'verification contract');

  exact(value.portfolio, {
    before: { pass: 18, partial: 6, open: 8 },
    after: { pass: 19, partial: 5, open: 8 },
    promotedRequirement: 'offer-request-accept-decline',
    promotedFrom: 'PARTIAL',
    promotedTo: 'PASS',
  }, 'portfolio contract');

  const falseBoundaries = [
    'onePlusContacted', 'googlePlayChanged', 'productionChanged', 'firebaseChanged',
    'backendDeployed', 'paymentEndpointCalled', 'stripeLivemode', 'realMoneyUsed',
    'contractCreated', 'reservationCreated', 'listingLeftActive',
    'testBookingLeftActive', 'publicRegistrationChanged', 'pullRequestMerged',
    'containsAccountIdentity', 'containsCredential', 'containsToken',
    'containsFixtureIdentifier', 'containsRawDeviceIdentifier',
    'containsPrivateFilesystemPath',
  ];
  if (falseBoundaries.some((key) => value.boundaries?.[key] !== false)
      || Object.keys(value.boundaries ?? {}).length !== falseBoundaries.length) {
    fail('WP137 boundary contract is invalid.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP137 evidence contains private or secret-shaped data.');
  }

  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    exactlyOneRequestDeclined: value.physicalJourney.exactlyOneRequestDeclined,
    untouchedCompetingRequest: value.physicalJourney.untouchedCompetingRequest,
    githubRegression: value.verification.githubRegressionConclusion,
    portfolio: value.portfolio.after,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp137OwnerDeclineCompetingRequestsPixelClosure(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP137 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
