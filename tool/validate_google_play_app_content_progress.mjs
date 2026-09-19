#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateGooglePlayAppContentHandoff } from './validate_google_play_app_content_handoff.mjs';

function fail(message) { throw new Error(message); }

function object(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function readJson(repositoryRoot, path, label) {
  try {
    return object(JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8')), label);
  } catch (error) {
    fail(`${label} is invalid: ${error.message}`);
  }
}

export function validateGooglePlayAppContentProgress({
  repositoryRoot,
  evidencePath = resolve(repositoryRoot,
    'docs/evidence/b11/google-play-app-content-progress-2026081509-20260815.json'),
} = {}) {
  const evidence = object(JSON.parse(readFileSync(evidencePath, 'utf8')), 'progress evidence');
  if (evidence.schemaVersion !== 1 || evidence.kind !== 'google-play-app-content-progress' ||
      evidence.status !== 'eleven-of-twelve-saved-one-open') {
    fail('Play app-content progress state is invalid.');
  }

  const sources = object(evidence.authoritativeSources, 'authoritative sources');
  const expectedSources = {
    appContentHandoffRef: 'store/google-play/app-content-handoff.json',
    privacyPolicyEvidenceRef:
      'docs/evidence/b11/google-play-privacy-policy-saved-20260815.json',
    currentCandidateBindingRef:
      'docs/evidence/b11/google-play-data-safety-current-candidate-binding-2026081509-20260815.json',
    currentInternalReleaseRef:
      'docs/evidence/b11/google-play-internal-release-active-2026081509-20260815.json',
  };
  if (JSON.stringify(sources) !== JSON.stringify(expectedSources)) {
    fail('Play app-content progress authoritative sources are incomplete.');
  }

  validateGooglePlayAppContentHandoff({
    repositoryRoot,
    handoffPath: resolve(repositoryRoot, sources.appContentHandoffRef),
    allowCandidateRollover: true,
  });
  const handoff = readJson(repositoryRoot, sources.appContentHandoffRef, 'app-content handoff');
  const deviceValidation = readJson(repositoryRoot, 'store/device-validation.json', 'device validation');
  const currentBinding = readJson(repositoryRoot, sources.currentCandidateBindingRef,
    'current Data Safety candidate binding');
  const privacyEvidence = readJson(repositoryRoot, sources.privacyPolicyEvidenceRef,
    'privacy-policy evidence');
  const internalRelease = readJson(repositoryRoot, sources.currentInternalReleaseRef,
    'internal-release evidence');

  const candidate = object(evidence.candidate, 'candidate');
  if (candidate.applicationId !== 'com.shareittoo.app' ||
      candidate.versionName !== '1.0.0' ||
      candidate.consoleBaselineBuildNumber !== handoff.candidate?.buildNumber ||
      candidate.currentInternalBuildNumber !== deviceValidation.candidate?.buildNumber ||
      candidate.currentInternalBuildNumber !== currentBinding.candidate?.buildNumber ||
      candidate.currentInternalBuildNumber !== internalRelease.candidate?.buildNumber ||
      candidate.releaseChannel !== 'internal' ||
      candidate.apiBaseUrl !== 'https://staging.shareittoo.com/api/v1') {
    fail('Play app-content progress is stale or not bound to the current Internal candidate.');
  }

  const expectedSavedTasks = [
    'privacyPolicy', 'appAccess', 'ads', 'targetAudience', 'governmentApps',
    'financialFeatures', 'health', 'categoryAndContact', 'advertisingId',
    'contentRating', 'storeListing',
  ];
  if (evidence.counts?.totalTasks !== 12 || evidence.counts?.savedTasks !== 11 ||
      evidence.counts?.openTasks !== 1 || !Array.isArray(evidence.savedTasks) ||
      JSON.stringify(evidence.savedTasks) !== JSON.stringify(expectedSavedTasks)) {
    fail('Play app-content task counts or saved tasks are incomplete.');
  }
  if (Object.keys(evidence.openTasks ?? {}).join(',') !== 'dataSafety' ||
      typeof evidence.openTasks.dataSafety !== 'string' ||
      !evidence.openTasks.dataSafety.includes('pending')) {
    fail('Play Data Safety must remain the single fail-closed open task.');
  }

  const consoleState = object(evidence.consoleState, 'console state');
  if (consoleState.privacyPolicyUrlSaved !== true ||
      consoleState.savedPrivacyPolicyUrl !== 'https://shareittoo.com/privacy' ||
      consoleState.dataSafetyAnswersPrepared !== true ||
      consoleState.dataSafetyDraftSaved !== false ||
      consoleState.dataSafetySubmitted !== false ||
      consoleState.sentForReview !== false ||
      handoff.tasks?.privacyPolicy?.savedUrl !== consoleState.savedPrivacyPolicyUrl ||
      privacyEvidence.publicPage?.url !== consoleState.savedPrivacyPolicyUrl ||
      privacyEvidence.googlePlayConsole?.changeSavedConfirmationObserved !== true ||
      handoff.tasks?.dataSafety?.status !==
        'all-data-type-answers-prepared-console-save-blocked') {
    fail('Play app-content console state is invalid or exceeds the saved evidence.');
  }

  const boundaries = object(evidence.boundaries, 'boundaries');
  if (Object.keys(boundaries).length !== 11 ||
      Object.values(boundaries).some((value) => value !== false) ||
      JSON.stringify(evidence).includes('@')) {
    fail('Play app-content progress boundaries are unsafe or unsanitized.');
  }

  return {
    status: evidence.status,
    totalTasks: evidence.counts.totalTasks,
    savedTasks: evidence.counts.savedTasks,
    openTasks: evidence.counts.openTasks,
  };
}

function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = validateGooglePlayAppContentProgress({ repositoryRoot });
  process.stdout.write(
    `Google Play app-content progress: PASS (${result.savedTasks}/${result.totalTasks} saved, ` +
      `${result.openTasks} open)\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { main(); } catch (error) {
    process.stderr.write(`${error?.message ?? 'Play app-content progress validation failed.'}\n`);
    process.exitCode = 1;
  }
}
