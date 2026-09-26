#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n8-synthetic-pilot-harness-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N8 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N8 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN8SyntheticPilotHarness({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'implemented-targeted-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n9',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n8-synthetic-pilot-harness'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== 'a6248a7cd97711eddcf9211c0c3a8cccdf1858c7') {
    fail('N8 evidence identity is invalid.');
  }
  if (!exact(value.harness, {
    version: 'N8-2026-08-24.1',
    resultClassification: 'SYNTHETIC_PLANNING_OUTPUT_NOT_HUMAN_EVIDENCE',
    executionScope: 'DETERMINISTIC_DOMAIN_SIMULATION_NOT_APP_OR_HUMAN_E2E',
    deterministicSeed: 'sit-blue-ocean-n8-fixed-seed-v1',
    replaySha256: '1c95d0ace4b101bdf7c09c5ad7116abf749430b1f08d834ec4c6868504f8ecd0',
    syntheticParticipantCount: 30,
    attemptedFlowCount: 40,
    completedFlowCount: 37,
    requiredCompletedFlowMinimum: 30,
    requiredCompletedFlowMaximum: 50,
    individualRecordsReturned: false,
  })) fail('N8 harness summary is invalid.');
  if (!exact(value.cohorts, [
    {
      id: 'CORE', attemptedFlowCount: 13, completedFlowCount: 12,
      meanDraftTimeSeconds: 505, meanPublishReadyTimeSeconds: 660,
      fieldEditRateBasisPoints: 10000, manualFallbackCount: 0,
    },
    {
      id: 'GROWTH', attemptedFlowCount: 13, completedFlowCount: 12,
      meanDraftTimeSeconds: 469, meanPublishReadyTimeSeconds: 604,
      fieldEditRateBasisPoints: 10000, manualFallbackCount: 0,
    },
    {
      id: 'BLUE_OCEAN', attemptedFlowCount: 14, completedFlowCount: 13,
      meanDraftTimeSeconds: 235, meanPublishReadyTimeSeconds: 340,
      fieldEditRateBasisPoints: 6095, manualFallbackCount: 2,
    },
  ])) fail('N8 cohort summary is invalid.');
  if (!exact(value.coverage, {
    draftAndPublishReadyTime: 'aggregate-complete',
    editCategoryBrandModelAndClaims: 'aggregate-complete',
    priceAcceptanceAndEditDelta: 'aggregate-complete',
    clarificationAbandonmentAndFallback: 'aggregate-complete',
    projectSearchCartAndRequestFunnel: 'aggregate-complete',
    simulatedCompletionOwnersHandoversAndSupport: 'aggregate-complete',
    v52QuoteAuthority: 'actual-domain-module',
    listingAiGateway: 'actual-mock-and-refusal-boundaries',
    regionalPriceEngine: 'actual-domain-module',
    g3G4G5: 'deterministic-cohort-simulation',
    flutterHumanE2e: 'deferred-to-n13-and-later-authorized-pilot',
  })) fail('N8 coverage or evidence classification is invalid.');
  if (!exact(value.boundaries, {
    externalProviderCallPerformed: false,
    externalScannerCallPerformed: false,
    paidCallPerformed: false,
    billingActivated: false,
    secretStored: false,
    realPersonDataUsed: false,
    humanPilotActivated: false,
    realMoneyEnabled: false,
    automaticPublicationEnabled: false,
    syntheticLearningApplied: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    firebaseChanged: false,
    storeChanged: false,
    appleChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    historyRewritten: false,
  })) fail('N8 mutation boundary is invalid.');
  const fullPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === 'verified-ready-for-n9';
  if (!exact(value.targetedVerification, {
    harnessSyntax: 'passed',
    harnessTests: 'passed-8',
    deterministicReplay: 'passed-twice-exact',
    aggregateOnly: 'passed',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) fail('N8 verification record is invalid for its status.');
  if (value.nextPackage !== 'N9') fail('N8 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N8 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N8 cannot bind exact GitHub verification before CI is complete.');
  }

  const harnessPath = 'backend/src/blue_ocean_synthetic_pilot_harness.js';
  const harness = source(repositoryRoot, harnessPath);
  requireMarkers(harness, harnessPath, [
    "blueOceanSyntheticPilotHarnessVersion = 'N8-2026-08-24.1'",
    'SYNTHETIC_PLANNING_OUTPUT_NOT_HUMAN_EVIDENCE',
    'DETERMINISTIC_DOMAIN_SIMULATION_NOT_APP_OR_HUMAN_E2E',
    "id: 'CORE'", "id: 'GROWTH'", "id: 'BLUE_OCEAN'",
    'createListingAiGateway', 'recommendRegionalPriceV2', 'quoteRental',
    'individualRecordsReturned: false', 'externalProviderCallPerformed: false',
  ]);
  if (/\bfetch\s*\(|https?:\/\/|process\.env|Date\.now|Math\.random/u.test(harness)) {
    fail('N8 harness contains a non-deterministic or external dependency.');
  }
  const testPath = 'backend/test/blue_ocean_synthetic_pilot_harness.test.js';
  const tests = source(repositoryRoot, testPath);
  requireMarkers(tests, testPath, [
    'N8 replay is byte-stable and bound to a fixed digest',
    'N8 returns aggregate metrics only and no individual synthetic records',
    'N8 records coherent simulated downstream funnel totals',
    'N8 labels outputs as planning evidence and never as observed human results',
  ]);
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('N8 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    syntheticParticipants: value.harness.syntheticParticipantCount,
    attemptedFlows: value.harness.attemptedFlowCount,
    completedFlows: value.harness.completedFlowCount,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateBlueOceanN8SyntheticPilotHarness();
  process.stdout.write(
    `Blue Ocean N8 synthetic pilot valid: participants=${result.syntheticParticipants}, attempts=${result.attemptedFlows}, complete=${result.completedFlows}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
