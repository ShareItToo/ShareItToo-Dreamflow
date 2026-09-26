#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidencePath =
  'docs/evidence/release-readiness/wp165-staging-readiness-drift-20260916.json';
const observedBackendCommit = 'df39a14b7a19afe467842461a28f1e77fec8445e';

// These are the exact source contracts that produce the observed read-only
// readiness result. They are read from the recorded commit, never from HEAD.
export const requiredSourceBindings = Object.freeze({
  'backend/ops/validate_staging_deployment_readiness.mjs':
    '08683c727320caac0f0627d9f333f40babf49a9dc29acab1b525e388aef7b1e2',
  'backend/src/app.js':
    '2069237feef16476743bd9d2670cb392ea69c845267d88b7a32f4dffa35aab18',
  'backend/src/config.js':
    '90922f999317f81e466f6d120a4655d775587552e52d2004372e36687ad73966',
  'backend/src/support_deadline_watchdog.js':
    'd5039cc509ca004406e5bf83f48697afb5acc1e0b0d56fab351b36359d1b8813',
});

function fail(message) {
  throw new Error(`WP165 ${message}`);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} is not the recorded WP165 value.`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(repositoryRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`recorded backend commit or source path is unavailable: ${args.join(' ')}`);
  }
}

function assertCommit(repositoryRoot, commit) {
  if (!/^[0-9a-f]{40}$/u.test(commit)) fail('recorded backend commit is invalid.');
  const type = git(repositoryRoot, ['cat-file', '-t', commit]).toString('utf8').trim();
  if (type !== 'commit') fail('recorded backend commit does not resolve to a commit.');
}

function validateSourceBindings(repositoryRoot, commit, sourceBindings) {
  exact(
    Object.keys(sourceBindings ?? {}).sort(),
    Object.keys(requiredSourceBindings).sort(),
    'required source inventory',
  );
  for (const [path, expectedHash] of Object.entries(requiredSourceBindings)) {
    exact(sourceBindings[path], expectedHash, `recorded source hash ${path}`);
    const type = git(repositoryRoot, ['cat-file', '-t', `${commit}:${path}`])
      .toString('utf8').trim();
    if (type !== 'blob') fail(`required source file is not a regular Git blob: ${path}`);
    const bytes = git(repositoryRoot, ['show', `${commit}:${path}`]);
    exact(sha256(bytes), expectedHash, `source hash at recorded commit ${path}`);
  }
}

function validateBoundaries(value) {
  const boundaries = value?.boundaries;
  if (!boundaries || typeof boundaries !== 'object' || Array.isArray(boundaries)) {
    fail('boundary inventory is missing.');
  }
  if (Object.values(boundaries).some((entry) => entry !== false)) {
    fail('WP165 evidence claims an external or production mutation.');
  }
}

export function validateWp165StagingReadinessCommitBinding({
  repositoryRoot = root,
  evidence,
  sourceBindings = requiredSourceBindings,
} = {}) {
  const value = evidence
    ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  exact(value?.schemaVersion, 1, 'schemaVersion');
  exact(value?.kind, 'sit-wp165-staging-readiness-drift', 'kind');
  exact(value?.status, 'blocked-by-one-noncritical-support-followup', 'status');
  exact(value?.capturedOn, '2026-09-16', 'capturedOn');
  exact(value?.environment, 'staging', 'environment');

  const runtime = value?.runtime;
  exact(runtime?.commit, observedBackendCommit, 'recorded backend commit');
  exact(runtime?.version, '0.1.0-df39a14b7a19', 'runtime version');
  exact(runtime?.versionEndpointHttp, 200, 'version endpoint');
  exact(runtime?.liveHealthHttp, 200, 'live health endpoint');
  exact(runtime?.readyHealthHttp, 503, 'ready health endpoint');
  assertCommit(repositoryRoot, runtime.commit);
  validateSourceBindings(repositoryRoot, runtime.commit, sourceBindings);

  exact(value?.readiness, {
    status: 'degraded',
    database: 'ok',
    mail: 'ok',
    notificationsPending: 0,
    notificationsDead: 0,
    paymentTransport: 'memory',
    stripeLivemode: false,
    paymentPending: 0,
    paymentFailedEvents: 0,
    paymentUnbalanced: 0,
    paymentRecoveryPending: 0,
    paymentRecoveryNeedsReview: 0,
    supportNextUpdateOverdue: 1,
    supportCriticalNextUpdateOverdue: 0,
    supportP0WithoutOwner: 0,
    supportWorkerStale: false,
    listingAiProvider: 'on_device',
    listingAiExternalProviderExecutionAllowed: false,
    listingAiBudgetCents: 0,
  }, 'readiness');
  exact(value?.interpretation, {
    clientInstallFailure: false,
    runtimeInfrastructureFailure: false,
    blockingCondition: 'one noncritical overdue Support next-update',
    requiredNextAction: 'authorized support-owner workflow must issue a truthful bounded update and future checkpoint',
    directDatabaseMutationAllowed: false,
    externalMessageSent: false,
  }, 'interpretation');
  validateBoundaries(value);

  return Object.freeze({
    status: 'blocked-by-one-noncritical-support-followup',
    backendCommit: observedBackendCommit,
    sourceFilesVerified: Object.keys(requiredSourceBindings).length,
    localEvaluationOnly: true,
    stagingEvidenceCreated: false,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = validateWp165StagingReadinessCommitBinding();
    process.stdout.write(
      `WP165 local evaluation, no new Staging evidence: PASS `
      + `(backendCommit=${result.backendCommit}; sourceFiles=${result.sourceFilesVerified}; `
      + `sensitiveFlows=BLOCKED)\n`,
    );
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP165 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
