#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidencePath = resolve(repositoryRoot, 'docs/evidence/release-readiness/wp106-authenticated-logout-two-device-closure-20260911.json');
const candidatePath = resolve(repositoryRoot, 'store/google-play/current-rollover-candidate.json');

function fail(message) { throw new Error(message); }
function same(actual, expected, label) { if (actual !== expected) fail(`${label} is not exact.`); }

export function validateWp106AuthenticatedLogoutTwoDeviceClosure(evidence, candidate) {
  const artifactSourceHead = '67c4e2ebe4ceead7529c4f02ca1209d71c66fe25';
  const versionCode = '2026091101';
  const apkSha256 = '6382cc593ce995abce93c51fc117ba649f9d8c2194a421875923686ed657a9c7';
  const aabSha256 = '9aab79539a54601ad309bde057d0f938dbf54aa30ff8353796574aad5dbd9a91';

  same(evidence?.schemaVersion, 1, 'schema version');
  same(evidence?.workPackage, 'WP106_AUTHENTICATED_LOGOUT_TWO_DEVICE_CLOSURE', 'work package');
  same(evidence?.status, 'pixel-complete-oneplus-exact-candidate-blocked-device-unavailable', 'closure status');
  same(evidence?.source?.artifactSourceHead, artifactSourceHead, 'artifact source head');
  same(evidence?.causeAndCorrection?.localSessionRemovalNowProviderIndependent, true, 'provider-independent local logout');
  same(evidence?.causeAndCorrection?.foregroundPushBoundaryClosesSynchronously, true, 'synchronous push boundary');
  same(evidence?.causeAndCorrection?.latePushRegistrationCannotReopenClosedGeneration, true, 'late push registration guard');
  same(evidence?.causeAndCorrection?.timingWorkaroundAdded, false, 'timing workaround boundary');
  same(evidence?.candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  same(evidence?.candidate?.versionCode, versionCode, 'version code');
  same(evidence?.candidate?.apiBaseUrl, 'https://staging.shareittoo.com/api/v1', 'Staging API');
  same(evidence?.candidate?.paymentTransport, 'memory', 'payment transport');
  same(evidence?.candidate?.stripeLivemode, false, 'Stripe live mode');
  same(evidence?.candidate?.externalListingAiEnabled, false, 'external Listing AI boundary');
  same(evidence?.artifacts?.apkSha256, apkSha256, 'APK hash');
  same(evidence?.artifacts?.aabSha256, aabSha256, 'AAB hash');
  same(evidence?.artifacts?.signatureVerified, true, 'artifact signature');
  same(evidence?.artifacts?.binaryPrivacyScan, 'passed', 'binary privacy scan');
  same(evidence?.verification?.fullLocalTechnicalRegression, 'passed-isolated-scoped-android-profile', 'local regression');
  same(evidence?.verification?.githubRegression?.head, artifactSourceHead, 'GitHub Regression head');
  same(evidence?.verification?.githubRegression?.conclusion, 'success', 'GitHub Regression conclusion');
  same(evidence?.verification?.githubRegression?.cleanCheckoutJob, 'success', 'clean checkout');
  same(evidence?.verification?.githubCodeql?.head, artifactSourceHead, 'CodeQL head');
  same(evidence?.verification?.githubCodeql?.conclusion, 'success', 'CodeQL conclusion');
  same(evidence?.verification?.openCodeScanningAlertsCurrentBranch, 0, 'code-scanning alerts');
  same(evidence?.pixel?.journeyStatus, 'passed-pixel-email-verified-two-role-product-journey', 'Pixel journey');
  for (const key of [
    'distinctVerifiedPrincipals',
    'ownerPublishUiAndServerConfirmation',
    'renterPublicDiscovery',
    'nonBindingRequestAcceptance',
    'renterChatVisible',
    'fcmForegroundBackgroundTerminated',
    'principalSwitchIsolation',
    'cleanupBookingCancelledListingEnded',
    'protectedOwnerSessionRestored'
  ]) same(evidence?.pixel?.[key], true, `Pixel ${key}`);
  same(evidence?.stagingReadbackAfterJourney?.coreOwnerRenterJourneyOperational, true, 'Staging core journey');
  same(evidence?.stagingReadbackAfterJourney?.readinessHttpStatus, 503, 'Staging readiness HTTP status');
  same(evidence?.stagingReadbackAfterJourney?.readinessClassification, 'degraded-overdue-support-followups', 'Staging readiness classification');
  same(evidence?.stagingReadbackAfterJourney?.readinessClaimedHealthy, false, 'Staging readiness truth');
  same(evidence?.onePlus?.candidateTransfer, 'passed-byte-exact-tailnet-private', 'OnePlus candidate transfer');
  same(evidence?.onePlus?.candidatePackageVersionPrivacyAndSignature, 'passed', 'OnePlus candidate verification');
  same(evidence?.onePlus?.adbAuthorizedPhysicalDeviceCountAtFinalPreflight, 0, 'OnePlus ADB count');
  same(evidence?.onePlus?.installationPerformed, false, 'OnePlus installation truth');
  same(evidence?.onePlus?.journeyPerformed, false, 'OnePlus journey truth');
  same(evidence?.onePlus?.blocker, 'ADB_DEVICE_UNAVAILABLE', 'OnePlus blocker');
  same(evidence?.cleanup?.publicStagingListingCountAfterPixelJourney, 0, 'Staging cleanup');
  same(evidence?.cleanup?.testListingLeftActive, false, 'listing cleanup truth');
  same(evidence?.cleanup?.testBookingLeftActive, false, 'booking cleanup truth');
  same(evidence?.cleanup?.macMiniPrivateTransferEndpointStopped, true, 'temporary endpoint cleanup');
  same(evidence?.cleanup?.macBookPrivateTransferCopyRemoved, true, 'MacBook transfer cleanup');
  for (const [key, expected] of Object.entries({
    contractCreated: false,
    reservationCreated: false,
    paymentEndpointCalled: false,
    realMoneyUsed: false,
    googlePlayChanged: false,
    productionChanged: false,
    firebaseProjectChanged: false,
    cloudVpsDnsChanged: false,
    publicRegistrationChanged: false,
    pullRequestMerged: false,
    containsSecrets: false,
    containsAccountIdentity: false,
    containsRawDeviceIdentifiers: false,
    containsPrivateFilesystemPath: false
  })) same(evidence?.boundaries?.[key], expected, `boundary ${key}`);

  same(candidate?.candidate?.artifactSourceHead, artifactSourceHead, 'candidate pointer source head');
  same(candidate?.candidate?.versionCode, versionCode, 'candidate pointer version');
  same(candidate?.artifact?.apkSha256, apkSha256, 'candidate pointer APK hash');
  same(candidate?.artifact?.aabSha256, aabSha256, 'candidate pointer AAB hash');
  same(candidate?.deviceVerification?.authenticatedPilotMatrix, 'passed-pixel-email-verified-two-role-product-journey', 'candidate pointer Pixel journey');
  same(candidate?.deviceVerification?.secondaryDevice, 'pending-oneplus-adb-device-unavailable-after-artifact-verification', 'candidate pointer OnePlus truth');
  same(candidate?.providerAndLiveHolds?.realPaymentsEnabled, false, 'candidate pointer real-payment hold');
  same(candidate?.providerAndLiveHolds?.productionChanged, false, 'candidate pointer production hold');

  return Object.freeze({
    status: 'passed-wp106-pixel-closure-and-explicit-oneplus-blocker-evidence',
    artifactSourceHead,
    versionCode,
    containsPrivateState: false
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
    process.stdout.write(`${JSON.stringify(validateWp106AuthenticatedLogoutTwoDeviceClosure(evidence, candidate))}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP106 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
