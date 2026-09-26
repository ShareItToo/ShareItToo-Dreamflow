#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw6-local-operational-record-authorization-truth-recovery-20260825.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'lib/models/message.dart',
  'lib/screens/booking_detail_screen.dart',
  'lib/screens/message_thread_screen.dart',
  'lib/screens/messages_screen.dart',
  'lib/screens/notifications_screen.dart',
  'lib/screens/ongoing_owner_detail_screen.dart',
  'lib/screens/privacy_info_screen.dart',
  'lib/services/account_deletion_service.dart',
  'lib/services/data_service.dart',
  'lib/services/notification_cta_resolver.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'tool/validate_active_infrastructure_mail_provider_readiness.mjs',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'scripts/technical_regression_check.sh',
  'test/data_service_booking_rules_test.dart',
  'test/invoices_service_rules_test.dart',
  'test/notification_cta_resolver_test.dart',
  'test/qa_seed_smoke_test.dart',
  'test/review_prompt_sheet_logic_test.dart',
  'test/rw6_local_operational_authorization_truth_recovery_test.dart',
  'test/secure_booking_confirmation_test.dart',
  'test/shared_message_thread_sync_test.dart',
  'test/support/test_builders.dart',
  'test/tool/booking_detail_handover_return_async_context_wiring.test.mjs',
  'test/tool/rw6_local_operational_authorization_truth_recovery_wiring.test.mjs',
  'test/tool/validate_rw6_local_operational_authorization_truth_recovery.test.mjs',
  'docs/compliance/g2l-g2-data-lifecycle-2026-08-20.md',
  'docs/architecture/rw6-local-operational-record-authorization-truth-recovery-2026-08-25.md',
  'docs/operations/RW6_LOCAL_OPERATIONAL_RECORD_AUTHORIZATION_TRUTH_RECOVERY_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW6 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function markers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`RW6 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW6 evidence contains private or secret-shaped material.');
  }
}

