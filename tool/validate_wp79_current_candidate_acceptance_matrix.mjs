#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp79-current-candidate-acceptance-matrix-20260909.json';

const pass = [
  'candidate-provenance-signature-pixel-install',
  'exact-staging-backend-health-and-fcm',
  'exact-source-local-github-security-baseline',
  'two-role-publish-discover-request-accept-chat',
  'transactional-push-foreground-background-terminated',
  'listing-create-edit-publish-pause-activate-end',
  'themes-backgrounds-large-text-and-restart',
  'offline-online-process-recovery',
  'listing-ai-safe-mock-review-contract',
  'staging-support-simulation-lifecycle',
  'payment-idempotency-and-uncertain-reconciliation',
  'support-report-block',
];

const partial = [
  'email-registration-verification-login-recovery',
  'logout-password-session-account-switch-isolation',
  'google-signin',
  'search-filter-favorites-wishlists',
  'offer-request-accept-decline',
  'messages-attachments-location-appointments',
  'handover-return-cancel-withdrawal-damage',
  'reviews-and-invoices',
  'privacy-export-and-account-deletion',
  'cart-projects-and-booking-groups',
  'android-permission-lifecycle',
];

const open = [
  'facebook-signin',
  'apple-signin',
  'real-image-analysis-listing-proposal',
  'stripe-sandbox-payment-refund-simulated-payout',
  'binding-v52-contract-return-damage',
  'manual-talkback-traversal',
  'oneplus-cross-device-two-role',
  'durable-private-registry-pull',
  'historical-support-deadline-recovery',
];

const sourcePaths = [
  'docs/evidence/release-readiness/wp70-current-candidate-auth-safety-hold-20260909.json',
  'docs/evidence/release-readiness/wp71-current-candidate-account-deletion-20260909.json',
  'docs/evidence/release-readiness/wp72-current-candidate-report-block-20260909.json',
  'docs/evidence/release-readiness/wp73-stripe-sandbox-compatibility-inventory-20260909.json',
  'docs/evidence/release-readiness/wp74-dispute-transfer-recovery-20260909.json',
  'docs/evidence/release-readiness/wp75-current-candidate-pixel-staging-20260909.json',
  'docs/evidence/release-readiness/wp77-public-legal-staging-source-mismatch-20260909.json',
  'docs/evidence/release-readiness/wp78-v53-operator-aligned-legal-draft-20260909.json',
];

const candidateRuntimePaths = [
  'backend/sql/migrations/072_dispute_transfer_recovery.down.sql',
  'backend/sql/migrations/072_dispute_transfer_recovery.up.sql',
  'backend/src/app.js',
  'backend/src/payment_domain.js',
  'backend/src/payment_workflow.js',
  'backend/src/privacy_export.js',
  'backend/src/retention_inventory.js',
  'backend/src/stripe_provider.js',
  'lib/config/private_pilot_config.dart',
  'pubspec.yaml',
];

