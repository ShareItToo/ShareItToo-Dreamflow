#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requiredChecks = [
  'isolatedStagingFixture',
  'ownerPasswordLoginWithoutOtp',
  'renterPasswordLoginWithoutOtp',
  'ownerActiveVerifiedAndConsented',
  'renterActiveVerifiedAndConsented',
  'ownerListingVisible',
  'acceptedBookingVisibleToBothRoles',
  'sharedChatVisibleToBothRoles',
  'sharedChatReadableByBothRoles',
];
const requiredScenarios = [
  'ownerLogin',
  'renterLogin',
  'activeListing',
  'acceptedBooking',
  'sharedChat',
  'freshInstall',
  'secondNetwork',
  'reportAndBlock',
  'accountExport',
  'accountDeletion',
];
const requiredSafetyChecks = [
  'privateNoStoreAccountExport',
  'completeStructuredAccountExport',
  'syntheticListingReportCreated',
  'reportVisibleToReporter',
  'temporaryUserBlockCreated',
  'temporaryUserBlockRemoved',
  'sharedChatRestored',
];
const forbiddenSensitiveKeys = /^(password|secret|token|apiKey|privateKey|serviceAccount|credential|credentials|reviewPassword|reviewUsername|accountIdentifier|emailAddress)$/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function assertSanitized(value, label = 'review access') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, `${label}[${index}]`));
    return;
  }
  if (typeof value === 'string') {
    if (emailPattern.test(value)) fail(`${label} must not contain an email address.`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenSensitiveKeys.test(key)) {
      const allowedBoundary = [
        'containsSecrets',
        'containsEmailAddresses',
        'containsTokens',
        'containsAccountIdentifiers',
      ].includes(key) && entry === false;
      const allowedStorage = key === 'credentialStorage' && entry === 'owner-only-vault';
      if (!allowedBoundary && !allowedStorage) {
        fail(`${label}.${key} must not contain sensitive account or credential data.`);
      }
    }
    assertSanitized(entry, `${label}.${key}`);
  }
}

