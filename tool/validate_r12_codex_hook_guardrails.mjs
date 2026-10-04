#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/48h-remote/r12-codex-hook-guardrails-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R12 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R12 marker missing in ${path}: ${marker}`);
  }
}

export function validateR12CodexHookGuardrails({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const statuses = [
    'implemented-focused-tests-passed-full-regression-pending',
    'implemented-full-regression-passed-ci-pending',
    'verified-regression-and-codeql-passed-ready-for-r14',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r12-codex-hook-autonomy-guardrails'
      || !statuses.includes(value.status)
      || value.implementationBaseHead !== '86a7be546b33b3b9b1a9b40ba2d4b765c8bdee4f') {
    fail('R12 evidence identity is invalid.');
  }
  if (!exact(value.officialSupport, {
    documentation: 'https://learn.chatgpt.com/docs/hooks',
    repoLocalHooksJson: 'supported-for-trusted-repositories',
    preToolUseBlocking: 'supported-local-tool-paths',
    stopLifecycleHook: 'supported',
    trustReviewRequiredAfterChange: true,
    completeEnforcementBoundary: false,
  })) fail('R12 official support boundary is invalid.');
  if (!exact(value.observedLocalConfiguration, {
    cliVersion: 'codex-cli 0.149.0-alpha.4.1',
    hookFeature: 'stable-enabled',
    repositoryHooksPresent: true,
    userLevelHookDefinitionPresent: false,
    credentialValuesRead: false,
    browserCookiesRead: false,
    userConfigurationChanged: false,
  })) fail('R12 local configuration boundary is invalid.');
  if (!exact(value.implementation, {
    config: '.codex/hooks.json',
    script: '.codex/hooks/sit_guardrail.py',
    operations: 'docs/operations/48H_R12_CODEX_HOOK_GUARDRAILS_2026-08-24.md',
    test: 'test/tool/r12_codex_hook_guardrails.test.mjs',
    productRuntimeDependency: false,
    thirdPartyHookFrameworkInstalled: false,
    hookTrustedOrActivatedByR12: false,
    trustState: 'pending-official-review-after-definition-change',
  })) fail('R12 implementation boundary is invalid.');
  if (!exact(value.guardrails, {
    hookASecretGuard: 'implemented-command-staged-and-signing-container',
    hookBDestructiveGitGuard: 'implemented-history-delete-pr-merge-and-protected-branch',
    hookCLiveBoundaryGuard: 'implemented-known-production-remote-cloud-store-payment-kyc-billing-paths',
    hookDPackageCompletion: 'implemented-exact-r12-policy-clean-tree-and-focused-validation',
    hookEPendingGate: 'implemented-sanitized-doc-and-git-metadata',
  })) fail('R12 guardrail map is invalid.');
  if (!exact(value.limitations, [
    'hooks-are-defense-in-depth-not-a-complete-enforcement-boundary',
    'specialized-or-hosted-tool-paths-may-not-be-observed',
    'pattern-matching-cannot-identify-every-secret-or-live-mutation',
    'repository-trust-review-is-required-after-hook-definition-change',
    'focused-package-completion-does-not-replace-full-regression-or-ci',
  ])) fail('R12 limitations are invalid.');
  if (!exact(value.boundaries, {
    credentialExtracted: false,
    providerBillingEnabled: false,
    productionChanged: false,
    paymentChanged: false,
    kycChanged: false,
    storeChanged: false,
    firebaseChanged: false,
    cloudChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
    protectedBranchMutated: false,
  })) fail('R12 live boundary is invalid.');
  if (value.next48hPackage !== 'R14') fail('R12 next package is invalid.');

  const fullPassed = value.status !== statuses[0];
  const githubPassed = value.status === statuses[2];
  if (!exact(value.focusedVerification, {
    pythonSyntax: 'passed',
    n11CompatibilityTests: 'passed-10',
    r12BehaviorTests: 'passed-12',
    artifactValidatorTests: 'passed-6',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullPassed ? 'passed-candidate-rollover-ci-metadata-mode' : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R12 verification record is invalid.');
  if (githubPassed) {
    const verification = value.githubVerification;
    if (!verification
        || !/^[a-f0-9]{40}$/u.test(verification.implementationCommit ?? '')
        || !Number.isSafeInteger(verification.regressionRunId)
        || verification.regressionConclusion !== 'success'
        || !Number.isSafeInteger(verification.flutterJobId)
        || !Number.isSafeInteger(verification.backendJobId)
        || !Number.isSafeInteger(verification.postgresJobId)
        || !Number.isSafeInteger(verification.cleanCheckoutJobId)
        || verification.signedCandidateBuilt !== false
        || verification.parallelStressExecuted !== false
        || verification.apiImagePublished !== false
        || !Number.isSafeInteger(verification.codeqlRunId)
        || verification.codeqlConclusion !== 'success'
        || !Number.isSafeInteger(verification.advancedSecurityCheckId)
        || verification.advancedSecurityConclusion !== 'success'
        || verification.newAlerts !== 0
        || !exact(verification.preExistingExternalHistoryCheck, {
          provider: 'GitGuardian',
          checkId: 97579664956,
          conclusion: 'failure',
          historicalFindingReinspected: false,
          credentialDetailsInspected: false,
          classifiedAsR12Regression: false,
        })) {
      fail('R12 GitHub verification is invalid.');
    }
  } else if (value.githubVerification !== undefined) {
    fail('R12 cannot bind GitHub verification before CI succeeds.');
  }

  const config = JSON.parse(source(repositoryRoot, value.implementation.config));
  if (!exact(Object.keys(config.hooks ?? {}), ['SessionStart', 'PreToolUse', 'Stop'])
      || config.hooks.PreToolUse?.[0]?.matcher !== '^Bash$') {
    fail('R12 hook configuration is invalid.');
  }
  const script = source(repositoryRoot, value.implementation.script);
  requireMarkers(script, value.implementation.script, [
    'contains_probable_secret', 'SIGNING_SECRET_SUFFIXES', 'PROTECTED_BRANCH_PUSH',
    'real payment provider mutation', 'KYC provider mutation', 'Store automation',
    'SIT_PACKAGE_GREEN:', 'package_completion_failure', 'write_pending_gate_document',
    'SIT_PENDING_GATE_', 'O_NOFOLLOW',
  ]);
  const operations = source(repositoryRoot, value.implementation.operations);
  requireMarkers(operations, value.implementation.operations, [
    'HOOK-A', 'HOOK-B', 'HOOK-C', 'HOOK-D', 'HOOK-E',
    'https://learn.chatgpt.com/docs/hooks', 'defense in depth',
    'No production', 'Rollback', 'trust UI',
  ]);
  const behaviorTest = source(repositoryRoot, value.implementation.test);
  requireMarkers(behaviorTest, value.implementation.test, [
    'allows representative read-only', 'fails closed', 'fully removable',
    'doesNotMatch', 'SIT_PACKAGE_GREEN:', 'SIT_PENDING_GATE:',
  ]);
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R12 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    guardrailCount: Object.keys(value.guardrails).length,
    trustState: value.implementation.trustState,
    productRuntimeDependency: value.implementation.productRuntimeDependency,
    next48hPackage: value.next48hPackage,
  };
}

function main() {
  const result = validateR12CodexHookGuardrails();
  process.stdout.write(
    `R12 Codex guardrails valid: hooks=${result.guardrailCount}, trust=${result.trustState}, productDependency=${result.productRuntimeDependency}, status=${result.status}, next=${result.next48hPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
