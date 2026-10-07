#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw5-local-safety-privacy-principal-isolation-20260825.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';
const sourcePaths = [
  'lib/services/local_principal_scope.dart',
  'lib/services/local_safety_privacy_service.dart',
  'lib/services/blocked_users_service.dart',
  'lib/services/listing_feedback_service.dart',
  'lib/services/user_reports_service.dart',
  'lib/services/messages_settings_service.dart',
  'lib/services/notification_preferences_service.dart',
  'lib/services/auth_service.dart',
  'lib/services/data_service.dart',
  'lib/services/shared_persistence_sync.dart',
  'lib/services/account_deletion_service.dart',
  'lib/screens/privacy_info_screen.dart',
  'lib/screens/blocked_users_screen.dart',
  'lib/screens/explore_screen.dart',
  'lib/screens/messages_screen.dart',
  'lib/screens/message_thread_screen.dart',
  'lib/widgets/messages_settings_sheet.dart',
  'lib/screens/notification_settings_screen.dart',
  'lib/screens/notifications_screen.dart',
  'store/g2-data-lifecycle.json',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'tool/validate_g2_data_lifecycle.mjs',
  'tool/validate_privacy_disclosures.mjs',
  'tool/validate_retention_deletion_readiness.mjs',
  'scripts/technical_regression_check.sh',
  'test/rw5_local_safety_privacy_principal_isolation_test.dart',
  'test/messages_notification_settings_test.dart',
  'test/user_reports_harassment_guard_test.dart',
  'test/tool/validate_g2_data_lifecycle.test.mjs',
  'test/tool/validate_privacy_disclosures.test.mjs',
  'test/tool/validate_retention_deletion_readiness.test.mjs',
  'test/tool/rw4_reduced_wave0_local_principal_isolation_wiring.test.mjs',
  'docs/architecture/rw5-local-safety-privacy-principal-isolation-2026-08-25.md',
  'docs/operations/RW5_LOCAL_SAFETY_PRIVACY_PRINCIPAL_ISOLATION_2026-08-25.md',
];

const fail = (message) => { throw new Error(message); };
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);
const source = (repositoryRoot, path) =>
  readRepositoryFile(repositoryRoot, path, { label: `RW5 source ${path}` });
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function assertMarkers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) {
      fail(`RW5 marker missing in ${path}: ${marker}`);
    }
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW5 evidence contains private or secret-shaped material.');
  }
}