function readEvidence(root, ref) {
  if (typeof ref !== 'string' || isAbsolute(ref) || ref.includes('..')
      || !ref.startsWith('docs/evidence/b11/') || !ref.endsWith('.json')) {
    fail('technicalAccess.evidenceRef must be a B11 JSON evidence path.');
  }
  const evidenceRoot = resolve(root, 'docs/evidence/b11');
  const fullPath = resolve(root, ref);
  const rel = relative(evidenceRoot, fullPath);
  if (rel.startsWith('..') || isAbsolute(rel)) fail('The review evidence path escapes B11 evidence.');
  const canonicalPath = realpathSync(fullPath);
  const canonicalRel = relative(realpathSync(evidenceRoot), canonicalPath);
  if (canonicalRel.startsWith('..') || isAbsolute(canonicalRel)) {
    fail('The review access evidence escapes B11 evidence through a link.');
  }
  let evidence;
  let descriptor;
  try {
    descriptor = openSync(canonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 2 || stat.size > 1024 * 1024) {
      fail('The review access evidence must be a non-empty regular file.');
    }
    evidence = JSON.parse(readFileSync(descriptor, 'utf8'));
  } catch {
    fail('The review access evidence must contain valid JSON.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return object(evidence, 'review evidence');
}

function assertSameCandidate(actual, expected, label) {
  for (const key of ['applicationId', 'bundleId', 'versionName', 'buildNumber', 'commit']) {
    if (actual?.[key] !== expected?.[key]) fail(`${label}.${key} must match the device candidate.`);
  }
}

function assertFalseBoundaries(boundaries, label, keys) {
  for (const key of keys) {
    if (boundaries[key] !== false) fail(`${label}.${key} must be false.`);
  }
}

export function validateStoreReviewAccess({
  root,
  reviewManifest,
  deviceManifest,
  submissionManifest,
  evidenceOverride = null,
  safetyEvidenceOverride = null,
  deletionEvidenceOverride = null,
  requireReady = false,
}) {
  const review = object(reviewManifest, 'store/review-access.json');
  const device = object(deviceManifest, 'store/device-validation.json');
  const submission = object(submissionManifest, 'store/submission.json');
  assertSanitized(review);
  if (review.schemaVersion !== 1 || !['testing', 'passed'].includes(review.state)) {
    fail('review access must use schemaVersion 1 and state testing or passed.');
  }
  if (typeof review.readyForStore !== 'boolean') fail('readyForStore must be boolean.');
  assertSameCandidate(review.candidate, device.candidate, 'candidate');
  const environment = object(review.environment, 'environment');
  if (environment.apiBaseUrl !== device.candidate?.apiBaseUrl
      || environment.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1'
      || environment.paymentMode !== device.candidate?.paymentMode
      || environment.paymentMode !== 'memory'
      || environment.stripeLivemode !== false
      || device.candidate?.stripeLivemode !== false) {
    fail('review access must remain on isolated, non-live Staging.');
  }
  if (!Array.isArray(review.roles) || review.roles.length !== 2
      || review.roles.map((entry) => entry.role).join(',') !== 'owner,renter') {
    fail('review access must contain exactly owner and renter roles.');
  }
  for (const role of review.roles) {
    if (role.credentialStorage !== 'owner-only-vault'
        || !['verified', 'pending-verification'].includes(role.status)) {
      fail('review roles must use a valid status and remain only in the owner-only vault.');
    }
  }
  const technical = object(review.technicalAccess, 'technicalAccess');
  if (!['testing', 'passed'].includes(technical.status)) {
    fail('technicalAccess.status must be testing or passed.');
  }
  const evidence = evidenceOverride ?? readEvidence(root, technical.evidenceRef);
  assertSanitized(evidence, 'review evidence');
  const testingEvidenceStatuses = new Set([
    'review-accounts-refresh-pending-email-verification',
    'review-fixture-refresh-pending',
    'review-candidate-built-play-upload-pending',
    'review-candidate-rollover-revalidation-pending',
    'review-candidate-rollover-store-propagation-pending',
  ]);
  const evidenceStatusValid = technical.status === 'passed'
    ? evidence.status === 'technical-review-access-passed-store-fields-pending'
    : testingEvidenceStatuses.has(evidence.status);
  if (evidence.schemaVersion !== 1
      || evidence.kind !== 'store-review-access-diagnostic'
      || !evidenceStatusValid
      || Number.isNaN(Date.parse(evidence.capturedAt))) {
    fail('review evidence must match the current technical access state.');
  }
  assertSameCandidate(evidence.candidate, device.candidate, 'review evidence.candidate');
  const refreshPending = evidence.status === 'review-fixture-refresh-pending';
  const rolloverPending =
    evidence.status === 'review-candidate-rollover-revalidation-pending';
  const storePropagationPending =
    evidence.status === 'review-candidate-rollover-store-propagation-pending';
  const prePlayPending =
    evidence.status === 'review-candidate-built-play-upload-pending';
  const expectedRoleStatus = technical.status === 'passed'
    || (refreshPending
      && evidence.checks?.ownerLoginPassed === true
      && evidence.checks?.renterLoginPassed === true)
    || (rolloverPending
      && evidence.checks?.privateVaultCreated === true
      && evidence.checks?.priorVerificationEvidenceAvailable === true)
    || (prePlayPending
      && evidence.checks?.privateVaultCreated === true
      && evidence.checks?.priorVerificationEvidenceAvailable === true)
    || (storePropagationPending
      && evidence.checks?.privateVaultCreated === true
      && evidence.checks?.priorVerificationEvidenceAvailable === true)
    ? 'verified'
    : 'pending-verification';
  for (const role of review.roles) {
    if (role.status !== expectedRoleStatus) {
      fail(`review roles must be ${expectedRoleStatus} for the recorded access state.`);
    }
  }
  if (technical.status === 'passed') {
    for (const key of requiredChecks) {
      if (evidence.checks?.[key] !== true) fail(`review evidence.checks.${key} must be true.`);
    }
  } else if (evidence.status === 'review-fixture-refresh-pending') {
    if (evidence.checks?.privateVaultCreated !== true
        || evidence.checks?.registrationsAccepted !== true
        || evidence.checks?.priorVerificationEvidenceAvailable !== true
        || evidence.checks?.ownerLoginPassed !== true
        || evidence.checks?.renterLoginPassed !== true
        || evidence.checks?.stagingHealthPassed !== true
        || evidence.checks?.listingGuardrailsPassed !== true
        || evidence.checks?.bookingQuotePassed !== true
        || evidence.checks?.bookingCreationPassed !== false
        || evidence.checks?.partialSyntheticListingPrepared !== true
        || evidence.checks?.partialSyntheticListingReusedWithoutNewUpload !== true
        || evidence.checks?.safeFailureCorrelationCaptured !== true
        || evidence.checks?.liveAccessPassed !== false
        || evidence.checks?.fixtureRefreshRequired !== true) {
      fail('fixture-refresh evidence must preserve only the bounded owner login and renter refresh blocker.');
    }
    if (evidence.latestBookingFailure?.error !== 'internal_error'
        || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(
          evidence.latestBookingFailure?.requestId ?? '',
        )
        || evidence.latestBookingFailure?.reusedExistingListing !== true
        || evidence.latestBookingFailure?.newUploadCreated !== false
        || evidence.latestBookingFailure?.newListingCreated !== false
        || evidence.latestBookingFailure?.paymentEndpointCalled !== false) {
      fail('fixture-refresh evidence must contain a safe, bounded failure correlation.');
    }
  } else if (prePlayPending) {
    if (evidence.checks?.privateVaultCreated !== true
        || evidence.checks?.priorVerificationEvidenceAvailable !== true
        || evidence.checks?.exactPlayCandidateInstalled !== false
        || evidence.checks?.playInstallerVerified !== false
        || evidence.checks?.completeTechnicalAccessPassed !== false
        || evidence.checks?.playInternalUploadRequired !== true
        || evidence.checks?.freshInstallRevalidationRequired !== true
        || evidence.checks?.secondRoleRevalidationRequired !== true
        || evidence.checks?.secondNetworkRevalidationRequired !== true) {
      fail('pre-Play candidate evidence must keep upload and exact review revalidation pending.');
    }
  } else if (rolloverPending) {
    if (evidence.checks?.privateVaultCreated !== true
        || evidence.checks?.priorVerificationEvidenceAvailable !== true
        || evidence.checks?.exactPlayCandidateInstalled !== true
        || evidence.checks?.playInstallerVerified !== true
        || evidence.checks?.authenticatedSessionRestorePassed !== true
        || evidence.checks?.stagingFeedPassed !== true
        || evidence.checks?.completeTechnicalAccessPassed !== false
        || evidence.checks?.freshInstallRevalidationRequired !== true
        || evidence.checks?.secondRoleRevalidationRequired !== true
        || evidence.checks?.secondNetworkRevalidationRequired !== true) {
      fail('candidate-rollover evidence must keep exact review revalidation pending.');
    }
  } else if (storePropagationPending) {
    if (evidence.checks?.privateVaultCreated !== true
        || evidence.checks?.priorVerificationEvidenceAvailable !== true
        || evidence.checks?.exactLocalCandidateInstalled !== true
        || evidence.checks?.twoAccountFlowTimePassed !== true
        || evidence.checks?.exactPlayCandidateInstalled !== false
        || evidence.checks?.playInstallerObservedOnSupersededBuild !== true
        || evidence.checks?.authenticatedSessionRestorePassedOnLocalCandidate !== true
        || evidence.checks?.stagingFeedPassedOnLocalCandidate !== true
        || evidence.checks?.completeTechnicalAccessPassed !== false
        || evidence.checks?.freshPlayInstallRevalidationRequired !== true
        || evidence.checks?.secondRoleRevalidationRequired !== true
        || evidence.checks?.secondNetworkRevalidationRequired !== true) {
      fail('store-propagation evidence must preserve the local candidate checks and keep the exact Play installation pending.');
    }
  } else if (evidence.checks?.privateVaultCreated !== true
      || evidence.checks?.registrationsAccepted !== true
      || evidence.checks?.emailVerificationPending !== true
      || evidence.checks?.liveAccessPassed !== false) {
    fail('testing review evidence must honestly record the pending verification boundary.');
  }
  if (evidence.environment?.apiBaseUrl !== environment.apiBaseUrl
      || evidence.environment?.paymentMode !== 'memory'
      || evidence.environment?.stripeLivemode !== false
      || evidence.environment?.paymentEndpointCalled !== false) {
    fail('review evidence environment must prove non-live Staging without payment calls.');
  }
  assertFalseBoundaries(object(evidence.boundaries, 'review evidence.boundaries'), 'review evidence.boundaries', [
    'containsSecrets',
    'containsEmailAddresses',
    'containsTokens',
    'containsAccountIdentifiers',
    'containsFixtureIdentifiers',
    'publicStoreChanged',
    'productionChanged',
  ]);
  if (evidence.boundaries.syntheticAccountsOnly !== true) {
    fail('review evidence must prove synthetic-only scope.');
  }
  if (refreshPending) {
    if (evidence.boundaries.productDataReadOnly !== false
        || evidence.boundaries.businessDataMutations !== true
        || evidence.boundaries.boundedSyntheticFixtureMutations !== true
        || evidence.boundaries.priorTerminalFixtureArchived !== true
        || evidence.boundaries.syntheticListingCreated !== true
        || evidence.boundaries.syntheticBookingCreated !== false) {
      fail('fixture-refresh evidence must disclose its bounded synthetic Staging mutations.');
    }
  } else if (evidence.boundaries.productDataReadOnly !== true
      || evidence.boundaries.businessDataMutations !== false) {
    fail('passed or verification-pending review evidence must prove read-only business data.');
  }
  if (technical.status === 'passed'
      && evidence.boundaries.authenticationSessionsCreated !== true) {
    fail('passed review evidence must disclose that authentication sessions were created.');
  }
  if (technical.status === 'testing') {
    const expectedRegistrationsCreated = refreshPending || rolloverPending || prePlayPending
      || storePropagationPending
      ? false
      : true;
    if (evidence.boundaries.syntheticAccountRegistrationsCreated !== expectedRegistrationsCreated) {
      fail('testing review evidence must disclose whether synthetic account registrations were created.');
    }
    if (refreshPending && evidence.boundaries.authenticationSessionsCreated !== true) {
      fail('fixture-refresh evidence must disclose the bounded owner authentication session.');
    }
    if (rolloverPending
        && (evidence.boundaries.authenticationSessionsCreated !== false
          || evidence.boundaries.authenticationSessionObserved !== true)) {
      fail('candidate-rollover evidence must distinguish an observed session from a newly created one.');
    }
    if (storePropagationPending
        && (evidence.boundaries.authenticationSessionsCreated !== false
          || evidence.boundaries.authenticationSessionObserved !== true)) {
      fail('store-propagation evidence must distinguish an observed local session from a newly created one.');
    }
    if (prePlayPending
        && (evidence.boundaries.authenticationSessionsCreated !== false
          || evidence.boundaries.authenticationSessionObserved !== false)) {
      fail('pre-Play candidate evidence must not claim a candidate authentication session.');
    }
  }
  const scenarios = object(review.reviewScenarios, 'reviewScenarios');
  if (Object.keys(scenarios).sort().join(',') !== requiredScenarios.slice().sort().join(',')) {
    fail('reviewScenarios must contain exactly the required checks.');
  }
  for (const key of requiredScenarios) {
    if (!['pending', 'passed'].includes(scenarios[key])) fail(`reviewScenarios.${key} is invalid.`);
  }
  const scenarioEvidence = object(review.scenarioEvidence, 'scenarioEvidence');
  if (Object.keys(scenarioEvidence).sort().join(',') !== 'accountDeletion,freshInstall,safetyActions') {
    fail('scenarioEvidence must contain exactly freshInstall, safetyActions, and accountDeletion.');
  }
  const freshInstall = object(scenarioEvidence.freshInstall, 'scenarioEvidence.freshInstall');
  const freshInstallShouldPass = scenarios.freshInstall === 'passed';
  if (freshInstall.status !== (freshInstallShouldPass ? 'passed' : 'pending')) {
    fail('freshInstall evidence status must match the review scenario.');
  }
  if (freshInstallShouldPass) {
    const freshInstallEvidence = readEvidence(root, freshInstall.evidenceRef);
    assertSanitized(freshInstallEvidence, 'fresh install evidence');
    if (freshInstallEvidence.schemaVersion !== 1
        || freshInstallEvidence.kind !== 'android-fresh-install-diagnostic'
        || freshInstallEvidence.status !== 'passed-play-install-fresh-app-data-and-session-restore'
        || freshInstallEvidence.scenario !== 'freshInstall'
        || Number.isNaN(Date.parse(freshInstallEvidence.capturedAt))) {
      fail('freshInstall evidence must prove a fresh Google Play app-data start.');
    }
    assertSameCandidate(freshInstallEvidence.candidate, device.candidate, 'fresh install evidence.candidate');
    if (freshInstallEvidence.installed?.delivery !== 'google-play-split'
        || freshInstallEvidence.installed?.installerPackageName !== 'com.android.vending'
        || freshInstallEvidence.installed?.packageIdentityVerifiedBeforeAndAfterReset !== true
        || freshInstallEvidence.checks?.isolatedAppDataResetConfirmed !== true
        || freshInstallEvidence.checks?.signedOutFirstStartConfirmed !== true
        || freshInstallEvidence.checks?.syntheticReviewLoginRestored !== true
        || freshInstallEvidence.checks?.authenticatedProfileConfirmed !== true
        || freshInstallEvidence.checks?.coldStartSessionRestoreConfirmed !== true) {
      fail('freshInstall evidence must prove the exact Play candidate and restored synthetic session.');
    }
    if (freshInstallEvidence.environment?.apiBaseUrl !== environment.apiBaseUrl
        || freshInstallEvidence.environment?.paymentMode !== 'memory'
        || freshInstallEvidence.environment?.stripeLivemode !== false
        || freshInstallEvidence.environment?.paymentEndpointCalled !== false) {
      fail('freshInstall evidence must remain on non-live Staging without payment calls.');
    }
    assertFalseBoundaries(
      object(freshInstallEvidence.boundaries, 'fresh install evidence.boundaries'),
      'fresh install evidence.boundaries',
      [
        'appPackageUninstalled',
        'playTrackChanged',
        'publicStoreChanged',
        'productionChanged',
        'containsSecrets',
        'containsEmailAddresses',
        'containsTokens',
        'containsAccountIdentifiers',
        'containsFixtureIdentifiers',
        'rawDeviceIdentifierPrinted',
        'lockCodeUsed',
      ],
    );
    if (freshInstallEvidence.boundaries.syntheticAccountsOnly !== true) {
      fail('freshInstall evidence must prove synthetic-only scope.');
    }
  } else if (freshInstall.evidenceRef !== null) {
    fail('Pending freshInstall must not reference passed evidence.');
  }
  const safety = object(scenarioEvidence.safetyActions, 'scenarioEvidence.safetyActions');
  const safetyShouldPass = scenarios.reportAndBlock === 'passed' && scenarios.accountExport === 'passed';
  if (scenarios.reportAndBlock !== scenarios.accountExport
      || safety.status !== (safetyShouldPass ? 'passed' : 'pending')) {
    fail('safetyActions status must match reportAndBlock and accountExport.');
  }
  if (safetyShouldPass) {
    const safetyEvidence = safetyEvidenceOverride ?? readEvidence(root, safety.evidenceRef);
    assertSanitized(safetyEvidence, 'safety evidence');
    if (safetyEvidence.schemaVersion !== 1
        || safetyEvidence.kind !== 'store-review-safety-actions-diagnostic'
        || safetyEvidence.status !== 'report-block-export-passed-deletion-pending'
        || Number.isNaN(Date.parse(safetyEvidence.capturedAt))
        || safetyEvidence.scenarios?.reportAndBlock !== 'passed'
        || safetyEvidence.scenarios?.accountExport !== 'passed'
        || safetyEvidence.scenarios?.accountDeletion !== 'pending') {
      fail('safety evidence must prove report, block cleanup, and account export.');
    }
    for (const key of requiredSafetyChecks) {
      if (safetyEvidence.checks?.[key] !== true) fail(`safety evidence.checks.${key} must be true.`);
    }
    if (safetyEvidence.environment?.apiBaseUrl !== environment.apiBaseUrl
        || safetyEvidence.environment?.paymentMode !== 'memory'
        || safetyEvidence.environment?.stripeLivemode !== false
        || safetyEvidence.environment?.paymentEndpointCalled !== false) {
      fail('safety evidence must remain on non-live Staging without payment calls.');
    }
    assertFalseBoundaries(object(safetyEvidence.boundaries, 'safety evidence.boundaries'), 'safety evidence.boundaries', [
      'lastingUserBlockCreated',
      'reviewerAccountDeleted',
      'containsSecrets',
      'containsEmailAddresses',
      'containsTokens',
      'containsAccountIdentifiers',
      'containsFixtureIdentifiers',
      'publicStoreChanged',
      'productionChanged',
    ]);
    if (safetyEvidence.boundaries.authenticationSessionsCreated !== true
        || safetyEvidence.boundaries.auditEventCreatedByExport !== true
        || safetyEvidence.boundaries.syntheticModerationRecordCreated !== true
        || safetyEvidence.boundaries.syntheticAccountsOnly !== true) {
      fail('safety evidence must disclose its bounded synthetic Staging mutations.');
    }
  } else if (safety.evidenceRef !== null) {
    fail('Pending safetyActions must not reference passed evidence.');
  }
  const deletion = object(scenarioEvidence.accountDeletion, 'scenarioEvidence.accountDeletion');
  const deletionShouldPass = scenarios.accountDeletion === 'passed';
  if (deletion.status !== (deletionShouldPass ? 'passed' : 'pending')) {
    fail('accountDeletion evidence status must match the review scenario.');
  }
  if (deletionShouldPass) {
    const deletionEvidence = deletionEvidenceOverride ?? readEvidence(root, deletion.evidenceRef);
    assertSanitized(deletionEvidence, 'deletion evidence');
    if (deletionEvidence.schemaVersion !== 1
        || deletionEvidence.kind !== 'store-review-disposable-deletion-diagnostic'
        || deletionEvidence.status !== 'passed-disposable-account-deletion'
        || Number.isNaN(Date.parse(deletionEvidence.capturedAt))
        || deletionEvidence.scenario !== 'accountDeletion'
        || deletionEvidence.checks?.deletionPreflightClear !== true
        || deletionEvidence.checks?.currentPasswordRequired !== true
        || deletionEvidence.checks?.accountDeletionAccepted !== true
        || deletionEvidence.checks?.deletedCredentialsRejected !== true
        || deletionEvidence.checks?.privateVaultCredentialsScrubbed !== true) {
      fail('deletion evidence must prove a disposable synthetic account deletion.');
    }
    if (deletionEvidence.environment?.apiBaseUrl !== environment.apiBaseUrl
        || deletionEvidence.environment?.paymentMode !== 'memory'
        || deletionEvidence.environment?.stripeLivemode !== false
        || deletionEvidence.environment?.paymentEndpointCalled !== false) {
      fail('deletion evidence must remain on non-live Staging without payment calls.');
    }
    assertFalseBoundaries(object(deletionEvidence.boundaries, 'deletion evidence.boundaries'), 'deletion evidence.boundaries', [
      'reviewerAccountsDeleted',
      'containsSecrets',
      'containsEmailAddresses',
      'containsTokens',
      'containsAccountIdentifiers',
      'containsFixtureIdentifiers',
      'publicStoreChanged',
      'productionChanged',
    ]);
    if (deletionEvidence.boundaries.disposableSyntheticAccountDeleted !== true
        || deletionEvidence.boundaries.syntheticAccountsOnly !== true) {
      fail('deletion evidence must disclose the disposable synthetic deletion boundary.');
    }
  } else if (deletion.evidenceRef !== null) {
    fail('Pending accountDeletion must not reference passed evidence.');
  }
  const protectedFields = object(review.protectedStoreFields, 'protectedStoreFields');
  if (!['pending', 'passed'].includes(protectedFields.googlePlay)
      || !['pending', 'passed'].includes(protectedFields.appStoreConnect)
      || protectedFields.credentialsEmbedded !== false) {
    fail('protectedStoreFields must remain credential-free and explicitly tracked.');
  }
  const storeGate = object(review.storeGate, 'storeGate');
  if (storeGate.field !== 'blockingGates.reviewAccounts'
      || storeGate.status !== submission.blockingGates?.reviewAccounts) {
    fail('review access store gate must match store/submission.json.');
  }
  assertFalseBoundaries(object(review.boundaries, 'boundaries'), 'boundaries', [
    'containsSecrets',
    'containsEmailAddresses',
    'containsTokens',
    'containsAccountIdentifiers',
    'publicStoreChanged',
    'productionChanged',
  ]);

  const fullyReady = review.state === 'passed'
    && review.readyForStore === true
    && technical.status === 'passed'
    && Object.values(scenarios).every((status) => status === 'passed')
    && protectedFields.googlePlay === 'passed'
    && protectedFields.appStoreConnect === 'passed'
    && storeGate.status === 'closed';
  if (requireReady && !fullyReady) fail('Store review access is not fully ready.');
  if (!requireReady && review.state === 'passed' && !fullyReady) {
    fail('A passed review access manifest must be fully ready.');
  }
  if (review.readyForStore !== fullyReady) fail('readyForStore must match the proven review readiness state.');
  return Object.freeze({
    state: review.state,
    readyForStore: review.readyForStore,
    technicalAccess: technical.status,
    passedScenarios: Object.values(scenarios).filter((status) => status === 'passed').length,
    totalScenarios: requiredScenarios.length,
    storeGate: storeGate.status,
    containsSecrets: false,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function cliOptions(argv) {
  const options = { requireReady: false };
  for (const argument of argv) {
    if (argument === '--require-ready') options.requireReady = true;
    else fail(`Unknown argument: ${argument}`);
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
    const result = validateStoreReviewAccess({
      root,
      reviewManifest: readJson(resolve(root, 'store/review-access.json')),
      deviceManifest: readJson(resolve(root, 'store/device-validation.json')),
      submissionManifest: readJson(resolve(root, 'store/submission.json')),
      ...cliOptions(process.argv.slice(2)),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
