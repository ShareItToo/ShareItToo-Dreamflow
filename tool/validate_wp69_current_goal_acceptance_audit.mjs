#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp69-current-goal-acceptance-audit-20260909.json';

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
  'support-report-block',
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
  'docs/evidence/release-readiness/wp49-current-candidate-external-intervention-map-20260907.json',
  'docs/evidence/release-readiness/wp64-staging-security-parity-and-pixel-candidate-20260909.json',
  'docs/evidence/release-readiness/wp66-payment-provider-integrity-and-candidate-20260909.json',
  'docs/evidence/release-readiness/wp67-staging-pixel-cross-device-runway-20260909.json',
  'docs/evidence/release-readiness/wp68-staging-support-lifecycle-20260909.json',
];

const changedMobilePaths = [
  'lib/config/private_pilot_config.dart',
  'lib/screens/payment_checkout_screen.dart',
  'pubspec.yaml',
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

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|tokenvalue|email|phonenumber|accountid|credentialvalue|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`WP69 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP69 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function gitChangedPaths(repositoryRoot, from, to, pathspecs) {
  return execFileSync('git', ['diff', '--name-only', `${from}..${to}`, '--', ...pathspecs], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim().split('\n').filter(Boolean);
}

function validateSourceInventory(repositoryRoot, value) {
  if (!Array.isArray(value.sourceInventory)
      || !exact(value.sourceInventory.map((entry) => entry.path), sourcePaths)) {
    fail('WP69 source inventory is incomplete or reordered.');
  }
  const sources = value.sourceInventory.map((entry) => {
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      fail(`WP69 source hash is invalid: ${entry.path}`);
    }
    const bytes = readFileSync(resolve(repositoryRoot, entry.path));
    if (sha256(bytes) !== entry.sha256) fail(`WP69 source hash drift: ${entry.path}`);
    return JSON.parse(bytes.toString('utf8'));
  });
  if (sources[0].portfolio?.doneCount !== 16
      || sources[1].candidate?.versionCode !== '2026090902'
      || sources[2].candidate?.versionCode !== '2026090904'
      || sources[3].pixel?.installedVersion !== '1.0.0+2026090904'
      || sources[4].support?.recipientReadback !== 'passed') {
    fail('WP69 predecessor evidence does not retain the required closure facts.');
  }
}

function validateLineage(repositoryRoot, value, checkGitLineage) {
  if (!exact(value.lineage, {
    broadPhysicalBaselineSourceHead: '2055a5c508689596c0f776c2cdf38b54f7e106c3',
    changedMobilePathsBeforeCurrentCandidate: changedMobilePaths,
    mobileOrBackendRuntimePathsChangedAfterCurrentCandidate: [],
    olderEvidencePromotionRule:
      'only-when-relevant-runtime-paths-are-unchanged-and-current-candidate-counterproof-is-absent',
  })) {
    fail('WP69 candidate lineage contract is invalid.');
  }
  if (!checkGitLineage) return;
  const preCandidate = gitChangedPaths(
    repositoryRoot,
    value.lineage.broadPhysicalBaselineSourceHead,
    value.repository.candidateSourceHead,
    ['lib', 'android', 'pubspec.yaml', 'pubspec.lock'],
  );
  if (!exact(preCandidate, changedMobilePaths)) {
    fail('WP69 pre-candidate mobile lineage has drifted.');
  }
  // This is a historical audit: it proves the state at its own verified
  // package head, not that no later candidate can legitimately change runtime.
  const afterCandidate = gitChangedPaths(
    repositoryRoot,
    value.repository.candidateSourceHead,
    value.packageVerification.packageHead,
    ['lib', 'android', 'pubspec.yaml', 'pubspec.lock', 'backend/src', 'backend/sql'],
  );
  if (!exact(afterCandidate, [])) {
    fail('WP69 runtime paths changed after the current candidate.');
  }
}

function validateRequirements(value) {
  if (!Array.isArray(value.requirements)) fail('WP69 requirements are missing.');
  const expected = [
    ...pass.map((id) => ({ id, state: 'PASS' })),
    ...partial.map((id) => ({ id, state: 'PARTIAL' })),
    ...open.map((id) => ({ id, state: 'OPEN' })),
  ];
  const actual = value.requirements.map(({ id, state }) => ({ id, state }));
  if (!exact(actual, expected)) fail('WP69 requirement state or order is overstated or incomplete.');
  for (const requirement of value.requirements) {
    if (typeof requirement.evidence !== 'string' || requirement.evidence.length < 24) {
      fail(`WP69 requirement evidence is missing: ${requirement.id}`);
    }
    if (requirement.state === 'PASS' && requirement.remaining !== null) {
      fail(`WP69 PASS requirement retains a remaining condition: ${requirement.id}`);
    }
    if (requirement.state !== 'PASS'
        && (typeof requirement.remaining !== 'string' || requirement.remaining.length < 24)) {
      fail(`WP69 unresolved requirement lacks an exact remaining condition: ${requirement.id}`);
    }
  }
  if (!exact(value.aggregate, {
    passCount: pass.length,
    partialCount: partial.length,
    openCount: open.length,
    totalCount: pass.length + partial.length + open.length,
    pixelStagingAssessment: 'nearly-testable-core-open-provider-legal-and-cross-device-gates',
    releaseDecision: 'hold-not-production-ready',
  })) {
    fail('WP69 aggregate is invalid or promotes release readiness.');
  }
}

export function validateWp69CurrentGoalAcceptanceAudit({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp69-current-goal-acceptance-audit'
      || value.status !== 'complete-local-github'
      || value.capturedOn !== '2026-09-09') {
    fail('WP69 identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    auditBaseHead: '6e21a49ca183ec6fc8dca3489aeaa3b32abf98ed',
    candidateSourceHead: '12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0',
    stagingRuntimeHead: '78c663248aec089b08d19fd0fb40a9a63f19408b',
    sourceEvidenceHead: 'b10528a15e4061dc528087d41297976f07bef3e0',
    sourceEvidenceGithubRegressionRun: 34328892643,
    sourceEvidenceGithubCodeqlRun: 34328892603,
    sourceEvidenceOpenPrMergeAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) {
    fail('WP69 repository binding is invalid.');
  }
  if (!exact(value.packageVerification, {
    packageHead: '1f09df3e000047d03198163d34c10d077926e559',
    fullLocalRegression: 'passed',
    localToolTestsPassed: 2504,
    githubRegressionRun: 34333546679,
    githubCodeqlRun: 34333546716,
    openPrMergeAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) {
    fail('WP69 package verification binding is invalid.');
  }
  if (checkGitState) {
    for (const commit of [
      value.packageVerification.packageHead,
      value.repository.auditBaseHead,
      value.repository.candidateSourceHead,
      value.repository.stagingRuntimeHead,
      value.repository.sourceEvidenceHead,
    ]) assertAncestor(repositoryRoot, commit);
  }
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090904',
    releaseChannel: 'internal',
    environment: 'staging',
    apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
    apkSha256: '8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4',
    aabSha256: 'fcc6c36055a978ffb3c70761f2630d942c8e65ac30c9600f3963be48b7d56696',
    uploadCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    pixelInstalledAndMatched: true,
    onePlusInstalledAndMatched: false,
  })) {
    fail('WP69 exact candidate binding is invalid.');
  }

  validateSourceInventory(repositoryRoot, value);
  validateLineage(repositoryRoot, value, checkGitState);
  validateRequirements(value);

  if (!exact(value.currentObservations, {
    pixelAdbAuthorized: true,
    onePlusAdbVisible: false,
    stagingSupportNoncriticalOverdue: 2,
    paymentTransport: 'memory',
    stripeLivemode: false,
    listingAiProvider: 'mock',
    listingAiExternalExecution: false,
    playInternalCurrentCandidateUploaded: false,
  })) {
    fail('WP69 current external observations are invalid.');
  }
  if (!exact(value.nextSafePackage, {
    id: 'WP70',
    name: 'current-candidate-auth-safety-and-hold-revalidation',
    scope:
      'Replay exact-candidate e-mail/auth/session plus report-block and visible payment-provider hold on Pixel without provider traffic, money, legal binding or external account mutation.',
    ownerInteractionRequired: 'only-if-an-official-provider-or-owner-code-step-is-reached',
    externalMutationAllowed: false,
  })) {
    fail('WP69 next safe package is invalid.');
  }
  if (value.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP69 boundary falsely records an external or sensitive mutation.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP69 evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    passCount: value.aggregate.passCount,
    partialCount: value.aggregate.partialCount,
    openCount: value.aggregate.openCount,
    nextPackage: value.nextSafePackage.id,
    releaseDecision: value.aggregate.releaseDecision,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateWp69CurrentGoalAcceptanceAudit();
    process.stdout.write(
      `WP69 acceptance audit valid: candidate=${result.candidateVersionCode}, `
      + `portfolio=${result.passCount}/${result.partialCount}/${result.openCount}, `
      + `next=${result.nextPackage}, decision=${result.releaseDecision}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP69 acceptance audit validation failed.'}\n`);
    process.exitCode = 1;
  }
}
