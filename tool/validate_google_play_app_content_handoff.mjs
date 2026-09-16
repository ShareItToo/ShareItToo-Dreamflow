#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(keys) !== JSON.stringify(wanted)) {
    fail(`${label} must contain exactly the approved keys.`);
  }
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function validateGooglePlayAppContentHandoff({
  repositoryRoot,
  handoffPath = resolve(repositoryRoot, 'store/google-play/app-content-handoff.json'),
  allowCandidateRollover = false,
}) {
  const handoff = object(JSON.parse(readFileSync(handoffPath, 'utf8')), 'handoff');
  const deviceValidation = object(
    JSON.parse(readFileSync(resolve(repositoryRoot, 'store/device-validation.json'), 'utf8')),
    'device validation',
  );
  const currentCandidate = object(deviceValidation.candidate, 'device validation candidate');
  if (handoff.schemaVersion !== 1 ||
      handoff.status !== 'eleven-of-twelve-saved-one-open' ||
      handoff.submissionAllowed !== false) {
    fail('App-content handoff must remain prepared and fail-closed.');
  }
  const encoded = JSON.stringify(handoff);
  if (encoded.includes('@') || handoff.containsSecrets !== false ||
      handoff.containsAccountAddresses !== false ||
      handoff.containsReviewCredentials !== false) {
    fail('App-content handoff must remain sanitized.');
  }

  const candidate = object(handoff.candidate, 'candidate');
  const candidateBuildNumber = String(candidate.buildNumber ?? '');
  const currentBuildNumber = String(currentCandidate.buildNumber ?? '');
  const buildNumbersValid = /^\d+$/.test(candidateBuildNumber) &&
    /^\d+$/.test(currentBuildNumber);
  const candidateBuild = buildNumbersValid ? BigInt(candidateBuildNumber) : 0n;
  const currentBuild = buildNumbersValid ? BigInt(currentBuildNumber) : 0n;
  const buildBindingValid = allowCandidateRollover
    ? candidateBuild > 0n && candidateBuild <= currentBuild
    : candidate.buildNumber === currentCandidate.buildNumber;
  if (candidate.applicationId !== 'com.shareittoo.app' ||
      candidate.versionName !== currentCandidate.versionName ||
      !buildBindingValid ||
      candidate.releaseChannel !== 'internal' ||
      candidate.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1') {
    fail('App-content handoff is not bound to the internal Staging candidate.');
  }

  const tasks = object(handoff.tasks, 'tasks');
  const taskNames = [
    'privacyPolicy', 'appAccess', 'ads', 'contentRating', 'targetAudience',
    'dataSafety', 'advertisingId', 'governmentApps', 'financialFeatures', 'health',
    'categoryAndContact', 'storeListing',
  ];
  exactKeys(tasks, taskNames, 'tasks');
  if (tasks.privacyPolicy.status !== 'saved-approved-public-route' ||
      tasks.privacyPolicy.proposedUrl !== 'https://shareittoo.com/privacy' ||
      tasks.privacyPolicy.savedUrl !== 'https://shareittoo.com/privacy' ||
      tasks.privacyPolicy.evidenceRef !==
        'docs/evidence/b11/google-play-privacy-policy-saved-20260815.json' ||
      tasks.appAccess.status !== 'saved-protected-console-entry' ||
      tasks.appAccess.loginRequired !== true ||
      tasks.appAccess.credentialsInRepository !== false ||
      tasks.ads.status !== 'saved-current-build-no-ads' ||
      tasks.ads.proposedAnswer !== false ||
      tasks.contentRating.status !==
        'saved-iarc-completed-usk-12-plus' ||
      tasks.contentRating.category !== 'all-other-app-types' ||
      tasks.contentRating.userGeneratedContent !== true ||
      tasks.contentRating.directUserCommunication !== true ||
      tasks.contentRating.preciseDeviceLocationSharedByUser !== true ||
      tasks.contentRating.protectedContactAddressEntered !== true ||
      tasks.contentRating.iarcTermsAccepted !== true ||
      tasks.contentRating.questionnaireSubmitted !== true ||
      tasks.contentRating.germanyRating !== 'usk-12-plus' ||
      tasks.contentRating.sentForReview !== false ||
      tasks.contentRating.evidenceRef !==
        'docs/evidence/b11/google-play-iarc-content-rating-completion-20260813.json' ||
      tasks.targetAudience.status !== 'saved-eighteen-and-over' ||
      tasks.targetAudience.minimumAge !== 18 ||
      tasks.targetAudience.designedForChildren !== false ||
      tasks.dataSafety.collectsOrTransmitsUserData !== true ||
      tasks.dataSafety.status !==
        'all-data-type-answers-prepared-console-save-blocked' ||
      tasks.dataSafety.accountCreationMethod !== 'username-and-password' ||
      tasks.dataSafety.oauthPreparedButUnavailable !== true ||
      tasks.dataSafety.deleteAccountUrlSaved !== false ||
      tasks.dataSafety.preparedDeleteAccountUrl !==
        'https://shareittoo.com/account-deletion' ||
      tasks.dataSafety.preparedPartialDataDeletionAnswer !== false ||
      tasks.dataSafety.dataTypesPrepared !== 17 ||
      tasks.dataSafety.dataTypesEvidenceRef !==
        'docs/evidence/b11/google-play-data-safety-datatypes-20260812.json' ||
      tasks.dataSafety.answerMatrixEvidenceRef !==
        'docs/evidence/b11/google-play-data-safety-answer-matrix-2026081505-20260815.json' ||
      tasks.dataSafety.providerClassificationEvidenceRef !==
        'docs/evidence/b11/google-play-service-provider-sharing-classification-2026081505-20260815.json' ||
      tasks.dataSafety.currentCandidateBindingEvidenceRef !==
        'docs/evidence/b11/google-play-data-safety-current-candidate-binding-2026081509-20260815.json' ||
      tasks.dataSafety.stepTwoEvidenceRef !==
        'docs/evidence/b11/google-play-data-safety-step2-20260812.json' ||
      tasks.dataSafety.sellsData !== false ||
      tasks.dataSafety.advertisingTracking !== false ||
      tasks.advertisingId.status !==
        'saved-current-build-no-advertising-id' ||
      tasks.advertisingId.proposedAnswer !== false ||
      tasks.advertisingId.evidenceRef !==
        'docs/evidence/b11/google-play-advertising-id-declaration-20260812.json' ||
      tasks.governmentApps.status !== 'saved-not-government-app' ||
      tasks.governmentApps.proposedAnswer !== false ||
      tasks.financialFeatures.status !== 'saved-no-financial-features' ||
      tasks.financialFeatures.proposedAnswer !== 'no-financial-features' ||
      tasks.financialFeatures.physicalGoodsRental !== true ||
      tasks.financialFeatures.digitalGoodsBilling !== false ||
      tasks.health.status !== 'saved-no-health-features' ||
      tasks.health.proposedAnswer !== false ||
      tasks.categoryAndContact.status !== 'saved-shopping-and-public-contact' ||
      tasks.categoryAndContact.category !== 'Shopping' ||
      tasks.storeListing.copyAndGraphicsPrepared !== true ||
      tasks.storeListing.phoneScreenshotsValidated !== true ||
      tasks.storeListing.validatedPhoneScreenshotCount !== 4 ||
      tasks.storeListing.recommendedPhoneScreenshotTarget !== 4 ||
      tasks.storeListing.uploadedToPlayConsole !== true ||
      tasks.storeListing.status !==
        'saved-in-console-exact-candidate-copy-and-assets' ||
      tasks.storeListing.screenshotReadinessRef !==
        'docs/evidence/b11/google-play-feed-screenshot-readiness-2026081505-20260815.json' ||
      tasks.storeListing.consoleSaveEvidenceRef !==
        'docs/evidence/b11/google-play-store-listing-saved-2026081505-20260815.json') {
    fail('One or more prepared Play answers no longer match the bounded product truth.');
  }

  const privacyEvidence = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, tasks.privacyPolicy.evidenceRef), 'utf8')), 'privacy policy evidence');
  if (privacyEvidence.kind !== 'google-play-privacy-policy-saved' ||
      privacyEvidence.status !== 'saved-awaiting-review-with-other-changes' ||
      privacyEvidence.publicPage?.url !== tasks.privacyPolicy.savedUrl ||
      privacyEvidence.publicPage?.httpStatus !== 200 ||
      privacyEvidence.publicPage?.complianceStatus !== 'approved' ||
      privacyEvidence.googlePlayConsole?.changeSavedConfirmationObserved !== true ||
      privacyEvidence.googlePlayConsole?.publishingOverviewChangeObserved !== true ||
      privacyEvidence.googlePlayConsole?.sentForReview !== false ||
      privacyEvidence.boundaries?.dataSafetyDeclarationChanged !== false ||
      privacyEvidence.boundaries?.openLegalDecisionsChanged !== false ||
      privacyEvidence.boundaries?.productionChanged !== false) {
    fail('Saved Play privacy-policy evidence is invalid or unsafe.');
  }

  const listingEvidence = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, tasks.storeListing.consoleSaveEvidenceRef), 'utf8')), 'store listing evidence');
  if (listingEvidence.kind !== 'google-play-store-listing-saved' ||
      listingEvidence.status !== 'exact-candidate-screenshots-draft-saved' ||
      listingEvidence.candidate?.buildNumber !== candidate.buildNumber ||
      listingEvidence.observedConsoleState?.phoneScreenshotCount !== 4 ||
      listingEvidence.observedConsoleState?.draftSavedConfirmationObserved !== true ||
      listingEvidence.observedConsoleState?.sentForReview !== false ||
      listingEvidence.boundaries?.listingDraftChanged !== true ||
      listingEvidence.boundaries?.assetsUploaded !== true ||
      listingEvidence.boundaries?.productionChanged !== false) {
    fail('Exact-candidate Store screenshot evidence is invalid or unsafe.');
  }

  const currentBinding = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, tasks.dataSafety.currentCandidateBindingEvidenceRef), 'utf8')),
  'current Data Safety candidate binding');
  const privacyDisclosures = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, currentBinding.currentSources?.privacyDisclosuresRef ?? ''), 'utf8')),
  'current privacy disclosures');
  const baselineMatrix = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, currentBinding.baseline?.answerMatrixRef ?? ''), 'utf8')),
  'baseline Data Safety matrix');
  const baselineProvider = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, currentBinding.baseline?.providerClassificationRef ?? ''), 'utf8')),
  'baseline provider classification');
  const currentBinaryPrivacy = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, currentBinding.currentSources?.binaryPrivacyEvidenceRef ?? ''), 'utf8')),
  'current binary privacy evidence');
  const providerActivation = object(JSON.parse(readFileSync(resolve(
    repositoryRoot, currentBinding.review?.providerActivationEvidenceRef ?? ''), 'utf8')),
  'Firebase Google provider activation evidence');
  const playSigningCoverage = object(JSON.parse(readFileSync(resolve(
    repositoryRoot,
    providerActivation.localConfigurations?.android?.playSigningCoverageEvidenceRef ?? '',
  ), 'utf8')), 'Firebase Play signing coverage evidence');
  const currentProjection = privacyDisclosures.dataTypes.map((entry) => ({
    id: entry.id,
    google: entry.google,
    selected: entry.collected,
    collected: entry.collected,
    required: !entry.optional,
    purposes: entry.collected ? entry.purposes : [],
  }));
  const baselineProjection = baselineMatrix.dataTypes.map((entry) => ({
    id: entry.id,
    google: entry.google,
    selected: entry.selected,
    collected: entry.collected,
    required: entry.required,
    purposes: entry.collected ? entry.purposes : [],
  }));
  const projectionHash = sha256Json(currentProjection);
  if (currentBinding.kind !== 'google-play-data-safety-current-candidate-binding' ||
      currentBinding.status !==
        'current-candidate-technically-bound-console-save-and-approval-open' ||
      currentBinding.candidate?.applicationId !== currentCandidate.applicationId ||
      currentBinding.candidate?.versionName !== currentCandidate.versionName ||
      currentBinding.candidate?.buildNumber !== currentCandidate.buildNumber ||
      currentBinding.candidate?.commit !== currentCandidate.commit ||
      currentBinding.baseline?.buildNumber !== candidate.buildNumber ||
      currentBinding.baseline?.answerMatrixRef !==
        tasks.dataSafety.answerMatrixEvidenceRef ||
      currentBinding.baseline?.providerClassificationRef !==
        tasks.dataSafety.providerClassificationEvidenceRef ||
      baselineMatrix.candidate?.buildNumber !== candidate.buildNumber ||
      baselineProvider.candidate?.buildNumber !== candidate.buildNumber ||
      privacyDisclosures.candidate?.buildNumber !== currentCandidate.buildNumber ||
      privacyDisclosures.candidate?.commit !== currentCandidate.commit ||
      currentBinding.currentSources?.binaryPrivacyEvidenceRef !==
        'docs/evidence/b11/android-binary-privacy-release-check-2026081509.json' ||
      currentBinaryPrivacy.kind !== 'release-check' ||
      currentBinaryPrivacy.status !== 'passed' ||
      currentBinaryPrivacy.candidate?.buildNumber !== currentCandidate.buildNumber ||
      currentBinaryPrivacy.candidate?.commit !== currentCandidate.commit ||
      currentBinaryPrivacy.releaseCheck?.id !== 'binaryPrivacyAndNetwork' ||
      currentBinaryPrivacy.releaseCheck?.status !== 'passed' ||
      currentBinding.currentSources?.selectedDataTypeProjectionSha256 !== projectionHash ||
      currentBinding.currentSources?.selectedDataTypeCount !==
        currentProjection.filter((entry) => entry.selected).length ||
      currentBinding.currentSources?.declaredDataTypeCount !== currentProjection.length ||
      JSON.stringify(currentProjection) !== JSON.stringify(baselineProjection) ||
      currentBinding.review?.baselineAnswerProjectionMatchesCurrent !== true ||
      currentBinding.review?.authenticationAndCommunicationChangesReviewed !== true ||
      currentBinding.review?.socialProviderCodeCompiledButReleaseGated !== true ||
      currentBinding.review?.googleProviderConfiguredInFirebase !== true ||
      currentBinding.review?.appleProviderConfiguredInFirebase !== false ||
      currentBinding.review?.facebookProviderConfiguredInFirebase !== false ||
      currentBinding.review?.candidateSocialLoginReleaseGatesEnabled !== false ||
      currentBinding.review?.stagingBackendSocialEndpointEnabled !== true ||
      currentBinding.review?.stagingBackendInvalidTokenRejected !== true ||
      currentBinding.review?.providerActivationEvidenceRef !==
        'docs/evidence/b11/firebase-google-signin-provider-20260815.json' ||
      providerActivation.kind !== 'firebase-google-signin-provider-configuration' ||
      providerActivation.status !==
        'google-provider-enabled-configs-refreshed-release-gates-closed' ||
      providerActivation.firebase?.projectId !== 'shareittoo-staging' ||
      providerActivation.firebase?.providerId !== 'google.com' ||
      providerActivation.firebase?.providerEnabled !== true ||
      providerActivation.firebase?.appleProviderEnabled !== false ||
      providerActivation.firebase?.facebookProviderEnabled !== false ||
      providerActivation.localConfigurations?.crossPlatformValidation !==
        'passed-google-oauth-upload-and-play-signing-covered' ||
      providerActivation.localConfigurations?.android?.oauthClientCount !== 3 ||
      providerActivation.localConfigurations?.android?.certificateBoundClientCount !== 2 ||
      providerActivation.localConfigurations?.android?.distinctCertificateHashCount !== 2 ||
      providerActivation.localConfigurations?.android?.uploadSigningSha1ClientPresent !== true ||
      providerActivation.localConfigurations?.android?.playAppSigningSha1ClientPresent !== true ||
      providerActivation.localConfigurations?.android?.webClientCount !== 1 ||
      providerActivation.localConfigurations?.android?.playSigningCoverageEvidenceRef !==
        'docs/evidence/b11/firebase-phone-play-signing-allowlist-20260814.json' ||
      playSigningCoverage.kind !== 'firebase-phone-play-signing-allowlist' ||
      playSigningCoverage.firebase?.uploadSigningSha1Registered !== true ||
      playSigningCoverage.firebase?.playAppSigningSha1Registered !== true ||
      playSigningCoverage.googleCloudApiKey?.uploadSigningSha1Allowed !== true ||
      playSigningCoverage.googleCloudApiKey?.playAppSigningSha1Allowed !== true ||
      playSigningCoverage.boundaries?.containsSecrets !== false ||
      providerActivation.localConfigurations?.ios?.googleSignInEnabled !== true ||
      providerActivation.localConfigurations?.ios?.analyticsEnabled !== false ||
      providerActivation.localConfigurations?.ios?.advertisingEnabled !== false ||
      providerActivation.stagingBackendProbe?.syntheticInvalidTokenHttpStatus !== 401 ||
      providerActivation.stagingBackendProbe?.syntheticInvalidTokenErrorCode !==
        'invalid_social_token' ||
      providerActivation.candidate?.buildNumber !== currentCandidate.buildNumber ||
      providerActivation.candidate?.commit !== currentCandidate.commit ||
      providerActivation.candidate?.googleLoginReleaseGateEnabled !== false ||
      providerActivation.candidate?.appleLoginReleaseGateEnabled !== false ||
      providerActivation.candidate?.facebookLoginReleaseGateEnabled !== false ||
      providerActivation.boundaries?.newAppCandidateBuilt !== false ||
      providerActivation.boundaries?.currentPlayCandidateChanged !== false ||
      providerActivation.boundaries?.productionChanged !== false ||
      providerActivation.boundaries?.containsSecrets !== false ||
      providerActivation.boundaries?.containsClientIds !== false ||
      providerActivation.boundaries?.containsEmailAddresses !== false ||
      providerActivation.boundaries?.containsAccountIdentifiers !== false ||
      currentBinding.review?.newActiveIndependentControllerTransferProven !== false ||
      currentBinding.review?.mapsTransferActivated !== false ||
      currentBinding.review?.stripeEnabled !== false ||
      currentBinding.review?.openAiHelpersEnabled !== false ||
      currentBinding.review?.advertisingEnabled !== false ||
      currentBinding.review?.trackingEnabled !== false ||
      currentBinding.review?.consoleAnswersMayBeCopiedWithoutOwnerApproval !== false ||
      JSON.stringify(currentBinding.openDecisions) !== JSON.stringify([
        'current-provider-contract-acceptance',
        'owner-provider-role-confirmation',
        'legal-approval',
        'retention-and-deletion-schedule',
        'google-maps-activation-and-sharing-reclassification',
        'console-draft-save',
      ]) ||
      currentBinding.boundaries?.technicalBindingOnly !== true ||
      currentBinding.boundaries?.legalAdviceProvided !== false ||
      currentBinding.boundaries?.providerContractAcceptedByAgent !== false ||
      currentBinding.boundaries?.consoleAnswersChanged !== false ||
      currentBinding.boundaries?.draftSaved !== false ||
      currentBinding.boundaries?.formSubmitted !== false ||
      currentBinding.boundaries?.productionChanged !== false ||
      currentBinding.boundaries?.containsSecrets !== false ||
      currentBinding.boundaries?.containsEmailAddresses !== false ||
      currentBinding.boundaries?.containsAccountIdentifiers !== false) {
    fail('Current Data Safety candidate binding is stale, incomplete, or unsafe.');
  }

  const hardStops = object(handoff.hardStops, 'hardStops');
  for (const [key, value] of Object.entries(hardStops)) {
    if (value !== true) fail(`hardStops.${key} must remain enabled.`);
  }
  if (Object.keys(hardStops).length !== 7) {
    fail('App-content handoff must preserve all seven hard stops.');
  }
  if (!Array.isArray(handoff.evidenceRefs) || handoff.evidenceRefs.length !== 14 ||
      handoff.evidenceRefs.some((ref) => typeof ref !== 'string' ||
        ref.includes('..') || !resolve(repositoryRoot, ref).startsWith(`${resolve(repositoryRoot)}/`))) {
    fail('App-content evidence references are invalid.');
  }
  for (const ref of handoff.evidenceRefs) readFileSync(resolve(repositoryRoot, ref));
  return { taskCount: taskNames.length, buildNumber: candidate.buildNumber };
}

function runCli() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const allowCandidateRollover = process.argv.includes('--allow-candidate-rollover');
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--allow-candidate-rollover');
  if (unknownArgs.length > 0) fail(`Unknown argument: ${unknownArgs[0]}`);
  const result = validateGooglePlayAppContentHandoff({ repositoryRoot, allowCandidateRollover });
  process.stdout.write(
    `Google Play app-content handoff: PASS (${result.taskCount} tasks, ` +
      `observed console build ${result.buildNumber})\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Google Play app-content handoff failed.'}\n`);
    process.exitCode = 1;
  }
}
