#!/usr/bin/env node

import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/48h-remote/r16-pr7-pilot-freeze-integration-review-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R16 source ${path}` });
}

function markers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`R16 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R16 machine evidence contains private or secret-shaped material.');
  }
}

export function validateR16Pr7PilotFreezeIntegrationReview({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const pending = 'implemented-audit-findings-bound-ready-for-freeze-commit';
  const verified = 'verified-regression-and-codeql-passed-ready-for-r17';
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r16-pr7-pilot-freeze-integration-review'
      || ![pending, verified].includes(value.status)
      || value.implementationBaseHead !== '2fed8f02b0e333b445e2cc4540b7a32da0d48bc9') {
    fail('R16 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'R15',
    evidence: 'docs/evidence/48h-remote/r15-google-play-internal-ready-pack-20260824.json',
    status: 'verified-regression-and-codeql-passed-ready-for-r16',
    implementationCommit: '7992fe06260334a30e5fdb775b45fbc25af0e033',
    closureHead: '2fed8f02b0e333b445e2cc4540b7a32da0d48bc9',
  })) fail('R16 predecessor binding is invalid.');
  const r15 = JSON.parse(source(repositoryRoot, value.predecessor.evidence));
  if (r15.status !== value.predecessor.status
      || r15.githubVerification?.implementationCommit !== value.predecessor.implementationCommit
      || r15.boundaries?.pullRequestMerged !== false) {
    fail('R16 R15 predecessor state drifted.');
  }

  if (!exact(value.pullRequestSnapshot, {
    number: 7,
    state: 'OPEN',
    draft: true,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'BLOCKED',
    baseBranch: 'main',
    baseOid: '6272264e985b1bc1d74a9891ddfd6074ce3caa61',
    headBranch: 'codex/master-workflow-20260808',
    headOid: '2fed8f02b0e333b445e2cc4540b7a32da0d48bc9',
    ahead: 1038,
    behind: 0,
    changedFiles: 2249,
    additions: 322306,
    deletions: 19987,
  })) fail('R16 PR snapshot is invalid.');
  if (!exact(value.branchProtectionSnapshot, {
    strictUpToDate: true,
    requiredContexts: ['backend-regression', 'flutter-regression'],
    requiredApprovingReviewCount: 0,
    dismissStaleReviews: true,
    requireLastPushApproval: false,
    enforceAdmins: true,
    codeqlRequiredByProtection: false,
    postgresRecoveryRequiredByProtection: false,
    cleanReproducibilityRequiredByProtection: false,
  })) fail('R16 branch protection snapshot is invalid.');

  const migrationDirectory = `${repositoryRoot}/backend/sql/migrations`;
  const migrationNames = readdirSync(migrationDirectory);
  const up = migrationNames.filter((name) => /^\d{3}_.+\.up\.sql$/u.test(name)).sort();
  const down = migrationNames.filter((name) => /^\d{3}_.+\.down\.sql$/u.test(name)).sort();
  const frozenUp = up.filter((name) => Number.parseInt(name.slice(0, 3), 10) <= 72);
  const frozenDown = down.filter((name) => Number.parseInt(name.slice(0, 3), 10) <= 72);
  const postFreezeUp = up.filter((name) => Number.parseInt(name.slice(0, 3), 10) > 72);
  if (frozenUp.length !== 72 || frozenDown.length !== 45
      || frozenUp[0] !== value.migrationInventory.first
      || frozenUp.at(-1) !== value.migrationInventory.last
      || postFreezeUp.some((name) => !down.includes(name.replace('.up.sql', '.down.sql')))
      || !exact(value.migrationInventory, {
        first: '001_b3_foundation.up.sql',
        last: '072_dispute_transfer_recovery.up.sql',
        orderedUpScripts: 72,
        pairedDownScripts: 45,
        forwardOnlyRange: '001-027',
        pairedRange: '028-072',
        checksumBound: true,
        secondRunChanges: 0,
        restoredTables: 136,
        defaultRollback: 'verified-pre-migration-snapshot-or-reviewed-forward-fix',
        destructiveRollbackGuards: [
          '032_support_case_foundation',
          '066_blue_ocean_listing_ai_foundation',
          '069_regional_price_engine_r6_hardening',
          '070_stage_a_non_binding_simulation_guard',
          '071_stripe_connect_accounts_v2',
          '072_dispute_transfer_recovery',
        ],
      })) fail('R16 migration inventory is invalid.');

  if (!exact(value.domainAudit, {
    authSecurity: 'technical-green-owner-history-secret-gate-open',
    legalEvidence: 'prepared-professional-review-deferred-fail-closed',
    listingAiImage: 'mock-local-green-external-disabled-manual-fallback',
    priceEngine: 'r6-property-stress-and-server-authority-green',
    g3: 'technical-green-g3l-draft-blocked-release-mode-locked',
    g4: 'technical-green-release-mode-locked-no-external-ai',
    g5: 'technical-green-release-mode-locked-optional-followup-fail-open',
    support: 'technical-map-valid-hold-scanner-transport-none',
    privacy: 'draft-fail-closed-final-binary-and-retention-gates-open',
    buildRelease: 'r15-controls-green-no-artifact-no-gate-granted',
    deviceQa: 'current-source-local-qa-green-future-signed-candidate-unproven',
  })) fail('R16 domain audit is incomplete.');
  if (!exact(value.reviewGroups, [
    'security-auth-data-integrity',
    'v52-legal-privacy',
    'listing-ai-price-engine',
    'g3-g4-g5-product-boundary',
    'support-operations-privacy',
    'android-build-device-integration',
  ])) fail('R16 reviewer groups are invalid.');
  if (!exact(value.featureTruth, {
    v52SingleItemCore: 'on-binding-checkout-conflicts-with-stage-a',
    g2DiscoverSavedCart: 'on-non-reserving',
    blueOceanListingAssistant: 'default-off-internal-staging-only-when-explicit',
    externalListingAi: 'disabled-manual-fallback',
    g3BookingGroups: 'off-release-mode-lock',
    g4Planner: 'off-release-mode-lock',
    g5SupplyEnrichment: 'off-release-mode-lock',
    g5ListingSets: 'off-release-mode-lock',
    realPayments: 'off',
    analyticsCrashlyticsFcm: 'off',
    supportEvidenceUpload: 'off',
    publicRegistrationAndStore: 'off',
    codexLocalDev: 'disabled-developer-only-not-runtime',
  })) fail('R16 feature truth is invalid.');

  const expectedFindings = [
    ['R16-P0-SEC-HISTORY-001', 'P0', 'owner-action-required-independent-work-continues'],
    ['R16-P1-STAGE-A-BINDING-001', 'P1', 'open-for-r17'],
    ['R16-P1-WAVE0-SURFACE-001', 'P1', 'open-for-r17'],
  ];
  if (!Array.isArray(value.findings) || value.findings.length !== 3) {
    fail('R16 finding set is invalid.');
  }
  expectedFindings.forEach(([id, priority, state], index) => {
    const finding = value.findings[index];
    if (finding?.id !== id || finding.priority !== priority
        || finding.state !== state || finding.r17Eligible !== true) {
      fail(`R16 finding drift: ${id}`);
    }
  });
  if (value.findings[0].rawCredentialInspected !== false
      || value.findings[0].historyRewriteAllowed !== false) {
    fail('R16 secret-history boundary is invalid.');
  }
  if (!exact(value.rollbackMap, {
    beforeMerge: 'leave-draft-unmerged',
    mergeConflict: 'normal-additive-conflict-resolution-commit-and-rerun-no-rebase-force-squash',
    afterFutureMergeBeforeDeploy: 'owner-approved-auditable-merge-revert',
    migration: 'stop-intake-restore-verified-snapshot-or-reviewed-forward-fix',
    candidateDevice: 'stop-lane-preserve-data-no-uninstall-wipe-or-blind-downgrade',
    pilot: 'severity-stop-preserve-minimized-evidence-no-scope-expansion',
  }) || !exact(value.futureMergeProcedure, {
    stepCount: 12,
    requiredOwnerToken: 'PR7_MERGE_APPROVED',
    method: 'normal-merge-commit',
    newCommitInvalidatesReview: true,
    mergeAuthorizesDeployment: false,
  })) fail('R16 rollback or merge procedure is invalid.');

  const githubPassed = value.status === verified;
  if (!exact(value.pilotFreeze, githubPassed ? {
    commit: value.githubVerification?.implementationCommit,
    productChangesAfterFreeze: false,
    pullRequestMerged: false,
    historyRewritten: false,
  } : {
    commit: 'pending-r16-implementation-commit',
    productChangesAfterFreeze: false,
    pullRequestMerged: false,
    historyRewritten: false,
  })) fail('R16 pilot-freeze binding is invalid.');
  if (!exact(value.focusedVerification, {
    wiringTests: 'passed-9',
    artifactValidatorTests: 'passed-8',
    artifactValidator: 'passed',
    fullTechnicalRegression: 'passed-candidate-rollover-ci-metadata-mode',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R16 verification state is invalid.');
  if (githubPassed) {
    const check = value.githubVerification;
    if (!check || !/^[a-f0-9]{40}$/u.test(check.implementationCommit ?? '')
        || !Number.isSafeInteger(check.regressionRunId)
        || check.regressionConclusion !== 'success'
        || !Number.isSafeInteger(check.codeqlRunId)
        || check.codeqlConclusion !== 'success'
        || !Number.isSafeInteger(check.advancedSecurityCheckId)
        || check.advancedSecurityConclusion !== 'success'
        || check.newAlerts !== 0) fail('R16 GitHub verification is invalid.');
  } else if (value.githubVerification !== undefined) {
    fail('R16 cannot bind GitHub verification before exact checks pass.');
  }

  const expectedBoundaries = {
    credentialValueReadOrCopied: false,
    productionChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    cloudChanged: false,
    firebaseChanged: false,
    playOrAppleChanged: false,
    paymentChanged: false,
    providerCalled: false,
    testerContacted: false,
    candidateBuiltOrUploaded: false,
    humanPilotActivated: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    historyRewritten: false,
  };
  if (!exact(value.boundaries, expectedBoundaries) || value.next48hPackage !== 'R17') {
    fail('R16 boundary or next package is invalid.');
  }

  const report = source(repositoryRoot, value.report);
  markers(report, value.report, [
    'HOLD_PR7_DRAFT_UNMERGED', 'Domain audit', 'High-risk review groups',
    'Migration ordering and rollback map', 'Feature-flag truth table',
    'R16-P0-SEC-HISTORY-001', 'R16-P1-STAGE-A-BINDING-001',
    'R16-P1-WAVE0-SURFACE-001', 'Exact future merge procedure',
    'normal **merge commit**', 'No Production, VPS, DNS, Cloud',
  ]);
  const privatePilotConfig = source(
    repositoryRoot, 'lib/config/private_pilot_config.dart',
  );
  if (privatePilotConfig.includes('static const bool bindingCheckoutEnabled = true;')) {
    markers(privatePilotConfig, 'lib/config/private_pilot_config.dart', [
      'static const bool bindingCheckoutEnabled = true;',
    ]);
  } else {
    const r17 = JSON.parse(source(
      repositoryRoot,
      'docs/evidence/48h-remote/r17-two-day-priority-queue-20260825.json',
    ));
    if (r17.kind !== 'sit-48h-r17-two-day-priority-queue'
        || r17.predecessor?.closureHead
          !== 'dda99ed03660c509d3e713799b7001e4e6680b79'
        || r17.findings?.[1]?.id !== 'R16-P1-STAGE-A-BINDING-001'
        || r17.findings?.[1]?.state !== 'resolved-code-and-tests') {
      fail('R16 binding finding changed without an exact R17 supersession.');
    }
    markers(privatePilotConfig, 'lib/config/private_pilot_config.dart', [
      'SIT_STAGE_A_NON_BINDING_PILOT',
      'bindingCheckoutAvailableFor',
      '!stageANonBindingPilot',
    ]);
  }
  for (const path of [
    'lib/config/booking_group_technical_config.dart',
    'lib/config/planner_technical_config.dart',
    'lib/config/supply_enrichment_technical_config.dart',
    'lib/config/listing_sets_technical_config.dart',
  ]) markers(source(repositoryRoot, path), path, [
    'signedStageAInternalEnvelope',
    'technicalSurfaceAvailableFor',
  ]);
  const legal = JSON.parse(source(repositoryRoot, 'assets/legal/de/legal_review_intake_p0b_20260821.json'));
  const g3l = JSON.parse(source(repositoryRoot, 'assets/legal/de/legal_manifest_g3l_draft.json'));
  if (legal.professionallyReviewed !== false || legal.openDecisionKeys?.length !== 18
      || g3l.status !== 'draft-blocked' || g3l.openReviewDecisions?.length !== 14) {
    fail('R16 legal evidence truth drifted.');
  }
  assertSanitized(value);
  return {
    status: value.status,
    decision: 'HOLD_PR7_DRAFT_UNMERGED',
    migrationCount: frozenUp.length,
    findingCount: value.findings.length,
    next48hPackage: value.next48hPackage,
  };
}

function main() {
  const result = validateR16Pr7PilotFreezeIntegrationReview();
  process.stdout.write(
    `R16 PR7 pilot-freeze review valid: decision=${result.decision}, migrations=${result.migrationCount}, findings=${result.findingCount}, status=${result.status}, next=${result.next48hPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
