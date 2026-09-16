#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp127-current-candidate-portfolio-convergence-20260912.json';
const rolloverPath = 'store/google-play/current-rollover-candidate.json';
const predecessorHead = 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b';
const candidateHead = '1546812f625b4e8f1e700bf976410097cd45ac2f';
const candidateFreezeHead = 'f9c4c9523eb0f4dfcdb03d34516795a91e0bcbdd';
const portfolioBaseHead = 'd68770b95554183e531b46b93d55eccb723d1844';
const stagingRuntimeHead = 'df39a14b7a19afe467842461a28f1e77fec8445e';
const wp127ClosureHead = '66df6b1f3501f3920192c6e73609d441070f65b0';
const runtimeRoots = [
  'lib',
  'android',
  'assets',
  'pubspec.yaml',
  'pubspec.lock',
  'backend/src',
  'backend/sql',
];
const expectedChangedPaths = [
  'lib/config/private_pilot_config.dart',
  'lib/screens/notification_settings_screen.dart',
  'lib/services/backend_realtime_service.dart',
  'lib/services/backend_repository.dart',
  'lib/services/firebase_runtime.dart',
  'lib/services/firebase_service_preferences.dart',
  'lib/services/local_principal_scope.dart',
  'lib/widgets/foreground_push_host.dart',
  'pubspec.yaml',
];

