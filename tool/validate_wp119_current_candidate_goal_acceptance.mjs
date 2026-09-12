#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp119-current-candidate-goal-acceptance-20260912.json';
const rolloverPath = 'store/google-play/rollover-candidate-2026091110.json';
const evidenceBaseHead = '4018de1475e33e4f652a14bc98db7049bb84b06f';
const candidateSourceHead = 'c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b';
const stagingRuntimeHead = 'df39a14b7a19afe467842461a28f1e77fec8445e';
const implementationHead = 'dba36d2f826ee220f4f79ad57d0e984a069322e3';

const expectedStates = new Map([
  ['candidate-provenance-signature-pixel-install', 'PASS'],
  ['exact-staging-backend-health-and-fcm', 'PASS'],
  ['exact-source-local-github-security-baseline', 'PASS'],
  ['two-role-publish-discover-request-accept-chat', 'PASS'],
  ['transactional-push-foreground-background-terminated', 'PASS'],
  ['listing-create-edit-publish-pause-activate-end', 'PASS'],
  ['themes-backgrounds-large-text-and-restart', 'PARTIAL'],
  ['offline-online-process-recovery', 'PASS'],
  ['listing-ai-safe-review-contract', 'PASS'],
  ['staging-support-simulation-lifecycle', 'PARTIAL'],
  ['payment-idempotency-and-uncertain-reconciliation', 'PASS'],
  ['support-report-block', 'PARTIAL'],
  ['email-registration-verification-login-recovery', 'PARTIAL'],
  ['logout-password-session-account-switch-isolation', 'PARTIAL'],
  ['google-signin', 'PARTIAL'],
  ['search-filter-favorites-wishlists', 'PASS'],
  ['offer-request-accept-decline', 'PARTIAL'],
  ['messages-attachments-location-appointments', 'PARTIAL'],
  ['handover-return-cancel-withdrawal-damage', 'PARTIAL'],
  ['reviews-and-invoices', 'PARTIAL'],
  ['privacy-export-and-account-deletion', 'PARTIAL'],
  ['cart-projects-and-booking-groups', 'PARTIAL'],
  ['android-permission-lifecycle', 'PARTIAL'],
  ['facebook-signin', 'OPEN'],
  ['apple-signin', 'OPEN'],
  ['real-image-analysis-listing-proposal', 'PASS'],
  ['stripe-sandbox-payment-refund-simulated-payout', 'OPEN'],
  ['binding-v52-contract-return-damage', 'OPEN'],
  ['manual-talkback-traversal', 'OPEN'],
  ['oneplus-cross-device-two-role', 'OPEN'],
  ['durable-private-registry-pull', 'OPEN'],
  ['historical-support-deadline-recovery', 'OPEN'],
]);

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (actual !== expected) fail(`WP119 ${label} is invalid.`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`commit is not an ancestor of HEAD: ${commit}`);
  }
}

