#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp49-current-candidate-external-intervention-map-20260907.json';

const done = [
  'candidate-provenance-signature-pixel-install',
  'full-regression-clean-reproducibility-security',
  'two-role-publish-discover-request-fcm-chat',
  'listing-full-lifecycle',
  'search-details-saved-isolation',
  'cart-projects-idempotency-isolation',
  'attachment-appointment-proposals',
  'email-registration-verification-login-recovery',
  'google-login-online-offline-persistence',
  'password-session-controls-account-deletion',
  'account-help-support-entry-surfaces',
  'themes-large-text-touch-targets-restart',
  'notification-delivery-and-icon',
  'listing-ai-safe-mock-contract',
  'sms-current-candidate-validation-and-cleanup',
  'android-runtime-permission-lifecycle',
];
const partial = [
  'support-current-candidate-read-staff-follow-up',
  'repository-backend-deployment-parity',
];
const open = [
  'manual-talkback-traversal',
  'authorized-positive-address-reveal',
  'support-deadline-owner-action',
  'facebook-apple-provider-gates',
  'real-external-listing-ai',
  'binding-v52-legal-payment-lifecycles',
];
const laneIds = [
  'staging-backend-parity',
  'support-staff-deadline',
  'binding-v52-legal-approval',
  'psp-sandbox-lifecycle',
  'authorized-address-reveal',
  'facebook-apple-provider-gates',
  'listing-ai-runtime-provider',
  'manual-talkback-traversal',
  'same-candidate-play-oneplus-distribution',
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
      fail(`WP49 private field is forbidden: ${[...trail, key].join('.')}`);
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
    fail('WP49 implementation base is not an ancestor of the current checkout.');
  }
}

function candidateProjection(value) {
  return {
    applicationId: value.applicationId,
    versionName: value.versionName,
    buildNumber: value.buildNumber,
    apkSha256: value.apkSha256,
    signingCertificateSha256: value.signingCertificateSha256,
  };
}

function validateSources(repositoryRoot, value) {
  if (!Array.isArray(value.sourceInventory) || value.sourceInventory.length !== 4) {
    fail('WP49 source inventory is incomplete.');
  }
  const sources = value.sourceInventory.map((entry) => {
    if (typeof entry?.path !== 'string' || !/\.json$/u.test(entry.path)
        || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      fail('WP49 source inventory entry is invalid.');
    }
    const bytes = readFileSync(resolve(repositoryRoot, entry.path));
    if (sha256(bytes) !== entry.sha256) fail(`WP49 source hash drift: ${entry.path}`);
    return JSON.parse(bytes.toString('utf8'));
  });
  const expectedCandidate = candidateProjection(value.candidate);
  for (const source of sources) {
    if (!exact(candidateProjection(source.candidate), expectedCandidate)) {
      fail('WP49 source candidate binding has drifted.');
    }
  }
  if (sources[0].acceptance?.doneCount !== 14
      || sources[0].acceptance?.partialCount !== 4
      || sources[0].acceptance?.openCount !== 6
      || sources[1].status !== 'complete-physical-pixel-local-and-github'
      || sources[2].status !== 'complete-pixel-valid-code-cold-restart-and-exact-cleanup'
      || sources[3].status !== 'passed-current-candidate-read-staff-action-blocked-no-mutation') {
    fail('WP49 predecessor closure state is invalid.');
  }
}

