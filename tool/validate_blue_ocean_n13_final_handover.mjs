#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n13-final-regression-handover-20260824.json';

const packageRefs = Object.freeze({
  N0: 'docs/evidence/blue-ocean/n0-baseline-20260823.json',
  N1: 'docs/evidence/blue-ocean/n1-listing-flow-audit-20260823.json',
  N2: 'docs/evidence/blue-ocean/n2-listing-ai-foundation-20260823.json',
  N3: 'docs/evidence/blue-ocean/n3-listing-ai-gateway-20260823.json',
  N4: 'docs/evidence/blue-ocean/n4-image-privacy-pipeline-20260823.json',
  N5: 'docs/evidence/blue-ocean/n5-regional-price-engine-v2-20260824.json',
  N6: 'docs/evidence/blue-ocean/n6-listing-workflow-20260824.json',
  N7: 'docs/evidence/blue-ocean/n7-evaluation-corpus-20260824.json',
  N8: 'docs/evidence/blue-ocean/n8-synthetic-pilot-harness-20260824.json',
  N9: 'docs/evidence/blue-ocean/n9-heilbronn-wave0-preparation-20260824.json',
  N10: 'docs/evidence/blue-ocean/n10-google-play-internal-testing-preparation-20260824.json',
  N11: 'docs/evidence/blue-ocean/n11-codex-local-guardrails-20260824.json',
  N12: 'docs/evidence/blue-ocean/n12-owner-action-pack-20260824.json',
});