const expectedRequirements = new Map([
  ['candidate-provenance-signature-pixel-install', ['PASS', 'fresh-current-candidate']],
  ['exact-staging-backend-health-and-fcm', ['PASS', 'fresh-current-candidate']],
  ['exact-source-local-github-security-baseline', ['PASS', 'fresh-current-candidate']],
  ['two-role-publish-discover-request-accept-chat', ['PASS', 'transferred-after-exact-delta-review']],
  ['transactional-push-foreground-background-terminated', ['PASS', 'fresh-current-candidate']],
  ['listing-create-edit-publish-pause-activate-end', ['PASS', 'transferred-after-exact-delta-review']],
  ['themes-backgrounds-large-text-and-restart', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['offline-online-process-recovery', ['PASS', 'transferred-after-exact-delta-review']],
  ['listing-ai-safe-review-contract', ['PASS', 'transferred-after-exact-delta-review']],
  ['staging-support-simulation-lifecycle', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['payment-idempotency-and-uncertain-reconciliation', ['PASS', 'transferred-after-exact-delta-review']],
  ['support-report-block', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['email-registration-verification-login-recovery', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['logout-password-session-account-switch-isolation', ['PASS', 'promoted-by-wp120-and-exact-delta-review']],
  ['google-signin', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['search-filter-favorites-wishlists', ['PASS', 'transferred-after-exact-delta-review']],
  ['offer-request-accept-decline', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['messages-attachments-location-appointments', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['handover-return-cancel-withdrawal-damage', ['PARTIAL', 'retained-partial-external-gate']],
  ['reviews-and-invoices', ['PARTIAL', 'retained-partial-external-gate']],
  ['privacy-export-and-account-deletion', ['PARTIAL', 'retained-partial-no-new-proof']],
  ['cart-projects-and-booking-groups', ['PARTIAL', 'retained-partial-external-gate']],
  ['android-permission-lifecycle', ['PARTIAL', 'retained-partial-affected-surface']],
  ['facebook-signin', ['OPEN', 'retained-open-provider-gate']],
  ['apple-signin', ['OPEN', 'retained-open-provider-gate']],
  ['real-image-analysis-listing-proposal', ['PASS', 'transferred-after-exact-delta-review']],
  ['stripe-sandbox-payment-refund-simulated-payout', ['OPEN', 'retained-open-provider-gate']],
  ['binding-v52-contract-return-damage', ['OPEN', 'retained-open-legal-gate']],
  ['manual-talkback-traversal', ['OPEN', 'retained-open-human-gate']],
  ['oneplus-cross-device-two-role', ['OPEN', 'retained-open-device-unavailable']],
  ['durable-private-registry-pull', ['OPEN', 'retained-open-infrastructure-gate']],
  ['historical-support-deadline-recovery', ['OPEN', 'retained-open-staff-gate']],
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP127 ${label} is invalid.`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP127 head is not an ancestor of HEAD: ${head}`);
  }
}

function gitOutput(repositoryRoot, args, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function sourceAtHead(repositoryRoot, head, path, encoding = 'buffer') {
  try {
    return gitOutput(repositoryRoot, ['show', `${head}:${path}`], encoding);
  } catch {
    fail(`WP127 historical source is unavailable: ${path}`);
  }
}

function validateRepository(repositoryRoot, value, checkGitState) {
  exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    predecessorCandidateSourceHead: predecessorHead,
    candidateSourceHead: candidateHead,
    candidateFreezeHead,
    portfolioBaseHead,
    stagingRuntimeHead,
    runtimePathsChangedAfterCandidateSourceToPortfolioBase: [],
  }, 'repository identity');
  if (!checkGitState) return;
  for (const head of [
    predecessorHead,
    candidateHead,
    candidateFreezeHead,
    portfolioBaseHead,
    stagingRuntimeHead,
  ]) {
    assertAncestor(repositoryRoot, head);
  }
  const drift = gitOutput(repositoryRoot, [
    'diff', '--name-only', `${candidateHead}..${portfolioBaseHead}`, '--',
    ...runtimeRoots,
  ]).trim();
  if (drift !== '') fail('WP127 runtime changed after the candidate source.');
}

function validateRuntimeDelta(repositoryRoot, value, checkGitState) {
  const delta = value.runtimeDelta;
  exact(delta?.fromVersionCode, '2026091110', 'delta predecessor version');
  exact(delta?.toVersionCode, '2026091201', 'delta candidate version');
  exact(delta?.changedPaths, expectedChangedPaths, 'runtime delta path inventory');
  exact(delta?.binaryPatchSha256,
    '6cc52c587c0bfc15ddc0e7206bf2e7398211bb453c101a1fe66e749bcd6a2f21',
    'runtime delta digest');
  exact(delta?.classification,
    'push-registration-recovery-principal-ownership-and-version-only',
    'runtime delta classification');
  exact(delta?.sharedFilesReviewedAtSymbolLevel, true, 'shared-file review');
  exact(delta?.unrelatedFeatureBehaviorInheritedWithoutReview, false,
    'unreviewed inheritance boundary');
  if (!checkGitState) return;
  const changed = gitOutput(repositoryRoot, [
    'diff', '--name-only', `${predecessorHead}..${candidateHead}`, '--',
    ...runtimeRoots,
  ]).trim().split('\n').filter(Boolean);
  exact(changed, expectedChangedPaths, 'Git runtime delta');
  const patch = gitOutput(repositoryRoot, [
    'diff', '--binary', `${predecessorHead}..${candidateHead}`, '--',
    ...runtimeRoots,
  ], 'buffer');
  exact(sha256(patch), delta.binaryPatchSha256, 'Git runtime delta digest');
}

function validateCandidate(value, rollover) {
  exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026091201',
    releaseChannel: 'internal',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    apkSha256: 'a8bfda4c1a0e7302b2528db8edfbe1318e88322023f65588da032220a24badd4',
    aabSha256: '81c204fd65d83a0403d203b606328880acb0787d076093240efab87d00575399',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    pixelExactInstalledCandidateMatched: true,
    onePlusCurrentAvailability: 'disconnected-owner-took-device',
  }, 'candidate identity');
  if (rollover?.candidate?.applicationId !== value.candidate.applicationId
      || rollover?.candidate?.versionName !== value.candidate.versionName
      || rollover?.candidate?.versionCode !== value.candidate.versionCode
      || rollover?.candidate?.artifactSourceHead !== candidateHead
      || rollover?.candidate?.releaseChannel !== value.candidate.releaseChannel
      || rollover?.candidate?.apiBaseUrl !== value.candidate.apiBaseUrl
      || rollover?.artifact?.apkSha256 !== value.candidate.apkSha256
      || rollover?.artifact?.aabSha256 !== value.candidate.aabSha256
      || rollover?.artifact?.uploadCertificateSha256
        !== value.candidate.uploadCertificateSha256
      || rollover?.deviceVerification?.preferredDeviceExactApkInstalled !== true
      || rollover?.deviceVerification?.secondaryDevice
        !== 'not-required-while-oneplus-disconnected') {
    fail('WP127 current candidate pointer is not exact.');
  }
}

function validateVerification(value) {
  exact(value.verification, {
    wp126PortfolioBaseRegression: {
      runId: 34705532395,
      headSha: portfolioBaseHead,
      conclusion: 'success',
      cleanCheckoutConclusion: 'success',
    },
    wp126PortfolioBaseCodeql: {
      runId: 34705532322,
      headSha: portfolioBaseHead,
      conclusion: 'success',
    },
    openBranchCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-clean-mergeable-unmerged',
    localFullRegression: 'success',
    portfolioValidator: 'success',
  }, 'verification contract');
  exact(value.staging, {
    apiHealthyAtBoundReadback: true,
    databaseHealthyAtBoundReadback: true,
    containerRestartCountAtBoundReadback: 0,
    fcmExactCandidatePhysicalDelivery: true,
    smtpEnabledAtBoundReadback: true,
    paymentProvider: 'memory',
    stripeLivemode: false,
    listingAiProvider: 'on_device',
    externalListingAiEnabled: false,
  }, 'Staging contract');
}

function validateRequirements(value) {
  const requirements = value.requirements ?? [];
  exact(requirements.length, expectedRequirements.size, 'requirement count');
  const seen = new Set();
  const counts = { PASS: 0, PARTIAL: 0, OPEN: 0 };
  for (const requirement of requirements) {
    const expected = expectedRequirements.get(requirement?.id);
    if (!expected || seen.has(requirement.id)) {
      fail('WP127 requirement inventory is invalid.');
    }
    seen.add(requirement.id);
    exact([requirement.state, requirement.basis], expected,
      `classification ${requirement.id}`);
    if (typeof requirement.evidence !== 'string' || requirement.evidence.trim() === '') {
      fail(`WP127 evidence is missing for ${requirement.id}.`);
    }
    if (requirement.state === 'PASS') {
      exact(requirement.remaining, null, `remaining action ${requirement.id}`);
    } else if (typeof requirement.remaining !== 'string'
        || requirement.remaining.trim() === '') {
      fail(`WP127 remaining action is missing for ${requirement.id}.`);
    }
    counts[requirement.state] += 1;
  }
  exact(seen.size, expectedRequirements.size, 'unique requirement count');
  exact(value.aggregate, {
    passCount: counts.PASS,
    partialCount: counts.PARTIAL,
    openCount: counts.OPEN,
    totalCount: expectedRequirements.size,
    changeFromWp119: 'one-auth-session-requirement-promoted-from-partial-to-pass',
    releaseDecision: 'hold-not-production-ready',
  }, 'aggregate');
  exact(counts, { PASS: 12, PARTIAL: 12, OPEN: 8 }, 'classification totals');
  exact(value.transferPolicy?.freshCurrentCandidateRequirementIds, [
    'candidate-provenance-signature-pixel-install',
    'exact-staging-backend-health-and-fcm',
    'exact-source-local-github-security-baseline',
    'transactional-push-foreground-background-terminated',
  ], 'fresh-current inventory');
  exact(value.transferPolicy?.promotedAfterExactDeltaReviewRequirementIds, [
    'logout-password-session-account-switch-isolation',
  ], 'promotion inventory');
  exact(value.transferPolicy?.promotionsFromWp119, 1, 'promotion count');
  exact(value.transferPolicy?.overclaimOnUncertainTransfer, false,
    'uncertain-transfer boundary');
  if (typeof value.transferPolicy?.rule !== 'string'
      || value.transferPolicy.rule.trim() === '') {
    fail('WP127 transfer rule is missing.');
  }
}

function validateSourcesAndBoundaries(repositoryRoot, value) {
  const inventory = value.sourceInventory ?? [];
  if (inventory.length !== 15
      || new Set(inventory.map((entry) => entry.path)).size !== 15) {
    fail('WP127 source inventory is invalid.');
  }
  for (const entry of inventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry?.sha256 ?? '')) {
      fail('WP127 source digest is invalid.');
    }
    exact(sha256(sourceAtHead(repositoryRoot, wp127ClosureHead, entry.path)), entry.sha256,
      `source digest ${entry.path}`);
  }
  const expectedNext = [
    'exact-current-pixel-theme-background-large-text-and-permission-replay',
    'exact-current-email-registration-recovery-google-and-privacy-replay',
    'exact-current-support-report-block-and-decline-location-replay',
    'stripe-test-mode-owner-gate-and-sandbox-lifecycle',
    'professional-v52-and-human-talkback-owner-gates',
    'oneplus-only-after-future-explicit-reconnection',
  ];
  exact(value.nextExecutionOrder, expectedNext, 'next execution order');
  const boundaries = value.boundaries ?? {};
  exact(Object.keys(boundaries).length, 18, 'boundary count');
  for (const [key, actual] of Object.entries(boundaries)) {
    exact(actual, false, `boundary ${key}`);
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu
    .test(serialized)) {
    fail('WP127 evidence contains private or secret-shaped content.');
  }
}

export function validateWp127CurrentCandidatePortfolioConvergence({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const pointer = rollover ?? JSON.parse(
    sourceAtHead(repositoryRoot, wp127ClosureHead, rolloverPath, 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp127-current-candidate-portfolio-convergence'
      || value.status !== 'partial-current-candidate-acceptance-external-gates-open'
      || value.capturedOn !== '2026-09-12') {
    fail('WP127 evidence identity is invalid.');
  }
  validateRepository(repositoryRoot, value, checkGitState);
  validateRuntimeDelta(repositoryRoot, value, checkGitState);
  validateCandidate(value, pointer);
  validateVerification(value);
  validateRequirements(value);
  validateSourcesAndBoundaries(repositoryRoot, value);
  return Object.freeze({
    status: value.status,
    versionCode: value.candidate.versionCode,
    passCount: value.aggregate.passCount,
    partialCount: value.aggregate.partialCount,
    openCount: value.aggregate.openCount,
    onePlus: value.candidate.onePlusCurrentAvailability,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp127CurrentCandidatePortfolioConvergence(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP127 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
