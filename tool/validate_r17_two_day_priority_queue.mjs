#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/r17-two-day-priority-queue-20260825.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R17 source ${path}` });
}

function markers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`R17 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value, label) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail(`${label} contains private or secret-shaped material.`);
  }
}

export function validateR17TwoDayPriorityQueue({
  repositoryRoot = root,
  evidence,
  featureMatrix,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed-ready-for-final-decision',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r17-two-day-priority-queue'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== 'dda99ed03660c509d3e713799b7001e4e6680b79') {
    fail('R17 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'R16',
    evidence: 'docs/evidence/48h-remote/r16-pr7-pilot-freeze-integration-review-20260824.json',
    status: 'verified-regression-and-codeql-passed-ready-for-r17',
    implementationCommit: '7eac3d240b96e848addf3ee6df034bb742b0a9b9',
    closureHead: 'dda99ed03660c509d3e713799b7001e4e6680b79',
  })) fail('R17 predecessor binding is invalid.');
  const r16 = JSON.parse(source(repositoryRoot, value.predecessor.evidence));
  if (r16.status !== value.predecessor.status
      || r16.githubVerification?.implementationCommit
        !== value.predecessor.implementationCommit
      || r16.findings?.length !== 3
      || r16.boundaries?.pullRequestMerged !== false) {
    fail('R17 R16 predecessor state drifted.');
  }

  if (!exact({
    report: value.report,
    ownerSecurityGate: value.ownerSecurityGate,
    reducedWave0Runbook: value.reducedWave0Runbook,
    testerInstructions: value.testerInstructions,
    featureMatrix: value.featureMatrix,
  }, {
    report: 'docs/operations/48H_R17_TWO_DAY_PRIORITY_QUEUE_2026-08-25.md',
    ownerSecurityGate: 'docs/operations/48H_R17_GITGUARDIAN_HISTORY_REVIEW_OWNER_GATE.md',
    reducedWave0Runbook: 'docs/operations/48H_R17_REDUCED_NON_BINDING_WAVE0_2026-08-25.md',
    testerInstructions: 'docs/templates/48H_R17_REDUCED_NON_BINDING_WAVE0_TESTER_INSTRUCTIONS_DE.md',
    featureMatrix: 'store/google-play/r17-stage-a-feature-flag-matrix.json',
  })) fail('R17 artifact map is invalid.');

  const expectedFindings = [
    ['R16-P0-SEC-HISTORY-001', 'P0', 'owner-action-required-final-gates-held'],
    ['R16-P1-STAGE-A-BINDING-001', 'P1', 'resolved-code-and-tests'],
    ['R16-P1-WAVE0-SURFACE-001', 'P1', 'resolved-scope-correction'],
  ];
  if (!Array.isArray(value.findings) || value.findings.length !== 3) {
    fail('R17 finding set is invalid.');
  }
  expectedFindings.forEach(([id, priority, state], index) => {
    const finding = value.findings[index];
    if (finding?.id !== id || finding.priority !== priority || finding.state !== state) {
      fail(`R17 finding drift: ${id}`);
    }
  });
  if (value.findings[0].resolution !== 'sanitized-owner-gate-prepared'
      || value.findings[0].ownerToken !== 'R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE'
      || value.findings[0].rawCredentialInspected !== false
      || value.findings[0].historyRewriteAllowed !== false) {
    fail('R17 P0 owner-gate truth is invalid.');
  }

  if (!exact(value.stageANonBinding, {
    buildDefine: 'SIT_STAGE_A_NON_BINDING_PILOT',
    requiredWhenBlueOcean: true,
    bindingCheckoutAvailable: false,
    remoteBindingQuoteLoaded: false,
    legalAcceptanceCheckboxesVisible: false,
    rentalRequestSubmissionPossible: false,
    ordinaryV52DevelopmentPathRetained: true,
    privateArchiveBound: true,
  }) || !exact(value.reducedHumanWave0, {
    allowedTaskFamilies: 5,
    forbiddenTaskFamilies: 5,
    g3G4G5ReleaseLocksRetained: true,
    fullR14N9ParticipantFlowSupersededForNextCandidate: true,
    activated: false,
  })) fail('R17 non-binding or reduced-wave truth is invalid.');
  if (!exact(value.gateSeparation, {
    BUILD_READY: 'not-granted',
    PLAY_UPLOAD_APPROVED: 'not-granted',
    HUMAN_PILOT_ACTIVATED: 'not-granted',
    PR7_MERGE_APPROVED: 'not-granted',
    R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE: 'not-granted',
  })) fail('R17 gate separation is invalid.');

  const matrix = featureMatrix
    ?? JSON.parse(source(repositoryRoot, value.featureMatrix));
  if (matrix.schemaVersion !== 1
      || matrix.kind !== 'sit-48h-r17-reduced-non-binding-stage-a-feature-matrix'
      || matrix.status !== 'prepared-not-built-not-activated'
      || !exact(matrix.candidate, {
        applicationId: 'com.shareittoo.app',
        releaseChannel: 'internal',
        apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
        exactSourceCommit: 'pending-r17-implementation-commit',
        sourceCommitBound: false,
        aabBuilt: false,
        aabSha256: null,
      })) fail('R17 feature matrix identity is invalid.');
  const expectedStates = {
    blue_ocean_listing_assistant: 'on-internal-staging-only',
    stage_a_non_binding_pilot: 'on-required-with-blue-ocean',
    closed_staging_listing_creation: 'on-after-human-gate',
    g2_search_project_saved_cart: 'on-non-reserving',
    binding_checkout: 'off-fail-closed',
    rental_request_and_contract: 'not-run',
    accept_reject: 'not-run',
    payment_refund_payout: 'off-not-run',
    handover_return_damage_needs_review: 'not-run',
    g3_booking_groups: 'off-release-mode-lock',
    g4_planner: 'off-release-mode-lock',
    g5_supply_and_listing_sets: 'off-release-mode-lock',
    external_listing_ai: 'disabled-manual-fallback',
    public_registration_and_store: 'off',
  };
  if (!exact(Object.fromEntries(
    matrix.surfaces.map(({ id, targetState }) => [id, targetState]),
  ), expectedStates)
      || matrix.humanWave0?.allowedTaskFamilies?.length !== 5
      || matrix.humanWave0?.forbiddenTaskFamilies?.length !== 5
      || matrix.humanWave0?.activated !== false
      || !Object.values(matrix.gateSeparation ?? {}).every((state) => state === 'not-granted')
      || !Object.values(matrix.boundaries ?? {}).every((state) => state === false)) {
    fail('R17 feature matrix scope or gates are invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.focusedVerification, {
    legacyCheckoutTests: 'passed-1',
    stageANonBindingProfileTests: 'passed-1',
    archiveCandidateTests: 'passed-7',
    r17WiringTests: 'passed-9',
    r17ArtifactValidatorTests: 'passed-8',
    r17ArtifactValidator: 'passed',
    r16SupersessionValidator: 'passed',
    privacyInventoryValidator: 'passed',
    fullTechnicalRegression: fullPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R17 verification state is invalid.');
  if (githubPassed) {
    const check = value.githubVerification;
    if (!check || !/^[a-f0-9]{40}$/u.test(check.implementationCommit ?? '')
        || !Number.isSafeInteger(check.regressionRunId)
        || check.regressionConclusion !== 'success'
        || !Number.isSafeInteger(check.codeqlRunId)
        || check.codeqlConclusion !== 'success'
        || !Number.isSafeInteger(check.advancedSecurityCheckId)
        || check.advancedSecurityConclusion !== 'success'
        || check.newAlerts !== 0) fail('R17 GitHub verification is invalid.');
  } else if (value.githubVerification !== undefined) {
    fail('R17 cannot bind GitHub verification before exact checks pass.');
  }

  const expectedBoundaries = {
    credentialValueReadOrCopied: false,
    candidateBuiltOrUploaded: false,
    pixelChanged: false,
    testerContacted: false,
    humanPilotActivated: false,
    providerCalled: false,
    apiBillingCreated: false,
    paymentChanged: false,
    firebaseOrPlayChanged: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    historyRewritten: false,
  };
  if (!exact(value.boundaries, expectedBoundaries)
      || value.next48hPackage !== '48H_REMOTE_READINESS_DECISION') {
    fail('R17 boundary or next-package truth is invalid.');
  }

  const config = source(repositoryRoot, 'lib/config/private_pilot_config.dart');
  markers(config, 'lib/config/private_pilot_config.dart', [
    'SIT_STAGE_A_NON_BINDING_PILOT', 'bindingCheckoutAvailableFor',
    '!stageANonBindingPilot', 'static bool get bindingCheckoutEnabled',
  ]);
  const checkout = source(
    repositoryRoot, 'lib/screens/private_pilot_checkout_screen.dart',
  );
  markers(checkout, 'lib/screens/private_pilot_checkout_screen.dart', [
    'Unverbindliche Stage-A-Vorschau', 'Simulierte Gesamtsumme',
    'Test-Mietanfrage senden', '_simulationAcknowledged',
    'simulationOnly: simulationOnly',
    'PrivatePilotConfig.bindingCheckoutEnabled',
  ]);
  const builder = source(repositoryRoot, 'scripts/build_android_release_candidate.sh');
  markers(builder, 'scripts/build_android_release_candidate.sh', [
    'stage_a_non_binding_pilot="$blue_ocean_listing_assistant"',
    '--dart-define=SIT_STAGE_A_NON_BINDING_PILOT=$stage_a_non_binding_pilot',
    'stageANonBindingPilotEnabled',
  ]);
  markers(source(repositoryRoot, 'scripts/build_android_local_qa_candidate.sh'),
    'scripts/build_android_local_qa_candidate.sh', [
      '--dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true',
      'stageANonBindingPilotEnabled',
    ]);
  markers(source(repositoryRoot, 'tool/archive_android_release_candidate.mjs'),
    'tool/archive_android_release_candidate.mjs', [
      'typeof manifest.stageANonBindingPilotEnabled',
      'manifest.blueOceanListingAssistantEnabled === true',
      'stageANonBindingPilotEnabled: manifest.stageANonBindingPilotEnabled',
    ]);
  for (const path of [
    'lib/config/booking_group_technical_config.dart',
    'lib/config/planner_technical_config.dart',
    'lib/config/supply_enrichment_technical_config.dart',
    'lib/config/listing_sets_technical_config.dart',
  ]) markers(source(repositoryRoot, path), path, [
    'signedStageAInternalEnvelope',
    'technicalSurfaceAvailableFor',
  ]);

  const report = source(repositoryRoot, value.report);
  markers(report, value.report, [
    'R16-P0-SEC-HISTORY-001', 'R16-P1-STAGE-A-BINDING-001',
    'R16-P1-WAVE0-SURFACE-001',
    '48H_REMOTE_READINESS_DECISION',
  ]);
  markers(report, value.report, [fullPassed
    ? 'FULL REGRESSION PASSED'
    : 'FULL REGRESSION PENDING']);
  markers(source(repositoryRoot, value.ownerSecurityGate), value.ownerSecurityGate, [
    'OWNER ACTION REQUIRED', 'R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE',
    'Do not paste the value', 'history rewrite',
  ]);
  markers(source(repositoryRoot, value.reducedWave0Runbook), value.reducedWave0Runbook, [
    'not-run', 'locks on G3/G4/G5 remain intact',
    'BUILD_READY', 'HUMAN_PILOT_ACTIVATED',
  ]);
  markers(source(repositoryRoot, value.testerInstructions), value.testerInstructions, [
    'KEINE EINLADUNG', 'Mietanfrage im Stage-A-Pilot gesperrt',
    'Zwingend nicht ausführen',
  ]);
  const releaseNotes = source(
    repositoryRoot, 'store/google-play/de-DE/blue_ocean_internal_release_notes.txt',
  );
  markers(releaseNotes, 'blue_ocean_internal_release_notes.txt', [
    'nicht reservierender Mietkorb',
    'unverbindliche Test-Mietanfrage',
  ]);
  if (/Anfrage-, Übergabe- und Rückgabeabläufe/u.test(releaseNotes)) {
    fail('R17 release notes still overclaim the reduced human path.');
  }
  assertSanitized(value, 'R17 evidence');
  assertSanitized(matrix, 'R17 feature matrix');
  return {
    status: value.status,
    p0OwnerGate: value.findings[0].state,
    resolvedP1: value.findings.filter(({ priority, state }) => (
      priority === 'P1' && state.startsWith('resolved-')
    )).length,
    next48hPackage: value.next48hPackage,
  };
}

function main() {
  const result = validateR17TwoDayPriorityQueue();
  process.stdout.write(
    `R17 queue valid: status=${result.status}, p0=${result.p0OwnerGate}, resolvedP1=${result.resolvedP1}, next=${result.next48hPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
