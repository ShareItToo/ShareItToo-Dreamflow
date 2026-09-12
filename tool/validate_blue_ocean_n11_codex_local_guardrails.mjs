#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/blue-ocean/n11-codex-local-guardrails-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `N11 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`N11 marker missing in ${path}: ${marker}`);
  }
}

export function validateBlueOceanN11CodexLocalGuardrails({
  repositoryRoot = root,
  evidence,
} = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'implemented-targeted-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-ready-for-n12',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-stage-a-blue-ocean-n11-codex-local-guardrails'
      || !validStatuses.includes(value.status)
      || value.implementationBaseHead !== '9533d4351c64d1b3df2b37b97e4ec0e9496f020e') {
    fail('N11 evidence identity is invalid.');
  }
  if (!exact(value.officialSupport, {
    documentation: 'https://learn.chatgpt.com/docs/hooks',
    repoLocalHooksJson: 'supported',
    preToolUseBlocking: 'supported',
    stopLifecycleHook: 'supported',
    trustReviewRequired: true,
    completeEnforcementBoundary: false,
    observedCliVersion: 'codex-cli 0.149.0-alpha.4.1',
    observedFeatureState: 'hooks stable true',
  })) fail('N11 official support evidence is invalid.');
  if (!exact(value.implementation, {
    hooksConfig: '.codex/hooks.json',
    hookScript: '.codex/hooks/sit_guardrail.py',
    architecture: 'docs/architecture/n11-codex-local-guardrails-2026-08-24.md',
    scope: 'repo-local-reversible-optional-defense-in-depth',
    userConfigChanged: false,
    pluginInstalled: false,
    trustState: 'pending-official-review-on-next-hook-discovery',
  })) fail('N11 implementation boundary is invalid.');
  if (!exact(value.guardrails, {
    destructiveGitToken: 'implemented',
    externalMutationToken: 'implemented',
    productionPaymentStoreVpsDnsCloudBlock: 'implemented-known-command-patterns',
    stagedHighConfidenceSecretScan: 'implemented-without-secret-output',
    fastSitValidatorsBeforeCommit: 'implemented',
    automaticPendingGateArtifact: 'implemented-git-metadata-only',
  })) fail('N11 guardrail map is invalid.');
  if (!exact(value.limitations, [
    'hooks-are-not-a-complete-enforcement-boundary',
    'only-supported-local-tool-paths-are-observed',
    'pattern-matching-cannot-identify-every-external-mutation',
    'trust-review-is-required-after-hook-definition-change',
    'fast-precommit-validation-does-not-replace-full-regression-or-github-ci',
  ])) fail('N11 limitation map is invalid.');
  if (!exact(value.boundaries, {
    hookTrustedOrActivatedByN11: false,
    userCodexConfigChanged: false,
    productionChanged: false,
    paymentChanged: false,
    storeChanged: false,
    firebaseChanged: false,
    cloudChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
  })) fail('N11 mutation boundary is invalid.');

  const targetedPassed = value.status !== validStatuses[0]
    || value.targetedVerification?.hookBehaviorTests === 'passed-10';
  const fullPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === 'verified-ready-for-n12';
  if (!targetedPassed || !exact(value.targetedVerification, {
    hookBehaviorTests: 'passed-10',
    artifactValidatorTests: 'passed-7',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed' : 'pending',
  })) fail('N11 verification record is invalid for its status.');
  if (value.nextPackage !== 'N12') fail('N11 next package is invalid.');
  if (githubPassed) {
    const verification = value.exactGitHubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.headSha ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success') {
      fail('N11 exact GitHub verification is invalid.');
    }
  } else if (value.exactGitHubVerification !== undefined) {
    fail('N11 cannot bind exact GitHub verification before CI is complete.');
  }

  const config = JSON.parse(source(repositoryRoot, value.implementation.hooksConfig));
  if (!exact(Object.keys(config.hooks ?? {}), ['SessionStart', 'PreToolUse', 'Stop'])
      || config.hooks.PreToolUse?.[0]?.matcher !== '^Bash$') {
    fail('N11 hook configuration is invalid.');
  }
  const configText = JSON.stringify(config);
  requireMarkers(configText, value.implementation.hooksConfig, [
    'sit_guardrail.py\\\" session-start',
    'sit_guardrail.py\\\" pre-tool',
    'sit_guardrail.py\\\" stop',
  ]);
  const script = source(repositoryRoot, value.implementation.hookScript);
  requireMarkers(script, value.implementation.hookScript, [
    'R0_DESTRUCTIVE_GIT_GO', 'R0_EXTERNAL_MUTATION_GO',
    'scan_staged_secrets', 'run_fast_validators', 'SIT_PENDING_GATE:',
    'codex/sit-pending-gate.json', 'containsPersonalData',
  ]);
  const architecture = source(repositoryRoot, value.implementation.architecture);
  requireMarkers(architecture, value.implementation.architecture, [
    'TRUST REVIEW PENDING', 'https://learn.chatgpt.com/docs/hooks',
    'rather than a complete enforcement boundary', 'Non-dependency boundary',
    'user-level Codex config',
  ]);
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('N11 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    officialSupport: value.officialSupport.repoLocalHooksJson,
    trustState: value.implementation.trustState,
    productDependency: false,
    nextPackage: value.nextPackage,
  };
}

function main() {
  const result = validateBlueOceanN11CodexLocalGuardrails();
  process.stdout.write(
    `Blue Ocean N11 Codex hooks valid: support=${result.officialSupport}, trust=${result.trustState}, productDependency=${result.productDependency}, status=${result.status}, next=${result.nextPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
