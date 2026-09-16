#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function fail(message) {
  throw new Error(message);
}

export function validateGooglePlayScreenshotReadiness({
  repositoryRoot,
  evidencePath = resolve(repositoryRoot, 'docs/evidence/b11/google-play-feed-screenshot-compatibility-2026081509-20260815.json'),
} = {}) {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  const exactCandidate = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'store/device-validation.json'), 'utf8')).candidate;
  if (evidence.kind === 'google-play-feed-screenshot-compatibility') {
    if (evidence.schemaVersion !== 1 ||
        evidence.status !== 'verified-compatible-no-visible-product-change') {
      fail('Screenshot compatibility must preserve the verified compatibility state.');
    }
    const current = evidence.currentCandidate ?? {};
    if (current.applicationId !== 'com.shareittoo.app' ||
        current.versionName !== exactCandidate?.versionName ||
        current.buildNumber !== exactCandidate?.buildNumber ||
        current.commit !== exactCandidate?.commit ||
        current.apkSha256 !== exactCandidate?.android?.apkSha256) {
      fail('Screenshot compatibility is not bound to the exact current candidate.');
    }
    const safeRef = (ref, label) => {
      if (typeof ref !== 'string' || ref.includes('..') ||
          !ref.startsWith('docs/evidence/b11/') || !ref.endsWith('.json')) {
        fail(`${label} is not a safe B11 evidence reference.`);
      }
      return resolve(repositoryRoot, ref);
    };
    const source = JSON.parse(readFileSync(safeRef(
      evidence.sourceScreenshotEvidenceRef, 'sourceScreenshotEvidenceRef'), 'utf8'));
    const sourceCandidate = JSON.parse(readFileSync(safeRef(
      evidence.sourceCandidateEvidenceRef, 'sourceCandidateEvidenceRef'), 'utf8'));
    if (source.kind !== 'google-play-feed-screenshot-readiness' ||
        ![
          'exact-candidate-local-screenshots-validated-not-uploaded',
          'exact-candidate-screenshots-byte-identical-existing-draft',
        ].includes(source.status) ||
        source.candidate?.buildNumber !== sourceCandidate.candidate?.buildNumber ||
        source.candidate?.commit !== sourceCandidate.candidate?.commit ||
        source.candidate?.apkSha256 !== sourceCandidate.android?.apkSha256 ||
        BigInt(source.candidate?.buildNumber ?? '0') >= BigInt(current.buildNumber)) {
      fail('Screenshot compatibility source is stale or not an exact historical candidate.');
    }
    const review = evidence.compatibilityReview ?? {};
    const currentCandidateEvidence = JSON.parse(readFileSync(safeRef(
      review.currentCandidateEvidenceRef, 'currentCandidateEvidenceRef'), 'utf8'));
    const storeInstall = JSON.parse(readFileSync(safeRef(
      review.baselineStoreInstallEvidenceRef, 'baselineStoreInstallEvidenceRef'), 'utf8'));
    const roleBooking = JSON.parse(readFileSync(safeRef(
      review.baselineRoleBookingEvidenceRef, 'baselineRoleBookingEvidenceRef'), 'utf8'));
    const expectedChangedFiles = [
      'android/app/src/main/AndroidManifest.xml',
      'lib/screens/message_thread_screen.dart',
      'lib/services/auth_service.dart',
      'lib/services/backend_repository.dart',
      'lib/services/data_service.dart',
    ];
    if (review.sourceSnapshotCommit !== 'c6ab5fc143c5d424aece3d8fb7dfe4a351cb02df' ||
        JSON.stringify(review.changedAppSourceFilesSinceSourceSnapshot) !==
          JSON.stringify(expectedChangedFiles) ||
        JSON.stringify(review.changedVisibleScreenshotSourceFiles) !== '[]' ||
        review.visibleScreenSourceChanged !== false ||
        review.storeListingCoreFlowsChanged !== false ||
        review.screenshotsNeedRecapture !== false ||
        currentCandidateEvidence.candidate?.buildNumber !== current.buildNumber ||
        currentCandidateEvidence.candidate?.commit !== current.commit ||
        currentCandidateEvidence.android?.apkSha256 !== current.apkSha256 ||
        currentCandidateEvidence.android?.signatureVerified !== true ||
        currentCandidateEvidence.android?.packageIdentityVerified !== true ||
        BigInt(storeInstall.candidate?.buildNumber ?? '0') > BigInt(current.buildNumber) ||
        storeInstall.postReleaseChecks?.playStoreInstallCompleted !== true ||
        storeInstall.postReleaseChecks?.installedVersionVerified !== true ||
        roleBooking.candidate?.buildNumber !== storeInstall.candidate?.buildNumber ||
        roleBooking.status !== 'passed-bounded-synthetic-role-booking-diagnostic') {
      fail('Screenshot compatibility review is incomplete or contradicts the current Store build.');
    }
    const boundaries = evidence.boundaries ?? {};
    if (Object.keys(boundaries).length !== 7 ||
        Object.values(boundaries).some((value) => value !== false) ||
        JSON.stringify(evidence).includes('@')) {
      fail('Screenshot compatibility must not claim Store changes or contain private data.');
    }
    return { status: evidence.status, curatedListingCount: source.fixture.curatedListingCount };
  }
  const existingDraftReconciled =
    evidence.status === 'exact-candidate-screenshots-byte-identical-existing-draft';
  if (evidence.schemaVersion !== 1 ||
      evidence.kind !== 'google-play-feed-screenshot-readiness' ||
      (!existingDraftReconciled &&
       evidence.status !== 'exact-candidate-screenshots-uploaded-draft-saved')) {
    fail('Feed screenshot readiness must preserve the exact saved Console draft state.');
  }
  if (evidence.candidate?.applicationId !== 'com.shareittoo.app' ||
      evidence.candidate?.versionName !== exactCandidate?.versionName ||
      evidence.candidate?.buildNumber !== exactCandidate?.buildNumber ||
      evidence.candidate?.commit !== exactCandidate?.commit ||
      evidence.candidate?.apkSha256 !== exactCandidate?.android?.apkSha256 ||
      evidence.candidate?.releaseChannel !== 'internal' ||
      evidence.candidate?.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1' ||
      Object.hasOwn(evidence, 'replacementBuildNumber') ||
      Object.hasOwn(evidence, 'supersessionEvidenceRef')) {
    fail('Feed screenshot readiness is not bound to the exact installed build.');
  }
  if (evidence.device?.installedCandidateVerified !== true ||
      evidence.device?.syntheticScreenshotSessionReady !== true ||
      evidence.fixture?.status !== 'ready-reused' ||
      evidence.fixture?.curatedListingCount !== 4 ||
      evidence.fixture?.createdDuringObservation !== 0 ||
      evidence.feedObservation?.curatedListingVisible !== true ||
      evidence.feedObservation?.legacyTechnicalListingsVisible !== false ||
      evidence.feedObservation?.placeholderImagesVisible !== false ||
      evidence.feedObservation?.technicalFixtureCopyVisible !== false ||
      evidence.feedObservation?.protectedActiveBookings !== 6 ||
      evidence.feedObservation?.protectedPublicListingsObserved !== 6 ||
      evidence.feedObservation?.storeScreenshotAccepted !== true ||
      evidence.feedObservation?.validatedLocalCandidates !== 4) {
    fail('Feed screenshot observation is incomplete or contradicts the verified cleanup.');
  }
  const expectedRemediation = existingDraftReconciled
    ? 'reuse-previous-bounded-staging-cleanup'
    : 'pause-unreferenced-and-neutralize-protected-staging-listings';
  if (evidence.completedRemediation?.method !== expectedRemediation ||
      evidence.completedRemediation?.deletionPerformed !== false ||
      evidence.completedRemediation?.protectedBookingsPreserved !== true ||
      evidence.completedRemediation?.deletionAuthorized !== false ||
      evidence.completedRemediation?.productionChangeAuthorized !== false) {
    fail('Screenshot remediation must not claim destructive or production authority.');
  }
  if (!Array.isArray(evidence.candidateEvidenceRefs) || evidence.candidateEvidenceRefs.length !== 4) {
    fail('Screenshot readiness must bind all four validated local candidates.');
  }
  for (const ref of evidence.candidateEvidenceRefs) {
    const candidate = JSON.parse(readFileSync(resolve(repositoryRoot, ref), 'utf8'));
    if (candidate.status !== 'exact-candidate-local-not-uploaded' ||
        candidate.candidate?.buildNumber !== evidence.candidate.buildNumber) {
      fail('Screenshot readiness references a stale or unvalidated local candidate.');
    }
  }
  let sourceScreenshotEvidence = null;
  if (existingDraftReconciled) {
    const sourceRef = evidence.sourceScreenshotEvidenceRef;
    if (typeof sourceRef !== 'string' || sourceRef.includes('..') ||
        !sourceRef.startsWith('docs/evidence/b11/') || !sourceRef.endsWith('.json')) {
      fail('Screenshot reconciliation must reference safe historical screenshot evidence.');
    }
    sourceScreenshotEvidence = JSON.parse(readFileSync(resolve(repositoryRoot, sourceRef), 'utf8'));
    const reconciliation = evidence.consoleReconciliation ?? {};
    if (sourceScreenshotEvidence.kind !== 'google-play-feed-screenshot-readiness' ||
        sourceScreenshotEvidence.status !== 'exact-candidate-screenshots-uploaded-draft-saved' ||
        sourceScreenshotEvidence.candidate?.buildNumber !== reconciliation.sourceBuildNumber ||
        BigInt(reconciliation.sourceBuildNumber ?? '0') >= BigInt(evidence.candidate.buildNumber) ||
        reconciliation.allFourAssetsByteIdentical !== true ||
        reconciliation.uploadRequired !== false ||
        reconciliation.consoleDraftRetained !== true ||
        reconciliation.visualInspectionPassed !== true ||
        !Array.isArray(sourceScreenshotEvidence.candidateEvidenceRefs) ||
        sourceScreenshotEvidence.candidateEvidenceRefs.length !== 4) {
      fail('Screenshot reconciliation is incomplete or does not preserve the existing Console draft.');
    }
    for (let index = 0; index < evidence.candidateEvidenceRefs.length; index += 1) {
      const currentScene = JSON.parse(readFileSync(
        resolve(repositoryRoot, evidence.candidateEvidenceRefs[index]), 'utf8'));
      const sourceScene = JSON.parse(readFileSync(
        resolve(repositoryRoot, sourceScreenshotEvidence.candidateEvidenceRefs[index]), 'utf8'));
      if (currentScene.scene?.id !== sourceScene.scene?.id ||
          currentScene.scene?.storeFile !== sourceScene.scene?.storeFile ||
          currentScene.scene?.sha256 !== sourceScene.scene?.sha256 ||
          currentScene.scene?.byteSize !== sourceScene.scene?.byteSize) {
        fail('Exact candidate screenshots are not byte-identical to the saved Console assets.');
      }
    }
  }
  const consoleSaveRef = evidence.consoleSaveEvidenceRef;
  if (typeof consoleSaveRef !== 'string' || consoleSaveRef.includes('..') ||
      !consoleSaveRef.startsWith('docs/evidence/b11/') || !consoleSaveRef.endsWith('.json')) {
    fail('Screenshot readiness must reference bounded Console save evidence.');
  }
  const consoleSave = JSON.parse(readFileSync(resolve(repositoryRoot, consoleSaveRef), 'utf8'));
  const expectedConsoleBuild = existingDraftReconciled
    ? sourceScreenshotEvidence?.candidate?.buildNumber
    : evidence.candidate.buildNumber;
  const expectedConsoleCommit = existingDraftReconciled
    ? sourceScreenshotEvidence?.candidate?.commit
    : evidence.candidate.commit;
  if (consoleSave.kind !== 'google-play-store-listing-saved' ||
      consoleSave.status !== 'exact-candidate-screenshots-draft-saved' ||
      consoleSave.candidate?.buildNumber !== expectedConsoleBuild ||
      consoleSave.candidate?.commit !== expectedConsoleCommit ||
      consoleSave.observedConsoleState?.phoneScreenshotCount !== 4 ||
      consoleSave.observedConsoleState?.newAssetsUploaded !== 4 ||
      consoleSave.observedConsoleState?.supersededAssetsRemoved !== 4 ||
      consoleSave.observedConsoleState?.draftSavedConfirmationObserved !== true ||
      consoleSave.observedConsoleState?.sentForReview !== false ||
      !Array.isArray(consoleSave.phoneScreenshots) || consoleSave.phoneScreenshots.length !== 4 ||
      consoleSave.boundaries?.listingDraftChanged !== true ||
      consoleSave.boundaries?.assetsUploaded !== true ||
      Object.entries(consoleSave.boundaries ?? {}).some(([key, value]) =>
        ['listingDraftChanged', 'assetsUploaded'].includes(key) ? value !== true : value !== false) ||
      JSON.stringify(consoleSave).includes('@')) {
    fail('Screenshot Console save evidence is incomplete or unsafe.');
  }
  const boundaries = evidence.boundaries ?? {};
  const mutableTrueKeys = existingDraftReconciled ? [] : ['listingPaused', 'screenshotUploaded'];
  const expectedBoundaryCount = existingDraftReconciled ? 11 : 9;
  if (Object.keys(boundaries).length !== expectedBoundaryCount ||
      boundaries.listingDeleted !== false ||
      Object.entries(boundaries).some(([key, value]) =>
        mutableTrueKeys.includes(key) ? value !== true : value !== false) ||
      JSON.stringify(evidence).includes('@')) {
    fail('Screenshot readiness must remain sanitized and report only the bounded draft upload and Staging pause.');
  }
  return { status: evidence.status, curatedListingCount: evidence.fixture.curatedListingCount };
}

function runCli() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateGooglePlayScreenshotReadiness({ repositoryRoot });
  process.stdout.write(`Google Play screenshot readiness: PASS (${result.status}, ${result.curatedListingCount} curated listings)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Google Play screenshot readiness failed.'}\n`);
    process.exitCode = 1;
  }
}
