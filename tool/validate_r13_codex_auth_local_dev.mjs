#!/usr/bin/env node

import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readRepositoryFile } from './read_repository_file.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath = 'docs/evidence/48h-remote/r13-codex-auth-local-dev-20260824.json';

function fail(message) {
  throw new Error(message);
}

function exact(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function source(repositoryRoot, path) {
  return readRepositoryFile(repositoryRoot, path, { label: `R13 source ${path}` });
}

function requireMarkers(content, path, markers) {
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`R13 marker missing in ${path}: ${marker}`);
  }
}

export function validateR13CodexAuthLocalDev({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(source(repositoryRoot, evidencePath));
  const validStatuses = [
    'verified-local-evaluation-passed-regression-pending',
    'verified-local-evaluation-and-regression-passed-commit-pending',
    'verified-local-evaluation-regression-and-codeql-passed',
  ];
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-48h-r13-codex-auth-local-dev'
      || !validStatuses.includes(value.status)
      || value.classification !== 'CODEX_AUTH_LOCAL_DEV_SUPPORTED'
      || !/^[a-f0-9]{40}$/u.test(value.implementationBaseHead ?? '')) {
    fail('R13 evidence identity is invalid.');
  }
  if (!exact(value.officialSupport, {
    authenticationDocumentation: 'https://learn.chatgpt.com/docs/auth',
    nonInteractiveDocumentation: 'https://learn.chatgpt.com/docs/non-interactive-mode',
    chatgptSubscriptionSignInForCodex: true,
    codexExecReusesSavedCliAuthentication: true,
    apiKeyUsesUsageBasedBilling: true,
    sitRuntimeEntitlement: false,
  })) fail('R13 official support boundary is invalid.');
  if (!exact(value.observedLocalAuth, {
    cliVersion: 'codex-cli 0.149.0-alpha.4.1',
    loginStatus: 'chatgpt',
    apiBillingEnvironmentPresent: false,
    credentialFileRead: false,
    oauthTokenReadOrCopied: false,
    browserCookieRead: false,
    accountMutationPerformed: false,
  })) fail('R13 observed authentication boundary is invalid.');
  if (!exact(value.implementation, {
    adapter: 'tool/codex_local_dev.mjs',
    mode: 'codex_local_dev',
    architecture: 'docs/architecture/r13-codex-auth-local-dev-2026-08-24.md',
    enabledByDefault: false,
    persistentProfileCreated: false,
    userConfigChanged: false,
    syntheticFixtureOnly: true,
    ephemeralSession: true,
    readOnlySandbox: true,
    modelToolsEnabled: false,
    strictN2N3Validation: true,
    runtimeProviderEligible: false,
  })) fail('R13 implementation boundary is invalid.');
  if (!exact(value.verifiedEvaluation, {
    fixture: 'cordless-drill.png',
    synthetic: true,
    status: 'local-evaluation-complete',
    category: 'cat8',
    subcategory: 'Bohrmaschinen',
    clarificationQuestionCount: 3,
    ownerConfirmationsTrue: 0,
    replacementValuePresent: false,
    pickupRegionPresent: false,
    authoritativePriceCreated: false,
    publicationAllowed: false,
    apiBilling: false,
    credentialsExtracted: false,
    payloadSha256: '2926f2e3d1a5a2ccebc90c8a78bb80389c7d7ca1c28d5830ce874bba566e2c49',
  })) fail('R13 verified evaluation is invalid.');
  if (!exact(value.boundaries, {
    apiBillingEnabled: false,
    credentialExtractionPerformed: false,
    sitRuntimeProviderEnabled: false,
    productionChanged: false,
    paymentChanged: false,
    storeChanged: false,
    firebaseChanged: false,
    cloudChanged: false,
    vpsChanged: false,
    dnsChanged: false,
    publicReleasePerformed: false,
    pullRequestMerged: false,
  })) fail('R13 live boundary is invalid.');
  if (value.next48hPackage !== 'R3') fail('R13 next package is invalid.');
  const fullRegressionPassed = value.status !== validStatuses[0];
  const githubPassed = value.status === validStatuses[2];
  if (!exact(value.focusedVerification, {
    adapterTests: 'passed-8',
    statusCheck: 'passed-chatgpt-no-api-billing',
    actualSyntheticEvaluation: 'passed',
    artifactValidatorTests: 'passed-6',
    artifactValidator: 'passed',
    fullTechnicalRegression: fullRegressionPassed
      ? 'passed-candidate-rollover-ci-metadata-mode'
      : 'pending',
    githubRegression: githubPassed ? 'passed' : 'pending',
    githubCodeql: githubPassed ? 'passed-no-new-alerts' : 'pending',
  })) fail('R13 verification record is invalid.');
  if (githubPassed && !exact(value.githubVerification, {
    implementationCommit: 'b504bbb3a5ab97dbf2b162b13061e35400fa640d',
    regression: {
      runId: 32717658624,
      conclusion: 'success',
      backendRegression: 'success',
      postgresRunnerProof: 'success',
      flutterRegression: 'success',
      signedCandidateBuilt: false,
      apiImagePublished: false,
    },
    codeql: {
      workflowRunId: 32717658646,
      workflowConclusion: 'success',
      advancedSecurityCheckId: 97402679227,
      advancedSecurityConclusion: 'success',
      newAlerts: 0,
    },
    preExistingExternalHistoryCheck: {
      provider: 'GitGuardian',
      baseCheckId: 97395091283,
      baseCommit: 'e64defd0df62fb047c6fbc90733e4caf318ac7c4',
      baseConclusion: 'failure',
      currentCheckId: 97402213592,
      currentConclusion: 'failure',
      reportedPullRequestCommitScope: 250,
      credentialDetailsInspected: false,
      classifiedAsR13Regression: false,
    },
  })) fail('R13 GitHub verification is invalid.');

  const adapter = source(repositoryRoot, value.implementation.adapter);
  requireMarkers(adapter, value.implementation.adapter, [
    'CODEX_AUTH_LOCAL_DEV_SUPPORTED',
    'codex_local_dev_api_billing_environment_present',
    "lines[0] !== 'Logged in using ChatGPT'",
    "env.SIT_CODEX_LOCAL_DEV_ENABLED !== '1'",
    "'--ephemeral'",
    "'--sandbox', 'read-only'",
    "'--disable', 'shell_tool'",
    'validateListingAiProviderOutput',
    'runtimeProviderEligible: false',
  ]);
  const architecture = source(repositoryRoot, value.implementation.architecture);
  requireMarkers(architecture, value.implementation.architecture, [
    'CODEX_AUTH_LOCAL_DEV_SUPPORTED',
    'https://learn.chatgpt.com/docs/auth',
    'https://learn.chatgpt.com/docs/non-interactive-mode',
    'does **not** make',
    'DISABLED BY DEFAULT',
    'does not enter regional learning',
  ]);
  const serialized = JSON.stringify(value);
  if (/\/Users\/|BEGIN PRIVATE|\bsk-[A-Za-z0-9]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u.test(serialized)) {
    fail('R13 evidence contains private or secret-shaped material.');
  }
  return {
    status: value.status,
    classification: value.classification,
    authMode: value.observedLocalAuth.loginStatus,
    apiBilling: false,
    runtimeProviderEligible: false,
    next48hPackage: value.next48hPackage,
  };
}

function main() {
  const result = validateR13CodexAuthLocalDev();
  process.stdout.write(
    `R13 Codex local dev valid: classification=${result.classification}, auth=${result.authMode}, apiBilling=${result.apiBilling}, runtimeProviderEligible=${result.runtimeProviderEligible}, status=${result.status}, next=${result.next48hPackage}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