export function validateWp49CurrentCandidateExternalInterventionMap({
  repositoryRoot = root,
  evidence,
  checkGitCommit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp49-current-candidate-external-intervention-map'
      || value.status !== 'prepared-hold-external-interventions-required'
      || value.observedOn !== '2026-09-07') {
    fail('WP49 identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    implementationBaseHead: '0ac889bb154aabcd8b06c20359b21df95382fb51',
    verifiedTechnicalHead: '65fc926fa288ae3346514369c602a4b18963e56c',
    githubRegressionRun: 34129245800,
    githubCodeqlRun: 34129245723,
    openCodeScanningAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  })) {
    fail('WP49 repository and exact-CI binding is invalid.');
  }
  if (checkGitCommit) assertAncestor(repositoryRoot, value.repository.implementationBaseHead);

  if (!exact(value.candidate, {
    applicationId: 'com.shareittoo.app',
    versionName: '1.0.0',
    buildNumber: '2026090610',
    candidateSourceHead: '2fd793bac970866aa94a2940f28d6bbc3e04e377',
    releaseChannel: 'internal',
    environment: 'staging',
    delivery: 'direct-apk',
    apkSha256: '07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45',
    signingCertificateSha256: '098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4',
  })) {
    fail('WP49 exact candidate is invalid.');
  }
  validateSources(repositoryRoot, value);

  if (!exact(value.portfolio, {
    done,
    partial,
    open,
    doneCount: 16,
    partialCount: 2,
    openCount: 6,
    totalCount: 24,
    pixelAcceptance: 'partial',
  })) {
    fail('WP49 24-area acceptance portfolio is invalid or overstated.');
  }

  if (!Array.isArray(value.externalRunway) || value.externalRunway.length !== laneIds.length) {
    fail('WP49 external runway is incomplete.');
  }
  const observedIds = value.externalRunway.map((lane) => lane.id);
  if (!exact(observedIds, laneIds)) fail('WP49 external runway order has drifted.');
  const knownIds = new Set(laneIds);
  value.externalRunway.forEach((lane, index) => {
    if (lane.priority !== index + 1
        || !['partial', 'partial-and-open', 'open', 'outside-current-pixel-scope'].includes(lane.classification)
        || !Array.isArray(lane.covers)
        || !Array.isArray(lane.dependencies)
        || lane.externalReady !== false
        || lane.safeToExecuteAutomaticallyNow !== false
        || typeof lane.requiredGate !== 'string' || lane.requiredGate.length < 8
        || typeof lane.ownerPresenceRequired !== 'string' || lane.ownerPresenceRequired.length < 2
        || typeof lane.closureEvidence !== 'string' || lane.closureEvidence.length < 12
        || typeof lane.rollback !== 'string' || lane.rollback.length < 12) {
      fail(`WP49 external runway lane is invalid: ${lane?.id ?? index}`);
    }
    for (const dependency of lane.dependencies) {
      if (!knownIds.has(dependency) || laneIds.indexOf(dependency) >= index) {
        fail(`WP49 external runway dependency is invalid: ${lane.id}`);
      }
    }
  });
  const covered = new Set(value.externalRunway.flatMap((lane) => lane.covers));
  for (const area of [...partial, ...open]) {
    if (!covered.has(area)) fail(`WP49 unresolved acceptance area has no runway lane: ${area}`);
  }
  if (!exact(value.aggregate, {
    runwayLaneCount: 9,
    externallyReadyLaneCount: 0,
    automaticallyExecutableLaneCount: 0,
    nextLane: 'staging-backend-parity',
    releaseDecision: 'hold-no-go',
  })) {
    fail('WP49 aggregate gate state is invalid.');
  }
  if (value.boundaries === null
      || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP49 cannot claim an external mutation, activation, device action or merge.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP49 evidence contains private or secret-shaped content.');
  }

  return Object.freeze({
    status: value.status,
    candidateBuild: value.candidate.buildNumber,
    doneCount: value.portfolio.doneCount,
    partialCount: value.portfolio.partialCount,
    openCount: value.portfolio.openCount,
    runwayLaneCount: value.externalRunway.length,
    externallyReadyLaneCount: value.aggregate.externallyReadyLaneCount,
    nextLane: value.aggregate.nextLane,
    releaseDecision: value.aggregate.releaseDecision,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) fail(`Unknown argument: ${process.argv[2]}`);
    const result = validateWp49CurrentCandidateExternalInterventionMap();
    process.stdout.write(
      `WP49 intervention map valid: candidate=${result.candidateBuild}, `
      + `portfolio=${result.doneCount}/${result.partialCount}/${result.openCount}, `
      + `lanes=${result.runwayLaneCount}, externalReady=${result.externallyReadyLaneCount}, `
      + `next=${result.nextLane}, decision=${result.releaseDecision}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'WP49 intervention map validation failed.'}\n`);
    process.exitCode = 1;
  }
}
