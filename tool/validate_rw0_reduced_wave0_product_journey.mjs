#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';
import { readHistoricalRepositoryFile } from './read_historical_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/48h-remote/rw0-reduced-wave0-product-journey-20260825.json';
const inventorySnapshotHead = '9fd6b6023b124e7c7efd9aff518a8c7d61a304a0';

const sourcePaths = [
  'backend/ops/secret_scan_history_baseline.json',
  'lib/services/data_service.dart',
  'lib/screens/search_results_screen.dart',
  'lib/screens/wishlists_screen.dart',
  'scripts/technical_regression_check.sh',
  'docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json',
  'test/data_service_non_destructive_catalog_bootstrap_test.dart',
  'test/g2a_rental_cart_screen_test.dart',
  'test/g2b_rental_cart_persistence_test.dart',
  'test/reduced_wave0_product_journey_test.dart',
  'test/public_profile_screen_logic_test.dart',
  'test/review_metrics_service_test.dart',
  'test/tool/rw0_reduced_wave0_journey_wiring.test.mjs',
  'store/privacy-disclosures.json',
  'store/retention-deletion-readiness.json',
  'tool/validate_active_infrastructure_mail_provider_readiness.mjs',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `RW0 source ${path}` });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function markers(content, path, expected) {
  for (const marker of expected) {
    if (!content.includes(marker)) fail(`RW0 marker missing in ${path}: ${marker}`);
  }
}

function assertSanitized(value) {
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('RW0 evidence contains private or secret-shaped material.');
  }
}

export function validateRw0ReducedWave0ProductJourney({
  repositoryRoot = root,
  evidence,
  sourceTexts = {},
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-and-flutter-suite-passed-full-technical-regression-pending',
    'implemented-full-technical-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-rw0-reduced-wave0-product-journey'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== '4937a88ff07dd6378e1c52ca4f264e564a669ef4') {
    fail('RW0 evidence identity is invalid.');
  }
  if (!exact(value.predecessor, {
    package: 'R17',
    evidence: 'docs/evidence/48h-remote/r17-two-day-priority-queue-20260825.json',
    closureHead: '4937a88ff07dd6378e1c52ca4f264e564a669ef4',
  })) fail('RW0 predecessor binding is invalid.');

  if (!exact(value.scope, {
    allowed: [
      'listing-draft-and-explicit-local-publication',
      'search',
      'project-and-saved',
      'non-reserving-cart',
      'structured-feedback',
      'restart-and-failure-recovery',
    ],
    excluded: [
      'rental-request-and-contract',
      'accept-or-reject',
      'payment-refund-payout',
      'handover-return-damage-needs-review',
      'g3-g4-g5-release-surfaces',
    ],
    syntheticOnly: true,
    localDeviceOnly: true,
  })) fail('RW0 scope is invalid.');

  const expectedFindings = [
    'RW0-P1-CATALOG-BOOTSTRAP-001',
    'RW0-P1-DEMO-RESEED-002',
    'RW0-P1-CART-ATOMICITY-003',
    'RW0-P1-DIALOG-LIFECYCLE-004',
    'RW0-P2-SEARCH-A11Y-005',
    'RW0-P1-SECRET-SCAN-FIXTURE-006',
  ];
  if (!Array.isArray(value.findings)
      || !exact(value.findings.map(({ id }) => id), expectedFindings)
      || value.findings.some(({ state, resolution }) =>
        state !== 'resolved-and-tested' || typeof resolution !== 'string' || !resolution)) {
    fail('RW0 finding set is invalid.');
  }

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  const expectedVerification = {
    flutterAnalyze: 'passed-zero-issues',
    defaultFlutterSuite: 'passed-400-two-documented-profile-skips',
    exactReducedWave0Profile: 'passed-1',
    catalogIntegrityTests: 'passed-5',
    cartFocusedTests: 'passed-7',
    rw0WiringTests: 'passed-7',
    privacyRetentionTests: 'passed-70',
    privacyValidator: 'passed-draft-not-approval',
    retentionValidator: 'passed-draft-execution-blocked',
    fullTechnicalRegression: fullPassed ? 'passed' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  };
  if (!exact(value.verification, expectedVerification)) {
    fail('RW0 verification truth is invalid.');
  }

  if (githubPassed) {
    const github = value.githubVerification;
    if (!github
        || !/^[a-f0-9]{40}$/u.test(github.head ?? '')
        || !Number.isSafeInteger(github.regressionRunId)
        || !Number.isSafeInteger(github.codeqlRunId)
        || github.regressionConclusion !== 'success'
        || github.codeqlConclusion !== 'success'
        || github.openCodeScanningAlerts !== 0) {
      fail('RW0 exact GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('RW0 GitHub verification must be absent before exact CI passes.');
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
    fail('RW0 gate or boundary truth is invalid.');
  }

  if (!Array.isArray(value.sourceInventory)
      || value.sourceInventory.length !== sourcePaths.length
      || !exact(value.sourceInventory.map(({ path }) => path), sourcePaths)) {
    fail('RW0 source inventory paths are invalid.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`RW0 source hash is invalid: ${entry.path}`);
    }
    const text = readHistoricalRepositoryFile(repositoryRoot, inventorySnapshotHead, entry.path, {
      sourceTexts, label: 'RW0 source-binding snapshot',
    });
    if (sha256(text) !== entry.sha256) {
      fail(`RW0 source inventory hash is stale: ${entry.path}`);
    }
  }

  markers(source(repositoryRoot, value.architecture), value.architecture, [
    'Exact surface matrix',
    'Excluded surface proof',
    'Red-first findings closed',
    'No candidate, Pixel, tester, provider',
  ]);
  markers(source(repositoryRoot, value.report), value.report, [
    '400 passed, two documented profile skips',
    'full technical regression',
    'R17_GITGUARDIAN_HISTORY_REVIEW_COMPLETE',
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
  const result = validateRw0ReducedWave0ProductJourney();
  process.stdout.write(`RW0 reduced Wave-0 product journey valid: ${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
