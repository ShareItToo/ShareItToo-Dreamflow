#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp82-staging-persistent-source-proof-contract-20260910.json';
const wp77EvidencePath =
  'docs/evidence/release-readiness/wp77-public-legal-staging-source-mismatch-20260909.json';
const preflightHead = '1fa6d5c8bc758c938031d25d8d533039912327ca';
const sourceInventory = [
  {
    path: 'backend/ops/deploy_release.sh',
    sha256: '7b0958cba5d2169da3283e214630ddd55bba882eefb726aa6895b917b94ee477',
  },
  {
    path: 'backend/compose.staging.yml',
    sha256: 'a5669d8b01672ec1b2da240607a6dc592d9cb17474d6ec40d648ffb54fc416b4',
  },
  {
    path: 'tool/inspect_staging_runtime_readonly.mjs',
    sha256: '8a893f44a4c248361a9af091948c8e6fb7a61140d6347e53421a5819494619b7',
  },
  {
    path: wp77EvidencePath,
    sha256: '3edefcc2d77b621d3fd99ac4aa465da58feab490054099df9e14ec8cb932a3cd',
  },
];

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertAncestor(repositoryRoot, ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP82 commit ancestry is invalid: ${ancestor} -> ${descendant}`);
  }
}

function inspectPrivateShape(value, trail = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPrivateShape(entry, [...trail, index]));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:password|secret|tokenvalue|emailaddress|phonenumber|accountid|credentialvalue|personname|deviceid|serial|ssid|bssid|ipaddress)$/iu.test(key)) {
      fail(`WP82 private field is forbidden: ${[...trail, key].join('.')}`);
    }
    inspectPrivateShape(entry, [...trail, key]);
  }
}

function validateSource(repositoryRoot, sourceTexts) {
  for (const entry of sourceInventory) {
    const text = sourceTexts?.[entry.path]
      ?? readFileSync(resolve(repositoryRoot, entry.path), 'utf8');
    if (sha256(text) !== entry.sha256) {
      fail(`WP82 protected source hash is stale: ${entry.path}`);
    }
  }
  const deployment = readFileSync(resolve(repositoryRoot, 'backend/ops/deploy_release.sh'), 'utf8');
  const compose = readFileSync(resolve(repositoryRoot, 'backend/compose.staging.yml'), 'utf8');
  const runtimeInventory = readFileSync(
    resolve(repositoryRoot, 'tool/inspect_staging_runtime_readonly.mjs'),
    'utf8',
  );
  for (const marker of [
    'Image revision label does not match $task_commit.',
    'up -d --no-build --wait --wait-timeout 180',
    'Deployment health endpoint does not expose the requested commit.',
    'previous image restored and verified.',
  ]) {
    if (!deployment.includes(marker)) fail(`WP82 deployment guard is missing: ${marker}`);
  }
  for (const marker of [
    'name: shareittoo_staging_postgres_data',
    'name: shareittoo_staging_uploads',
  ]) {
    if (!compose.includes(marker)) fail(`WP82 named Staging volume is missing: ${marker}`);
  }
  for (const marker of [
    "constants.O_RDONLY | constants.O_NOFOLLOW",
    "'release_record_file_invalid'",
    "credentialContentsRead: false",
    "containerConfigurationDumped: false",
  ]) {
    if (!runtimeInventory.includes(marker)) fail(`WP82 runtime inventory guard is missing: ${marker}`);
  }
  if (runtimeInventory.includes('{{json .Config}}') || runtimeInventory.includes('{{json .Config.Env}}')) {
    fail('WP82 runtime inventory may not dump container configuration.');
  }
}

export function validateWp82StagingPersistentSourceProofContract({
  repositoryRoot = root,
  evidence,
  sourceTexts,
  checkGit = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  inspectPrivateShape(value);

  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp82-staging-persistent-source-proof-contract'
      || value.status !== 'prepared-local-read-only-observation-blocked'
      || value.workPackage !== 'WP82') {
    fail('WP82 evidence identity is invalid.');
  }
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    preflightHead,
    sourceInventory,
  })) fail('WP82 repository binding is invalid.');
  if (!exact(value.requiredReadOnlyProof, {
    activeContainerBinding: [
      'exact-staging-compose-project-label',
      'active-compose-working-directory-is-persistent-regular-directory',
      'active-compose-config-file-is-regular-nonsymlink-and-contained',
    ],
    persistentSource: [
      'source-compose-metadata-is-regular-nonsymlink',
      'source-environment-metadata-is-regular-nonsymlink-owner-restricted',
      'source-deploy-script-is-present-and-uses-immutable-image-no-build-rollback-path',
      'source-data-volume-names-match-the-running-staging-project',
    ],
    runtimeComparison: [
      'runtime-image-release-record-commit-version-build-time-exact-match',
      'nonsecret-legal-runtime-values-match-source-without-emitting-values',
      'current-and-rollback-image-identities-are-read-only-verified',
    ],
    prohibited: [
      'credential-content-read',
      'full-environment-or-container-configuration-dump',
      'remote-source-or-container-mutation',
      'implicit-local-image-fallback',
      'failed-control-panel-recreate-retry',
    ],
  })) fail('WP82 proof contract is invalid.');
  if (!exact(value.remoteObservation, {
    protocol: 'dedicated-read-only-staging-source-observation',
    connectionAttempt: 'host-alias-unresolvable-before-authentication',
    remoteAuthenticationPerformed: false,
    remoteCommandPerformed: false,
    remoteEvidenceCaptured: false,
  })) fail('WP82 remote observation truth is invalid.');
  if (!exact(value.verification, {
    focusedWp82Tests: 'passed-5',
    completeToolInventory: 'passed-2567',
    fullTechnicalRegression: 'passed',
    webWasmLoopback: 'passed',
    androidDebugBuildAndMinSdk24: 'passed',
    r11AndroidSecuritySurface: 'passed',
  })) fail('WP82 local verification binding is invalid.');
  if (!exact(value.externalGate, {
    name: 'STAGING_PERSISTENT_SOURCE_READONLY_OBSERVATION',
    state: 'blocked',
    blocker: 'The configured Staging SSH alias does not currently resolve before authentication.',
    completionCondition: 'A dedicated read-only observation proves every contract item without source, container, data or provider mutation.',
  })) fail('WP82 external gate is invalid.');
  if (value.boundaries === null || typeof value.boundaries !== 'object'
      || Object.values(value.boundaries).some((entry) => entry !== false)) {
    fail('WP82 cannot claim an external or runtime mutation.');
  }
  const serialized = JSON.stringify(value);
  if (/@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP82 evidence contains private or secret-shaped content.');
  }
  if (checkGit) {
    assertAncestor(repositoryRoot, preflightHead);
    validateSource(repositoryRoot, sourceTexts);
  }
  return {
    contract: 'prepared',
    remoteObservation: 'blocked-before-authentication',
    deployment: 'not-authorized',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(validateWp82StagingPersistentSourceProofContract())}\n`);
  } catch (error) {
    process.stderr.write(`WP82 Staging persistent source proof contract failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