export function validateRw6LocalOperationalAuthorizationTruthRecovery({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-matrix-passed-full-technical-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind
        !== 'sit-rw6-local-operational-record-authorization-truth-recovery'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== 'ddce25d34c40477ad0fdb9718ac570e3a31334b7') {
    fail('RW6 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW5',
    evidence:
      'docs/evidence/48h-remote/rw5-local-safety-privacy-principal-isolation-20260825.json',
    verifiedImplementationHead: '2dfb487cd3b4f4ebd59d184f1a5186f1da455672',
    closureCommit: 'ddce25d34c40477ad0fdb9718ac570e3a31334b7',
  })) fail('RW6 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'matching-auth-session-required-for-operational-state',
      'participant-scoped-message-request-timeline-and-handover-records',
      'current-user-only-thread-deletion-tombstone',
      'account-attributed-notifications-and-unassigned-legacy-quarantine',
      'strict-corruption-preservation-and-fail-closed-reads',
      'bounded-capacity-rejection-without-pruning',
      'serialized-verified-session-rechecked-mutations',
      'opaque-principal-booking-selection-isolation',
      'current-account-and-participant-privacy-export',
      'scoped-account-deletion-with-shared-record-retention',
      'account-transition-safe-communication-ui',
      'synthetic-deterministic-local-regression',
    ],
    excluded: [
      'binding-request-contract-quote-and-acceptance',
      'payment-refund-payout-and-real-money',
      'handover-return-damage-and-needs-review-decisions',
      'production-backend-schema-authority-and-live-infrastructure',
      'provider-ai-candidate-device-store-pilot-merge-and-history-gates',
    ],
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
    silentCapacityPruningAllowed: false,
  })) fail('RW6 scope or deterministic-test policy is invalid.');

  const findingIds = [
    'RW6-P0-STALE-PROFILE-AUTHORIZATION-001',
    'RW6-P0-FOREIGN-OPERATIONAL-ID-ACCESS-002',
    'RW6-P0-TWO-PARTY-THREAD-DELETION-003',
    'RW6-P0-LEGACY-NOTIFICATION-MISATTRIBUTION-004',
    'RW6-P0-CORRUPT-TO-EMPTY-REWRITE-005',
    'RW6-P0-SILENT-HISTORY-PRUNING-006',
    'RW6-P0-LOST-UPDATE-CONCURRENCY-007',
    'RW6-P0-BOOKING-SELECTION-CROSS-PRINCIPAL-008',
    'RW6-P0-PRIVACY-EXPORT-DELETION-SCOPE-009',
    'RW6-P1-HANDOVER-HELPER-FOREIGN-ACCESS-010',
    'RW6-P1-SESSION-CHANGE-DURING-ASYNC-WORK-011',
    'RW6-P1-STALE-COMMUNICATION-UI-012',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW6 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.focusedRw6Flutter !== 'passed-19'
      || value.verification?.combinedOperationalFlutter !== 'passed-99'
      || !['pending', 'passed'].includes(
        value.verification?.adjacentAccountBookingFlutter,
      )
      || !['pending', 'passed'].includes(
        value.verification?.lifecyclePrivacyRetention,
      )
      || !['pending', 'passed'].includes(value.verification?.rw6WiringTests)
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW6 verification truth is invalid.');
  }
  if (fullPassed
      && (value.verification.adjacentAccountBookingFlutter !== 'passed'
        || value.verification.lifecyclePrivacyRetention !== 'passed'
        || value.verification.rw6WiringTests !== 'passed'
        || !/^[a-f0-9]{40}$/u.test(value.implementationHead ?? ''))) {
    fail('RW6 full-pass evidence is incomplete.');
  }
  if (!fullPassed && value.implementationHead !== undefined) {
    fail('RW6 implementation head must be absent before the full pass.');
  }

  if (githubPassed) {
    const github = value.githubVerification;
    if (!github
        || github.head !== value.implementationHead
        || !Number.isSafeInteger(github.regressionRunId)
        || !Number.isSafeInteger(github.codeqlRunId)
        || github.regressionConclusion !== 'success'
        || github.codeqlConclusion !== 'success'
        || github.openCodeScanningAlerts !== 0) {
      fail('RW6 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW6 GitHub verification must be absent before exact CI passes.');
  }

  if (!exact(value.gates, {
    BUILD_READY: 'not-granted',
    PLAY_UPLOAD_APPROVED: 'not-granted',
    HUMAN_PILOT_ACTIVATED: 'not-granted',
    PR7_MERGE_APPROVED: 'not-granted',
    R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE: 'not-granted',
  }) || Object.values(value.boundaries ?? {}).length !== 16
      || !Object.values(value.boundaries).every((entry) => entry === false)) {
    fail('RW6 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW6 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW6 source hash is invalid: ${entry.path}`);
    }
    const content = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW6 source-binding snapshot',
    });
    if (sha256(content) !== entry.sha256) {
      fail(`RW6 source inventory hash is stale: ${entry.path}`);
    }
  }

  markers(source(repositoryRoot, value.architecture), value.architecture, [
    'Authorization and session boundary',
    'Thread deletion is current-user-only',
    'exact existing raw value is preserved',
    'There is no sleep, retry loop',
  ]);
  markers(source(repositoryRoot, value.report), value.report, [
    'Focused RW6 result: 19 passed',
    'passes 99 checks',
    'silent pruning is forbidden',
    'historical GitGuardian',
  ]);
  assertSanitized(value);

  return {
    status: value.status,
    allowedSurfaces: value.scope.allowed.length,
    excludedSurfaces: value.scope.excluded.length,
    resolvedFindings: value.findings.length,
    fullTechnicalRegression: value.verification.fullTechnicalRegression,
  };
}

function main() {
  const result = validateRw6LocalOperationalAuthorizationTruthRecovery();
  process.stdout.write(
    `RW6 local operational authorization evidence valid: ${JSON.stringify(result)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
