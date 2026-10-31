#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp139-staging-registry-read-path-audit-20260913.json';
const publishedHead = 'fb04892331758e19b2b3835026ed8174e382dfb7';
const implementationHead = '864d56f08cfd48effd9d877090e30dc92891c667';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`WP139 ${label} is invalid.`);
  }
}

function sourceAtHead(repositoryRoot, head, path) {
  try {
    return execFileSync('git', ['show', `${head}:${path}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    fail(`WP139 source is unavailable: ${path}`);
  }
}

function assertAncestor(repositoryRoot, head) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
  } catch {
    fail(`WP139 source is not an ancestor of HEAD: ${head}`);
  }
}

export function validateWp139StagingRegistryReadPathAudit({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(
    readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'),
  );
  if (value?.schemaVersion !== 1
      || value.kind !== 'sit-wp139-staging-registry-read-path-audit'
      || value.status !== 'partial-authenticated-read-proven-scope-and-fresh-layer-pull-open'
      || value.capturedAt !== '2026-09-13T12:06:28Z') {
    fail('WP139 evidence identity is invalid.');
  }

  exact(value.source?.branch, 'codex/master-workflow-20260808', 'branch');
  exact(value.source?.publishedSourceCommit, publishedHead, 'published source');
  exact(value.source?.auditImplementationCommit, implementationHead, 'implementation source');
  if (checkGitState) {
    assertAncestor(repositoryRoot, publishedHead);
    assertAncestor(repositoryRoot, implementationHead);
  }
  const inventory = value.source?.sourceInventory ?? {};
  exact(Object.keys(inventory).sort(), [
    'test/tool/audit_staging_registry_read_path.test.mjs',
    'tool/audit_staging_registry_read_path.mjs',
  ], 'source inventory');
  for (const [path, hash] of Object.entries(inventory)) {
    exact(
      createHash('sha256').update(sourceAtHead(repositoryRoot, implementationHead, path))
        .digest('hex'),
      hash,
      `source hash for ${path}`,
    );
  }

  exact(value.publication, {
    githubWorkflowRunId: 34755213368,
    conclusion: 'success',
    backendRegression: 'passed',
    postgresRunnerProof: 'passed',
    flutterRegression: 'passed',
    cleanCheckoutReproducibility: 'passed',
    publishApiImage: 'passed',
  }, 'publication');
  exact(value.registryTarget, {
    repository: 'ghcr.io/shareittoo/shareittoo-api',
    tag: publishedHead,
    manifestDigest: 'sha256:abd9a7c5b58ee875d10b3818d457db4101943d8b329bcbf963d19dcf24e71e6e',
    configDigest: 'sha256:57b34ca841aaaaede8ff35cb8b9d56d139924cff265cb177d32eff458b1ef356',
    platform: 'linux/amd64',
    revisionLabel: publishedHead,
    versionLabel: '0.1.0-fb0489233175',
    layerCount: 11,
    compressedLayerBytes: 94258580,
    orderedLayerDigestListSha256: 'b9fe7126e8e149784130f1432c2692f35b25e86213c8d6b50748711ad56e59d7',
  }, 'registry target');

  exact(value.currentRuntime?.tag,
    'df39a14b7a19afe467842461a28f1e77fec8445e', 'runtime tag');
  exact(value.currentRuntime?.imageId,
    'sha256:4d440d9481369b477b9495f5cefa419783f974ff35438c3490e54b42322ddfd6',
    'runtime image');
  exact(value.currentRuntime?.restartCount, 0, 'runtime restarts');
  exact(value.currentRuntime?.dockerRuntimeInputsMatchPublishedSource, true,
    'runtime input relation');
  exact(value.currentRuntime?.targetLayerSetMatchesRuntime, false, 'layer-set relation');
  exact(value.currentRuntime?.targetImageCachedBeforeAudit, false, 'target cache state');

  exact(value.readPath, {
    dedicatedHeadlessConnection: 'passed',
    protectedDockerConfigPresent: true,
    protectedDockerConfigMode: '600',
    protectedDockerConfigOwner: 'root',
    protectedDockerConfigSizeBytes: 135,
    credentialContentRead: false,
    authenticatedManifestRead: 'passed',
    authenticatedConfigBlobRead: 'passed',
    anonymousManifestHttpStatus: 401,
    anonymousTokenHttpStatus: 401,
    localGithubCliPackageApiHttpStatus: 403,
    credentialScopeInspected: false,
    leastPrivilegeReadPackagesOnlyProven: false,
    freshLayerPullPerformed: false,
  }, 'read path');
  exact(value.decision, {
    requirement: 'durable-private-registry-pull',
    before: 'OPEN',
    after: 'OPEN',
    provenNow: 'existing-server-auth-can-read-current-private-manifest-and-config',
    stillRequired: 'verify-or-replace-server-credential-as-read-packages-only-then-pull-the-exact-uncached-digest-without-switching-runtime',
    whyNotPromoted: 'stored-credential-scope-was-not-read-or-inferred-and-the-uncached-layer-set-was-not-downloaded',
  }, 'decision');
  exact(value.officialBasis?.minimumPrivatePullScope, 'read:packages', 'minimum scope');
  exact(value.officialBasis?.tokenTypeDocumentedByGithub,
    'personal-access-token-classic', 'token type');
  exact(value.verification?.focusedAuditContractTests, 'passed-3-of-3', 'focused tests');
  exact(value.verification?.fullLocalTechnicalRegression,
    'passed-ci-metadata-and-candidate-rollover-mode', 'local regression');
  exact(value.verification?.implementationGithubRegressionConclusion,
    'success', 'GitHub Regression');
  exact(value.verification?.implementationGithubCodeqlConclusion, 'success', 'CodeQL');
  exact(value.verification?.portfolioBefore, { pass: 20, partial: 4, open: 8 },
    'portfolio before');
  exact(value.verification?.portfolioAfter, { pass: 20, partial: 4, open: 8 },
    'portfolio after');

  const trueBoundaries = ['githubPackageImagePublished'];
  const falseBoundaries = [
    'vpsConfigurationChanged', 'vpsImageCacheChanged', 'stagingRuntimeChanged',
    'dockerLoginChanged', 'credentialCreatedRotatedOrExtracted',
    'packageVisibilityChanged', 'productionChanged', 'paymentChanged',
    'storeChanged', 'firebaseChanged', 'dnsChanged', 'deviceContacted',
    'pullRequestMerged', 'containsCredential', 'containsToken',
    'containsPrivateFilesystemPath',
  ];
  if (trueBoundaries.some((key) => value.boundaries?.[key] !== true)
      || falseBoundaries.some((key) => value.boundaries?.[key] !== false)
      || Object.keys(value.boundaries ?? {}).length !==
        trueBoundaries.length + falseBoundaries.length) {
    fail('WP139 boundary contract is invalid.');
  }
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|BEGIN PRIVATE|\b(?:ghp|github_pat)_[A-Za-z0-9_]+|password\s*[:=]/iu.test(serialized)) {
    fail('WP139 evidence contains private or credential-shaped material.');
  }

  return Object.freeze({
    status: value.status,
    digest: value.registryTarget.manifestDigest,
    authenticatedRead: value.readPath.authenticatedManifestRead,
    leastPrivilegeProven: value.readPath.leastPrivilegeReadPackagesOnlyProven,
    freshLayerPull: value.readPath.freshLayerPullPerformed,
    portfolio: value.verification.portfolioAfter,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(
      validateWp139StagingRegistryReadPathAudit(), null, 2,
    )}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP139 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