export function validateRw5LocalSafetyPrivacyPrincipalIsolation({
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
      || value.kind !== 'sit-rw5-local-safety-privacy-principal-isolation'
      || !statuses.includes(value.status)
      || value.implementationBaseHead
        !== 'bed1e8923a82b745050a6c421ac12c77eacf1e42') {
    fail('RW5 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'RW4',
    evidence:
      'docs/evidence/48h-remote/rw4-reduced-wave0-local-principal-isolation-20260825.json',
    verifiedImplementationHead: 'f11335b74b88365a4f42c0bc748966d9b58d85d7',
    closureCommit: 'bed1e8923a82b745050a6c421ac12c77eacf1e42',
  })) {
    fail('RW5 predecessor binding is invalid.');
  }

  if (!exact(value.scope, {
    allowed: [
      'opaque-principal-scoped-blocked-users',
      'opaque-principal-scoped-local-user-reports',
      'opaque-principal-scoped-listing-feedback-and-hidden-state',
      'opaque-principal-scoped-muted-message-threads',
      'opaque-principal-scoped-message-settings',
      'opaque-principal-scoped-notification-preferences',
      'guest-only-and-exact-owner-legacy-migration-or-quarantine',
      'bucket-local-corruption-quarantine-and-closed-ui',
      'current-principal-export-and-confirmed-deletion',
      'bounded-serialized-local-principal-registry',
      'immediate-session-transition-refresh',
    ],
    excluded: [
      'binding-request-contract-and-acceptance',
      'payment-refund-and-payout',
      'handover-return-damage-and-needs-review',
      'physical-device-and-candidate',
      'live-provider-ai-pilot-and-release',
    ],
    syntheticOnly: true,
    localOnly: true,
    timingWorkaroundAllowed: false,
    testParallelismReductionAllowed: false,
  })) {
    fail('RW5 scope or deterministic-test policy is invalid.');
  }

  const findingIds = [
    'RW5-P0-BLOCKED-USERS-CROSS-PRINCIPAL-001',
    'RW5-P0-REPORTS-CROSS-PRINCIPAL-002',
    'RW5-P0-DISCOVERY-PROFILE-CROSS-PRINCIPAL-003',
    'RW5-P0-COMMUNICATION-STATE-CROSS-PRINCIPAL-004',
    'RW5-P0-LEGACY-MISATTRIBUTION-005',
    'RW5-P0-EXPORT-DELETION-SCOPE-006',
    'RW5-P1-IDENTIFIER-DISCLOSURE-007',
    'RW5-P1-SESSION-TRANSITION-008',
    'RW5-P1-CORRUPTION-QUARANTINE-009',
    'RW5-P1-BOUNDED-REGISTRY-010',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), findingIds)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested'
          || typeof resolution !== 'string'
          || !resolution)) {
    fail('RW5 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (value.verification?.changedFileAnalyze !== 'passed-zero-issues'
      || value.verification?.focusedRw5Flutter !== 'passed-12'
      || value.verification?.safetyPrivacyAdjacentFlutter
        !== 'passed-37-one-skipped'
      || !['pending', 'passed'].includes(
        value.verification?.lifecyclePrivacyRetention,
      )
      || !['pending', 'passed'].includes(value.verification?.rw5WiringTests)
      || value.verification?.fullTechnicalRegression
        !== (fullPassed ? 'passed' : 'pending')
      || value.verification?.githubRegression
        !== (githubPassed ? 'passed' : 'pending')
      || value.verification?.githubCodeql
        !== (githubPassed ? 'passed-no-new-alerts' : 'pending')) {
    fail('RW5 verification truth is invalid.');
  }
  if (fullPassed
      && (value.verification.lifecyclePrivacyRetention !== 'passed'
        || value.verification.rw5WiringTests !== 'passed'
        || !/^[a-f0-9]{40}$/u.test(value.implementationHead ?? ''))) {
    fail('RW5 full-pass evidence is incomplete.');
  }
  if (!fullPassed && value.implementationHead !== undefined) {
    fail('RW5 implementation head must be absent before the full pass.');
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
      fail('RW5 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW5 GitHub verification must be absent before exact CI passes.');
  }

  const expectedGates = {
    BUILD_READY: 'not-granted',
    PLAY_UPLOAD_APPROVED: 'not-granted',
    HUMAN_PILOT_ACTIVATED: 'not-granted',
    PR7_MERGE_APPROVED: 'not-granted',
    R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE: 'not-granted',
  };
  if (!exact(value.gates, expectedGates)
      || Object.values(value.boundaries ?? {}).length !== 16
      || !Object.values(value.boundaries).every((entry) => entry === false)) {
    fail('RW5 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW5 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW5 source hash is invalid: ${entry.path}`);
    }
    const content = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW5 source-binding snapshot',
    });
    if (sha256(content) !== entry.sha256) {
      fail(`RW5 source inventory hash is stale: ${entry.path}`);
    }
  }

  assertMarkers(
    source(repositoryRoot, value.architecture),
    value.architecture,
    [
      'Principal transition policy',
      'guest-only compatibility inputs',
      'current-principal snapshot',
      'No sleep, retry loop',
    ],
  );
  assertMarkers(source(repositoryRoot, value.report), value.report, [
    'Focused RW5 result: 12 passed',
    'passes 37 checks',
    'without a delay',
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
  const result = validateRw5LocalSafetyPrivacyPrincipalIsolation();
  process.stdout.write(
    `RW5 local safety/privacy principal isolation evidence valid: ${JSON.stringify(result)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