function assertNoRuntimeDriftAtClosure(repositoryRoot) {
  const changed = execFileSync('git', [
    'diff', '--name-only', `${candidateSourceHead}..${implementationHead}`, '--',
    'lib', 'android', 'assets', 'pubspec.yaml', 'pubspec.lock',
    'backend/src', 'backend/sql',
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (changed !== '') fail('runtime paths changed after the candidate source.');
}

export function validateWp119CurrentCandidateGoalAcceptance({
  repositoryRoot = root,
  evidence,
  rollover,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  const current = rollover ?? JSON.parse(readFileSync(resolve(repositoryRoot, rolloverPath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schema version');
  exact(value?.workPackage, 'WP119_CURRENT_CANDIDATE_GOAL_ACCEPTANCE', 'work package');
  exact(value?.status, 'partial-current-candidate-acceptance-external-gates-open', 'status');
  exact(value?.repository?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value?.repository?.evidenceBaseHead, evidenceBaseHead, 'evidence base');
  exact(value?.repository?.candidateSourceHead, candidateSourceHead, 'candidate source');
  exact(value?.repository?.stagingRuntimeHead, stagingRuntimeHead, 'Staging runtime');
  exact(JSON.stringify(value?.repository?.runtimePathsChangedAfterCandidateSource), '[]',
    'runtime drift record');
  exact(value?.repository?.githubRegression?.runId, 34652971429, 'Regression run');
  exact(value?.repository?.githubRegression?.head, evidenceBaseHead, 'Regression head');
  exact(value?.repository?.githubRegression?.conclusion, 'success', 'Regression result');
  exact(value?.repository?.githubCodeql?.runId, 34652971425, 'CodeQL run');
  exact(value?.repository?.githubCodeql?.head, evidenceBaseHead, 'CodeQL head');
  exact(value?.repository?.githubCodeql?.conclusion, 'success', 'CodeQL result');
  exact(value?.repository?.openCodeScanningAlerts, 0, 'open code-scanning alerts');
  exact(value?.repository?.pullRequest7, 'draft-open-clean-unmerged', 'PR boundary');

  exact(value?.wp119Closure?.implementationHead, implementationHead,
    'implementation head');
  exact(value?.wp119Closure?.localFullRegression, 'success',
    'local full Regression result');
  exact(value?.wp119Closure?.githubRegression?.runId, 34688883706,
    'closure Regression run');
  exact(value?.wp119Closure?.githubRegression?.head, implementationHead,
    'closure Regression head');
  exact(value?.wp119Closure?.githubRegression?.conclusion, 'success',
    'closure Regression result');
  exact(value?.wp119Closure?.githubCodeql?.runId, 34688883690,
    'closure CodeQL run');
  exact(value?.wp119Closure?.githubCodeql?.head, implementationHead,
    'closure CodeQL head');
  exact(value?.wp119Closure?.githubCodeql?.conclusion, 'success',
    'closure CodeQL result');
  exact(value?.wp119Closure?.openCodeScanningAlerts, 0,
    'closure open code-scanning alerts');
  exact(value?.wp119Closure?.pullRequest7, 'draft-open-clean-unmerged',
    'closure PR boundary');

  const candidate = value.candidate;
  exact(candidate?.applicationId, 'com.shareittoo.app', 'application ID');
  exact(candidate?.versionName, '1.0.0', 'version name');
  exact(candidate?.versionCode, '2026091110', 'version code');
  exact(candidate?.releaseChannel, 'internal', 'release channel');
  exact(candidate?.environment, 'staging', 'environment');
  exact(candidate?.apkSha256,
    '711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7',
    'APK digest');
  exact(candidate?.aabSha256,
    '20aa73271fb9ce51c33bf4025c6c235424a1f575503261c4021f8b817da0fdfb',
    'AAB digest');
  exact(candidate?.uploadCertificateSha256,
    '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
    'signing certificate');
  exact(candidate?.pixelExactInstalledCandidateMatched, true, 'Pixel installation');
  exact(candidate?.onePlusExactTwoRoleJourney, 'not-run', 'OnePlus result');

  exact(current?.candidate?.artifactSourceHead, candidateSourceHead, 'rollover source');
  exact(current?.candidate?.versionCode, candidate.versionCode, 'rollover version');
  exact(current?.artifact?.apkSha256, candidate.apkSha256, 'rollover APK');
  exact(current?.artifact?.aabSha256, candidate.aabSha256, 'rollover AAB');

  for (const key of ['apiHealthy', 'databaseHealthy', 'fcmEnabled', 'smtpEnabled']) {
    exact(value?.staging?.[key], true, `Staging ${key}`);
  }
  exact(value?.staging?.containerRestartCount, 0, 'Staging restart count');
  exact(value?.staging?.paymentProvider, 'memory', 'Staging payment provider');
  exact(value?.staging?.stripeLivemode, false, 'Stripe live mode');
  exact(value?.staging?.listingAiProvider, 'on_device', 'listing AI provider');
  exact(value?.staging?.externalListingAiEnabled, false, 'external listing AI');

  exact(value?.currentExternalObservations?.stripeConnector,
    'reauthentication-required-before-readback', 'Stripe connector state');
  exact(value?.currentExternalObservations?.onePlusAdb,
    'no-current-authorized-device-proof', 'OnePlus ADB state');
  exact(value?.currentExternalObservations?.professionalV52Snapshots,
    'not-approved', 'V5.2 approval');
  exact(value?.currentExternalObservations?.manualTalkBackTraversal,
    'not-run', 'manual TalkBack state');

  const requirements = value.requirements ?? [];
  exact(requirements.length, expectedStates.size, 'requirement count');
  const seen = new Set();
  const counts = { PASS: 0, PARTIAL: 0, OPEN: 0 };
  for (const requirement of requirements) {
    if (seen.has(requirement?.id) || !expectedStates.has(requirement?.id)) {
      fail('WP119 requirement inventory is invalid.');
    }
    seen.add(requirement.id);
    exact(requirement.state, expectedStates.get(requirement.id), `state ${requirement.id}`);
    if (typeof requirement.evidence !== 'string' || requirement.evidence.trim() === '') {
      fail(`WP119 evidence is missing for ${requirement.id}.`);
    }
    if (requirement.state === 'PASS') {
      exact(requirement.remaining, null, `remaining ${requirement.id}`);
    } else if (typeof requirement.remaining !== 'string' || requirement.remaining.trim() === '') {
      fail(`WP119 remaining action is missing for ${requirement.id}.`);
    }
    counts[requirement.state] += 1;
  }
  exact(seen.size, expectedStates.size, 'unique requirement count');
  exact(value?.aggregate?.passCount, counts.PASS, 'PASS count');
  exact(value?.aggregate?.partialCount, counts.PARTIAL, 'PARTIAL count');
  exact(value?.aggregate?.openCount, counts.OPEN, 'OPEN count');
  exact(value?.aggregate?.totalCount, expectedStates.size, 'total count');
  exact(value?.aggregate?.releaseDecision, 'hold-not-production-ready', 'release decision');

  const inventory = value.sourceInventory ?? [];
  if (inventory.length !== 17 || new Set(inventory.map((entry) => entry.path)).size !== 17) {
    fail('WP119 source inventory is invalid.');
  }
  for (const entry of inventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry?.sha256 ?? '')) {
      fail('WP119 source digest is invalid.');
    }
    exact(sha256(resolve(repositoryRoot, entry.path)), entry.sha256,
      `source digest ${entry.path}`);
  }

  for (const [key, result] of Object.entries(value.boundaries ?? {})) {
    exact(result, false, `boundary ${key}`);
  }
  exact(Object.keys(value.boundaries ?? {}).length, 17, 'boundary count');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu
    .test(serialized)) {
    fail('WP119 evidence contains private or secret-shaped content.');
  }
  if (checkGitState) {
    for (const commit of [
      evidenceBaseHead,
      candidateSourceHead,
      stagingRuntimeHead,
      implementationHead,
    ]) {
      assertAncestor(repositoryRoot, commit);
    }
    assertNoRuntimeDriftAtClosure(repositoryRoot);
  }
  return Object.freeze({
    status: value.status,
    versionCode: candidate.versionCode,
    passCount: counts.PASS,
    partialCount: counts.PARTIAL,
    openCount: counts.OPEN,
  });
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp119CurrentCandidateGoalAcceptance())}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP119 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