const currentSourceRuntimePathsAfterCandidate = [
  'assets/legal/de/legal_manifest_v53.json',
  'assets/legal/de/operator_readiness_draft_20260909.json',
  'assets/legal/de/v53/part_a_platform_terms.html',
  'assets/legal/de/v53/part_b_private_rental_terms.html',
  'assets/legal/de/v53/part_c_cancellation_refund.html',
  'assets/legal/de/v53/part_d_handover_return_damage.html',
  'assets/legal/de/v53/part_e_payment_payout.html',
  'assets/legal/de/v53/part_f_community_safety.html',
  'assets/legal/de/v53/part_g_reporting_moderation_review.html',
  'assets/legal/de/v53/part_h_privacy.html',
  'assets/legal/de/v53/part_i_imprint_withdrawal_shorttexts.html',
  'backend/src/operational_readiness_gate.js',
  'lib/config/draft_operator_config.dart',
  'lib/screens/legal_imprint_screen.dart',
  'lib/screens/legal_privacy_screen.dart',
  'lib/screens/legal_terms_screen.dart',
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function source(repositoryRoot, path) {
  return readFileSync(resolve(repositoryRoot, path));
}

function git(repositoryRoot, args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP79 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|tokenvalue|email|phonenumber|accountid|credentialvalue|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`WP79 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function validateSources(repositoryRoot, value) {
  if (!Array.isArray(value.sourceInventory)
      || !exact(value.sourceInventory.map((entry) => entry.path), sourcePaths)) {
    fail('WP79 source inventory is incomplete or reordered.');
  }
  const records = value.sourceInventory.map((entry) => {
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      fail(`WP79 source hash is invalid: ${entry.path}`);
    }
    const bytes = source(repositoryRoot, entry.path);
    if (sha256(bytes) !== entry.sha256) fail(`WP79 source hash drift: ${entry.path}`);
    return JSON.parse(bytes.toString('utf8'));
  });
  if (records[0].candidate?.versionCode !== '2026090904'
      || records[1].candidate?.versionCode !== '2026090904'
      || records[2].candidate?.versionCode !== '2026090904'
      || records[3].ownerGate?.id !== 'WP73_STRIPE_READONLY_REAUTH_REQUIRED'
      || records[4].status !== 'complete-local-github'
      || records[5].candidate?.versionCode !== '2026090905'
      || records[5].pixel?.twoRoleJourney?.terminatedProcessFcm !== 'passed'
      || records[6].status !== 'blocked-fail-closed-no-remote-mutation'
      || records[7].status !== 'draft-only-complete-public-commercial-no-go') {
    fail('WP79 predecessor evidence does not retain its required facts.');
  }
}

function validateCandidateDelta(repositoryRoot, value, checkGitState) {
  const expected = {
    predecessorSourceHead: '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0',
    changedRuntimePaths: candidateRuntimePaths,
    mobileDelta: 'version-metadata-only',
    appRouteDelta: 'payment-recovery-health-only',
    inheritanceRule:
      'predecessor-proof-is-promoted-only-when-the-requirement-route-is-outside-the-verified-delta-and-no-current-observation-contradicts-it',
  };
  if (!exact(value.candidateDelta, expected)) fail('WP79 candidate delta contract is invalid.');
  if (!checkGitState) return;
  const changed = git(repositoryRoot, [
    'diff', '--name-only',
    `${value.candidateDelta.predecessorSourceHead}..${value.repository.candidateSourceHead}`,
    '--', 'backend/sql', 'backend/src', 'lib', 'android', 'pubspec.yaml', 'pubspec.lock',
  ]).trim().split('\n').filter(Boolean);
  if (!exact(changed, candidateRuntimePaths)) fail('WP79 candidate runtime delta drifted.');
  const constrained = git(repositoryRoot, [
    'diff', '--unified=0',
    `${value.candidateDelta.predecessorSourceHead}..${value.repository.candidateSourceHead}`,
    '--', 'backend/src/app.js', 'lib/config/private_pilot_config.dart', 'pubspec.yaml',
  ]);
  for (const marker of [
    'payments.recoveryPending === 0',
    'payments.recoveryNeedsReview === 0',
    "defaultValue: '1.0.0+2026090905'",
    'version: 1.0.0+2026090905',
  ]) {
    if (!constrained.includes(marker)) fail(`WP79 constrained delta marker missing: ${marker}`);
  }
  for (const forbidden of [
    '/v1/auth/register', '/v1/auth/login', '/v1/reports', '/v1/blocks',
  ]) {
    if (constrained.includes(forbidden)) fail(`WP79 predecessor route changed: ${forbidden}`);
  }
}

function validateCurrentSourceCandidateParity(repositoryRoot, value, checkGitState) {
  if (!exact(value.currentSourceCandidateParity, {
    strictLocalCandidateRegression: 'refused-current-source-runtime-drift',
    currentSourceRuntimePathsAfterCandidate,
    currentSourceMayNotBeClaimedAsInstalledCandidate: true,
    resolution: 'build-and-verify-a-new-signed-candidate-before-promoting-current-source-runtime-behavior',
  })) fail('WP79 current-source candidate parity is invalid.');
  if (!checkGitState) return;
  const changed = git(repositoryRoot, [
    'diff', '--name-only', `${value.repository.candidateSourceHead}..${value.repository.matrixBaseHead}`,
    '--', 'backend/src', 'lib', 'assets', 'android', 'pubspec.yaml', 'pubspec.lock',
  ]).trim().split('\n').filter(Boolean);
  if (!exact(changed, currentSourceRuntimePathsAfterCandidate)) {
    fail('WP79 current source parity drifted.');
  }
}

function validateCurrentSourceCiMetadataRegression(value) {
  if (!exact(value.localCurrentSourceCiMetadataRegression, {
    status: 'passed',
    mode: 'candidate-rollover-ci-metadata-only',
    meaning: 'The current source passes the full local quality gate without claiming that it is the installed signed candidate.',
    coverage: [
      'backend-and-deterministic-tests',
      'flutter-analyzer-and-tests',
      'web-wasm-and-loopback-smoke',
      'android-debug-build-minsdk-and-capacity',
    ],
  })) fail('WP79 current-source CI-metadata regression is invalid or overclaims candidate identity.');
}

function validateRequirements(value) {
  const expected = [
    ...pass.map((id) => ({ id, state: 'PASS' })),
    ...partial.map((id) => ({ id, state: 'PARTIAL' })),
    ...open.map((id) => ({ id, state: 'OPEN' })),
  ];
  const actual = value.requirements?.map(({ id, state }) => ({ id, state }));
  if (!exact(actual, expected)) fail('WP79 requirement state or order is incomplete or overstated.');
  for (const requirement of value.requirements) {
    if (typeof requirement.evidence !== 'string' || requirement.evidence.length < 32) {
      fail(`WP79 requirement evidence is too weak: ${requirement.id}`);
    }
    if (requirement.state === 'PASS' && requirement.remaining !== null) {
      fail(`WP79 PASS requirement retains a condition: ${requirement.id}`);
    }
    if (requirement.state !== 'PASS'
        && (typeof requirement.remaining !== 'string' || requirement.remaining.length < 32)) {
      fail(`WP79 unresolved requirement lacks an exact remaining condition: ${requirement.id}`);
    }
  }
  if (!exact(value.aggregate, {
    passCount: pass.length,
    partialCount: partial.length,
    openCount: open.length,
    totalCount: pass.length + partial.length + open.length,
    pixelStagingAssessment: 'current-core-closed-provider-legal-and-cross-device-gates-open',
    releaseDecision: 'hold-not-production-ready',
  })) fail('WP79 aggregate is invalid or promotes release readiness.');
}

export function validateWp79CurrentCandidateAcceptanceMatrix({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath).toString('utf8'));
  inspectPrivateShape(value);
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp79-current-candidate-acceptance-matrix'
      || value.status !== 'complete-current-source-github'
      || value.capturedOn !== '2026-09-09') fail('WP79 identity is invalid.');
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    matrixBaseHead: '96015c57f22ed4575f0730142d1d5fe935ad5228',
    candidateSourceHead: 'e1c182ea496f013989863155c13bfda649255a7e',
    stagingRuntimeHead: 'baf9267c8bff7533230f3234c1f543649df6e4aa',
    githubRegressionRun: 34404447706,
    githubCodeqlRun: 34404447740,
    openCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) fail('WP79 repository binding is invalid.');
  if (checkGitState) {
    for (const commit of [
      value.repository.matrixBaseHead,
      value.repository.candidateSourceHead,
      value.repository.stagingRuntimeHead,
    ]) assertAncestor(repositoryRoot, commit);
  }
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090905',
    releaseChannel: 'internal',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    apkSha256: '1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6',
    aabSha256: 'ed3d5e5af99a6577e09afc96a880ac4ca7c9c0bd86c54bcaa3f5a07fd6255295',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    pixelInstalledAndMatched: true,
    onePlusInstalledAndMatched: false,
  })) fail('WP79 candidate binding is invalid.');
  if (!exact(value.staging, {
    runtimeHealthy: true,
    database: 'ok',
    mail: 'ok',
    fcm: 'enabled-staging-only',
    paymentTransport: 'memory',
    stripeLivemode: false,
    listingAiProvider: 'mock',
    externalListingAiExecution: false,
    readiness: 'degraded-only-by-two-noncritical-support-deadlines',
  })) fail('WP79 Staging state is invalid.');
  validateSources(repositoryRoot, value);
  validateCandidateDelta(repositoryRoot, value, checkGitState);
  validateCurrentSourceCandidateParity(repositoryRoot, value, checkGitState);
  validateCurrentSourceCiMetadataRegression(value);
  validateRequirements(value);
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP79 boundary falsely records a mutation or sensitive data.');
  }
  if (!exact(value.nextSafePackage, {
    id: 'WP80',
    name: 'successor-candidate-parity-preflight',
    scope: 'Establish whether the current source can become a new signed Internal Staging candidate with an exact Staging-runtime binding; do not deploy, upload or mutate any external service until that proof is complete.',
    externalMutationAllowed: false,
  })) fail('WP79 next safe package is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP79 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    passCount: value.aggregate.passCount,
    partialCount: value.aggregate.partialCount,
    openCount: value.aggregate.openCount,
    nextPackage: value.nextSafePackage.id,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateWp79CurrentCandidateAcceptanceMatrix();
    process.stdout.write(
      `WP79 acceptance matrix valid: candidate=${result.candidateVersionCode}, `
      + `portfolio=${result.passCount}/${result.partialCount}/${result.openCount}, next=${result.nextPackage}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP79 acceptance matrix validation failed.'}\n`);
    process.exitCode = 1;
  }
}
