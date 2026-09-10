#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const evidencePath = resolve(repositoryRoot, 'docs/evidence/release-readiness/wp104-current-candidate-staging-pixel-closure-20260910.json');

function fail(message) { throw new Error(message); }
function same(actual, expected, label) { if (actual !== expected) fail(`${label} is not exact.`); }

export function validateWp104CurrentCandidateStagingPixelClosure(evidence) {
  same(evidence?.schemaVersion, 1, 'schema version');
  same(evidence?.workPackage, 'WP104_CURRENT_CANDIDATE_STAGING_PIXEL_CLOSURE', 'work package');
  same(evidence?.status, 'passed-exact-staging-runtime-pixel-two-role-push-cleanup', 'closure status');
  const evidenceHead = '8916aa17fcb2f98d78a49314902a6fd0fcd0e75b';
  const candidateHead = 'fdcfd1dc782c9f9dd3cb766d566abf7363a76cc5';
  same(evidence?.source?.evidenceBaseHead, evidenceHead, 'evidence base head');
  same(evidence?.source?.candidateArtifactSourceHead, candidateHead, 'candidate source head');
  same(evidence?.source?.candidateSourceIsAncestor, true, 'candidate ancestry');
  same(evidence?.source?.mobileRuntimeDriftAfterCandidate, false, 'mobile runtime drift');
  same(evidence?.candidate?.versionCode, '2026091002', 'candidate version code');
  same(evidence?.candidate?.apkSha256, 'd0ac7a80232536a4c2f5e1d659b8b9ba4f973581f816142dc6419931742c3637', 'candidate APK hash');
  same(evidence?.candidate?.exactInstalledApkVerified, true, 'installed APK verification');
  same(evidence?.candidate?.dataPreservingUpdate, true, 'data-preserving update');
  same(evidence?.localVerification?.focusedEvidenceGuard, 'passed-3-tests', 'focused guard');
  same(evidence?.localVerification?.fullTechnicalRegression, 'passed-candidate-rollover-profile', 'local regression');
  same(evidence?.localVerification?.flutterAnalyzer, 'passed-zero-diagnostics', 'Flutter analyzer');
  same(evidence?.localVerification?.webWasmLoopbackAndroid, 'passed', 'platform regression');
  same(evidence?.localVerification?.temporaryWorkaroundIntroduced, false, 'workaround boundary');
  same(evidence?.github?.regression?.runId, 34517352749, 'GitHub Regression run');
  same(evidence?.github?.regression?.head, evidenceHead, 'GitHub Regression head');
  same(evidence?.github?.regression?.conclusion, 'success', 'GitHub Regression conclusion');
  same(evidence?.github?.regression?.cleanCheckoutReproducibility, 'success', 'clean checkout');
  same(evidence?.github?.regression?.publishApiImage, 'success', 'API image publication');
  same(evidence?.github?.codeql?.runId, 34508316570, 'CodeQL run');
  same(evidence?.github?.codeql?.head, evidenceHead, 'CodeQL head');
  same(evidence?.github?.codeql?.conclusion, 'success', 'CodeQL conclusion');
  same(evidence?.github?.codeScanning?.prHeadOpenAlerts, 0, 'PR-head alerts');
  same(evidence?.github?.codeScanning?.prMergeOpenAlerts, 0, 'PR-merge alerts');
  same(evidence?.github?.pullRequest?.draft, true, 'PR draft state');
  same(evidence?.github?.pullRequest?.merged, false, 'PR merge state');
  same(evidence?.staging?.runtimeHead, evidenceHead, 'Staging runtime head');
  same(evidence?.staging?.apiHealthy, true, 'Staging API health');
  same(evidence?.staging?.databaseHealthy, true, 'Staging database health');
  same(evidence?.staging?.foreignKeyIntegrity, 'passed-361-constraints', 'foreign keys');
  same(evidence?.staging?.activePersistentComposeFileCount, 5, 'persistent Compose count');
  same(evidence?.staging?.checkoutPermissions?.groupOrOtherWritableEntriesAfterRemediation, 0, 'checkout writable entry count');
  same(evidence?.staging?.transports?.push, 'fcm', 'push transport');
  same(evidence?.staging?.transports?.mail, 'smtp', 'mail transport');
  same(evidence?.staging?.transports?.payment, 'memory', 'payment transport');
  same(evidence?.staging?.transports?.stripeLivemode, false, 'Stripe live mode');
  same(evidence?.staging?.transports?.listingAiProvider, 'mock', 'Listing-AI provider');
  same(evidence?.staging?.transports?.listingAiBudgetCents, 0, 'Listing-AI budget');
  same(evidence?.staging?.transports?.listingAiExternalExecutionApproved, false, 'Listing-AI external approval');
  same(evidence?.pixel?.coldStarts?.passed, 3, 'Pixel cold starts');
  same(evidence?.pixel?.mainNavigation?.status, 'passed', 'Pixel navigation');
  same(evidence?.pixel?.accountPrivacySupport?.status, 'passed-read-only', 'account surfaces');
  same(evidence?.pixel?.legalRoutes?.professionalApprovalGranted, false, 'legal approval gate');
  same(evidence?.pixel?.largeText?.originalSettingRestored, true, 'large-text restoration');
  same(evidence?.pixel?.appearance?.originalSettingsRestored, true, 'appearance restoration');
  same(evidence?.pixel?.twoRoleJourney?.status, 'passed-pixel-email-verified-two-role-product-journey', 'two-role journey');
  same(evidence?.pixel?.twoRoleJourney?.principalSwitchIsolation, true, 'principal isolation');
  same(evidence?.pixel?.twoRoleJourney?.ownerSessionRestored, true, 'owner session restoration');
  same(evidence?.pixel?.fcm?.foreground, 'passed', 'foreground FCM');
  same(evidence?.pixel?.fcm?.background, 'passed', 'background FCM');
  same(evidence?.pixel?.fcm?.terminatedProcess, 'passed', 'terminated-process FCM');
  same(evidence?.pixel?.fcm?.privateCaptureCommitted, false, 'private FCM capture boundary');
  same(evidence?.pixel?.cleanup?.testBookingCancelled, true, 'booking cleanup');
  same(evidence?.pixel?.cleanup?.testListingEnded, true, 'listing cleanup');
  same(evidence?.pixel?.cleanup?.publicCatalogListingCount, 0, 'public catalog cleanup');
  same(evidence?.pixel?.cleanup?.contractCreated, false, 'contract boundary');
  same(evidence?.pixel?.cleanup?.reservationCreated, false, 'reservation boundary');
  same(evidence?.pixel?.cleanup?.paymentEndpointCalled, false, 'payment boundary');
  same(evidence?.pixel?.cleanup?.monetaryEffectMinor, 0, 'monetary effect');
  same(evidence?.legalHold?.bindingProbeStatus, 409, 'legal hold status');
  same(evidence?.legalHold?.bindingProbeError, 'v52_contract_documents_unavailable', 'legal hold code');
  same(evidence?.legalHold?.professionalDocumentApprovalStillRequired, true, 'legal gate');
  same(evidence?.remaining?.onePlusExactCandidateTest, 'not-verified', 'OnePlus truth');
  same(evidence?.remaining?.googlePlaySplitDeliveryForThisCandidate, 'not-run', 'Play truth');
  for (const [key, expected] of Object.entries({
    productionChanged: false,
    googlePlayChanged: false,
    testerListChanged: false,
    onePlusContactedByVerifiedRun: false,
    publicRegistrationChanged: false,
    firebaseConsoleChanged: false,
    paymentProviderChanged: false,
    realMoneyUsed: false,
    listingAiExternalCallMade: false,
    pullRequestMerged: false,
    containsSecrets: false,
    containsAccountIdentity: false,
    containsTokens: false,
    containsRawDeviceIdentifiers: false,
    containsPrivateFilesystemPaths: false
  })) same(evidence?.boundaries?.[key], expected, `boundary ${key}`);
  return Object.freeze({
    status: 'passed-wp104-current-candidate-staging-pixel-closure-evidence',
    evidenceHead,
    candidateHead,
    containsPrivateState: false
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    process.stdout.write(`${JSON.stringify(validateWp104CurrentCandidateStagingPixelClosure(evidence))}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP104 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
