#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp85-current-candidate-gate-reconciliation-20260910.json';

const sourcePaths = [
  'docs/evidence/release-readiness/wp73-stripe-sandbox-compatibility-inventory-20260909.json',
  'docs/evidence/release-readiness/wp74-dispute-transfer-recovery-20260909.json',
  'docs/evidence/release-readiness/wp75-current-candidate-pixel-staging-20260909.json',
  'docs/evidence/release-readiness/wp79-current-candidate-acceptance-matrix-20260909.json',
  'docs/evidence/release-readiness/wp83-current-candidate-pixel-auth-session-replay-20260910.json',
  'docs/evidence/release-readiness/wp84-staging-compose-override-persistence-20260910.json',
];

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
      fail(`WP85 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function read(repositoryRoot, path) {
  return readFileSync(resolve(repositoryRoot, path));
}

function validateSources(repositoryRoot, value, sourceTexts) {
  if (!exact(value.sourceInventory?.map((entry) => entry.path), sourcePaths)) {
    fail('WP85 source inventory is incomplete or reordered.');
  }
  const records = value.sourceInventory.map((entry) => {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      fail(`WP85 source hash is invalid: ${entry.path}`);
    }
    const bytes = Object.prototype.hasOwnProperty.call(sourceTexts ?? {}, entry.path)
      ? Buffer.from(sourceTexts[entry.path])
      : read(repositoryRoot, entry.path);
    if (sha256(bytes) !== entry.sha256) fail(`WP85 source hash drift: ${entry.path}`);
    return JSON.parse(bytes.toString('utf8'));
  });
  if (records[0].ownerGate?.id !== 'WP73_STRIPE_READONLY_REAUTH_REQUIRED'
      || records[1].status !== 'complete-local-github'
      || records[2].candidate?.versionCode !== '2026090905'
      || records[2].pixel?.twoRoleJourney?.terminatedProcessFcm !== 'passed'
      || records[3].candidate?.versionCode !== '2026090905'
      || records[4].status !== 'partial-owner-email-link-confirmation-pending'
      || records[4].emailRegistration?.ownerConfirmationRequired !== true
      || records[5].status !== 'complete-local-correction-remote-rollout-held'
      || records[5].readOnlyObservation?.reproducibleFromPersistentRemoteFiles !== false) {
    fail('WP85 predecessor evidence no longer proves the reconciliation facts.');
  }
}

function validateRequirements(value) {
  const expected = [
    ...pass.map((id) => ({ id, state: 'PASS' })),
    ...partial.map((id) => ({ id, state: 'PARTIAL' })),
    ...open.map((id) => ({ id, state: 'OPEN' })),
  ];
  const actual = value.requirements?.map(({ id, state }) => ({ id, state }));
  if (!exact(actual, expected)) fail('WP85 requirement state or order is incomplete or overstated.');
  for (const requirement of value.requirements) {
    if (typeof requirement.evidence !== 'string' || requirement.evidence.length < 32) {
      fail(`WP85 requirement evidence is too weak: ${requirement.id}`);
    }
    if (requirement.state === 'PASS' && requirement.remaining !== null) {
      fail(`WP85 PASS requirement retains a condition: ${requirement.id}`);
    }
    if (requirement.state !== 'PASS'
        && (typeof requirement.remaining !== 'string' || requirement.remaining.length < 32)) {
      fail(`WP85 unresolved requirement lacks an exact remaining condition: ${requirement.id}`);
    }
  }
}

export function validateWp85CurrentCandidateGateReconciliation({
  repositoryRoot = root,
  evidence,
  sourceTexts,
  checkSources = true,
} = {}) {
  const value = evidence ?? JSON.parse(read(repositoryRoot, evidencePath).toString('utf8'));
  inspectPrivateShape(value);
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp85-current-candidate-gate-reconciliation'
      || value.status !== 'complete-evidence-reconciled-owner-gates-open'
      || value.capturedOn !== '2026-09-10') {
    fail('WP85 identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    matrixHead: '9d58d7ec7a72ff2da44093a23e978a391a07b64b',
    githubRegressionRun: 34439905295,
    githubCodeqlRun: 34439905287,
    openCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-clean-unmerged',
  })) fail('WP85 repository binding is invalid.');
  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    versionCode: '2026090905',
    candidateSourceHead: 'e1c182ea496f013989863155c13bfda649255a7e',
    stagingRuntimeHead: 'baf9267c8bff7533230f3234c1f543649df6e4aa',
    environment: 'staging',
    releaseChannel: 'internal',
    pixelInstalledAndMatched: true,
    onePlusTouched: false,
  })) fail('WP85 candidate binding is invalid.');
  if (!exact(value.reconciliation, {
    wp83AuthSession: 'partial-owner-email-link-confirmation-pending',
    wp84RemoteReproducibility: 'local-correction-complete-rollout-and-readback-held',
    stripeReadOnlyAccess: 'reauthentication-required',
    providerScope: 'google-previously-accepted-facebook-and-apple-disabled',
    liveMoney: false,
    production: false,
  })) fail('WP85 reconciliation truth is invalid.');
  validateRequirements(value);
  if (!exact(value.aggregate, {
    passCount: pass.length,
    partialCount: partial.length,
    openCount: open.length,
    totalCount: pass.length + partial.length + open.length,
    pixelStagingAssessment: 'current-core-proven-owner-email-and-external-gates-open',
    releaseDecision: 'hold-not-production-ready',
  })) fail('WP85 aggregate is invalid or promotes release readiness.');
  if (!exact(value.nextActions, [
    {
      id: 'OWNER_EMAIL_LINK_CONFIRMATION',
      scope: 'Owner opens the normal ShareItToo Staging verification link without sharing it; Codex then resumes the exact Pixel login, cold-start and recovery replay.',
      delegatedToCodex: false,
    },
    {
      id: 'WP73_STRIPE_READONLY_REAUTH_REQUIRED',
      scope: 'Owner reauthenticates the official Stripe connector before any read-only sandbox inventory or test-money workflow.',
      delegatedToCodex: false,
    },
    {
      id: 'STAGING_PERSISTENT_COMPOSE_OVERRIDE_ROLLOUT_AND_READBACK',
      scope: 'An exact-commit Staging rollout followed by read-only proof is required before remote reproducibility can be called closed.',
      delegatedToCodex: false,
    },
  ])) fail('WP85 next-action boundary is invalid.');
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP85 boundary falsely records a mutation or sensitive data.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP85 evidence contains private or secret-shaped content.');
  }
  if (checkSources) validateSources(repositoryRoot, value, sourceTexts);
  return Object.freeze({
    status: value.status,
    candidateVersionCode: value.candidate.versionCode,
    passCount: value.aggregate.passCount,
    partialCount: value.aggregate.partialCount,
    openCount: value.aggregate.openCount,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp85CurrentCandidateGateReconciliation();
    process.stdout.write(
      `WP85 gate reconciliation valid: candidate=${result.candidateVersionCode}, `
      + `portfolio=${result.passCount}/${result.partialCount}/${result.openCount}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP85 reconciliation validation failed.'}\n`);
    process.exitCode = 1;
  }
}