const replyTokens = Object.freeze([
  'AI_LISTING_PILOT_BUDGET_5_EUR_GO',
  'AI_LISTING_PROVIDER_HOLD',
  'GOOGLE_PLAY_INTERNAL_UPLOAD_GO',
  'GOOGLE_PLAY_INTERNAL_HOLD',
  'HEILBRONN_WAVE0_ACTIVATION_GO',
  'HEILBRONN_WAVE0_HOLD',
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N13 source ${path}` });
}

function json(repositoryRoot, path) {
  return JSON.parse(source(repositoryRoot, path));
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N13 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN13FinalHandover({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? json(repositoryRoot, evidencePath);
  const validStatuses = [
    'implemented-local-gates-passed-ci-pending',
    'verified-stage-a-blue-ocean-decision',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n13-final-regression-handover'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== 'efaa7ee3af59c13334cb4a3b7ca384178ce0b09e'
      || value.handoverRef !== 'docs/operations/STAGE_A_BLUE_OCEAN_DECISION_HANDOVER_2026-08-24.md'
      || value.finalGate !== 'STAGE_A_BLUE_OCEAN_DECISION') {
    fail('N13 evidence identity is invalid.');
  }

  if (!exact(value.repositorySnapshot, {
    repository: 'walidwalidchraibi-dot/ShareItToo-Dreamflow',
    branch: 'codex/master-workflow-20260808',
    localHeadBeforeN13: 'efaa7ee3af59c13334cb4a3b7ca384178ce0b09e',
    upstream: 'origin/codex/master-workflow-20260808',
    upstreamHeadBeforeN13Push: '8ded33b8ed7c84d307014263b678c3fd9177038c',
    workingTreeBeforeN13: 'n13-package-only',
    pullRequest: 7,
    pullRequestState: 'open-draft-unmerged-mergeable-blocked',
    ...(value.status === validStatuses[1] ? {
      verifiedImplementationHead: value.exactGitHubVerification?.headSha,
      finalTreeState: 'clean-and-synchronized-after-evidence-closure',
    } : {}),
  })) fail('N13 repository snapshot is invalid.');

  const actualPackageStates = Object.fromEntries(Object.entries(packageRefs).map(
    ([name, path]) => [name, json(repositoryRoot, path).status],
  ));
  if (!exact(value.packageStates, actualPackageStates)) fail('N13 package-state portfolio is stale.');
  if (value.status === validStatuses[1]
      && !Object.values(value.packageStates).every((status) => status.startsWith('verified-'))) {
    fail('N13 final state requires verified N0-N12 package evidence.');
  }

  if (!exact(value.localVerification, {
    focusedBackendTests: 'passed-119',
    focusedArtifactAndPolicyTests: 'passed-125',
    postgres16FreshClusterIntegration: 'passed-and-cleaned',
    backendRegression: 'passed-725-one-documented-skip',
    flutterRegression: 'passed-387-one-documented-skip',
    flutterAnalyzer: 'passed-reviewed-debt-ratchet-122',
    privacyAndRetention: 'passed-fail-closed-draft',
    supportTraceability: 'passed-167-scenarios',
    aiSchemaAndPromptInjection: 'passed',
    imagePrivacy: 'passed',
    regionalPriceEngineV2: 'passed',
    syntheticHarness: 'passed-twice-exact-replay',
    webBuildWasmAndLoopbackSmoke: 'passed',
    androidDebug: 'passed-448-tasks-min-sdk-24',
    dependencyAudit: 'passed-no-known-production-vulnerabilities',
    secretScan: 'passed-no-high-confidence-secrets-12-reviewed-historical-baseline',
    fullTechnicalRegression: 'passed-ci-metadata-candidate-rollover-mode',
  })) fail('N13 local verification matrix is invalid.');

  const n8 = json(repositoryRoot, packageRefs.N8);
  if (!exact(value.syntheticComparison, {
    classification: n8.harness.resultClassification,
    syntheticParticipants: n8.harness.syntheticParticipantCount,
    attemptedFlows: n8.harness.attemptedFlowCount,
    completedFlows: n8.harness.completedFlowCount,
    replaySha256: n8.harness.replaySha256,
    cohorts: n8.cohorts.map((cohort) => ({
      id: cohort.id,
      attempted: cohort.attemptedFlowCount,
      completed: cohort.completedFlowCount,
      meanDraftSeconds: cohort.meanDraftTimeSeconds,
      meanPublishReadySeconds: cohort.meanPublishReadyTimeSeconds,
      fieldEditRateBasisPoints: cohort.fieldEditRateBasisPoints,
      manualFallbacks: cohort.manualFallbackCount,
    })),
  })) fail('N13 synthetic comparison is invalid.');

  if (!exact(value.readiness, {
    aiListingAssistant: 'technical-default-off-complete-external-provider-not-configured',
    imagePrivacy: 'technical-pipeline-complete-real-scanner-provider-deferred',
    regionalPriceEngineV2: 'deterministic-complete-no-synthetic-learning',
    heilbronnWave0: 'prepared-not-activated-owner-and-external-gates-open',
    googlePlayInternalTesting: 'handoff-prepared-no-aab-build-upload-console-or-testers',
  })) fail('N13 product-readiness record is invalid.');
  const pendingBlockers = [
    'exact-n13-regression-and-codeql',
    'private-operator-config-outside-repository',
    'owner-approved-exact-signed-hash-bound-internal-aab',
    'play-upload-and-separate-internal-release-owner-gates',
    'private-three-adult-roster-consent-and-physical-device-tests',
    'professional-review-deferred-and-unreviewed-risk-accepted',
    'real-provider-contract-privacy-security-region-retention-and-budget',
    'real-roles-delegates-firebase-owner-checks-and-authentic-economics',
    'scanner-psp-apple-public-release-and-production-deferred',
  ];
  const final = value.status === validStatuses[1];
  const expectedBlockers = final ? pendingBlockers.slice(1) : pendingBlockers;
  if (!exact(value.remainingBlockers, expectedBlockers)) {
    fail('N13 remaining-blocker record is invalid.');
  }
  if (!exact(value.costState, {
    preparedFreeActionsExpectedNewExternalEur: 0,
    optionalAiPilotHardCapEur: 5,
    optionalAiPilotBudgetApproved: false,
    allOtherExternalCosts: 'unknown-unapproved-require-quote-and-maximum-eur-token',
  })) fail('N13 cost boundary is invalid.');
  if (!exact(value.acceptedAndDeferredRisk, {
    professionalReview: 'PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER',
    unreviewedRisk: 'UNREVIEWED_RISK_ACCEPTED',
    professionalApprovalClaimed: false,
    riskResolvedClaimed: false,
  })) fail('N13 accepted/deferred risk record is invalid.');
  if (!exact(value.recommendedCurrentTokens, [
    'AI_LISTING_PROVIDER_HOLD',
    'GOOGLE_PLAY_INTERNAL_HOLD',
    'HEILBRONN_WAVE0_HOLD',
  ]) || !exact(value.preparedReplyTokens, replyTokens)) {
    fail('N13 owner-token record is invalid.');
  }
  if (!Object.values(value.boundaries ?? {}).every((entry) => entry === false)) {
    fail('N13 live mutation boundary is invalid.');
  }

  if (final) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N13 exact GitHub verification is invalid.');
    }
    if (value.driveHandover?.uploaded !== true
        || !/^[A-Za-z0-9_-]{10,}$/u.test(value.driveHandover.fileId ?? '')) {
      fail('N13 final Drive handover binding is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined
      || value.driveHandover?.uploaded !== false
      || value.driveHandover?.fileId !== null) {
    fail('N13 cannot bind final external evidence while CI is pending.');
  }

  const handover = source(repositoryRoot, value.handoverRef);
  for (let number = 1; number <= 13; number += 1) {
    if (!handover.includes(`## ${number}. `)) fail(`N13 handover section missing: ${number}`);
  }
  requireMarkers(handover, value.handoverRef, [
    'STAGE_A_BLUE_OCEAN_DECISION',
    'SYNTHETIC_PLANNING_OUTPUT_NOT_HUMAN_EVIDENCE',
    'PROFESSIONAL_REVIEW_DEFERRED_BY_OWNER',
    'UNREVIEWED_RISK_ACCEPTED',
    'AI_LISTING_PROVIDER_HOLD',
    'GOOGLE_PLAY_INTERNAL_HOLD',
    'HEILBRONN_WAVE0_HOLD',
    ...replyTokens,
  ]);
  const serialized = `${handover}\n${JSON.stringify(value)}`;
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('N13 handover contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    finalGate: value.finalGate,
    packageCount: Object.keys(value.packageStates).length,
    completedSyntheticFlows: value.syntheticComparison.completedFlows,
    liveMutation: Object.values(value.boundaries).some(Boolean),
    driveUploaded: value.driveHandover.uploaded,
  };
}

function main() {
  const result = validateBlueOceanN13FinalHandover();
  process.stdout.write(
    `Blue Ocean N13 handover valid: packages=${result.packageCount}, syntheticFlows=${result.completedSyntheticFlows}, liveMutation=${result.liveMutation}, driveUploaded=${result.driveUploaded}, status=${result.status}, gate=${result.finalGate}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
