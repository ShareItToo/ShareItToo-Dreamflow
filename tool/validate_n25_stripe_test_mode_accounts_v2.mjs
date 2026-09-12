#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const expected = Object.freeze({
  n23ClosureHead: '523b51208b6f5971306e95e5ed4d793556275611',
  phoneDiagnosticPreparationHead: '73715afa19c66d828a649cfd74c5f0edf46976f3',
  implementationHead: '4ece64d59bd0b682e860c6149bae9defdb66136f',
  githubRegressionRun: 33746308734,
  githubCodeqlRun: 33746308700,
});

function fail(message) {
  throw new Error(message);
}

function same(actual, wanted, label) {
  if (actual !== wanted) fail(`${label} is not the verified N25 value.`);
}

function allTrue(value, expectedCount, label) {
  const entries = Object.entries(value ?? {});
  same(entries.length, expectedCount, `${label} count`);
  for (const [key, enabled] of entries) {
    same(enabled, true, `${label} ${key}`);
  }
}

export function validateN25StripeTestModeAccountsV2(evidence) {
  same(evidence?.schemaVersion, 1, 'schemaVersion');
  same(evidence?.kind, 'sit-n25-stripe-test-mode-accounts-v2', 'kind');
  same(
    evidence?.status,
    'technical-foundation-passed-provider-e2e-held-live-gates-closed',
    'status',
  );
  same(evidence?.source?.branch, 'codex/master-workflow-20260808', 'branch');
  for (const [key, value] of Object.entries(expected)) {
    if (key.endsWith('Run')) continue;
    same(evidence?.source?.[key], value, key);
  }

  const provider = evidence?.provider;
  same(provider?.sdk, 'stripe', 'provider SDK');
  same(provider?.sdkVersion, '22.6.1', 'provider SDK version');
  same(provider?.apiVersion, '2026-08-26.dahlia', 'Stripe API version');
  same(provider?.accountApi, 'v2', 'account API');
  same(provider?.configuration, 'recipient', 'account configuration');
  same(provider?.dashboard, 'express', 'dashboard');
  same(provider?.feesCollector, 'application', 'fees collector');
  same(provider?.lossesCollector, 'application', 'losses collector');
  same(provider?.paymentModel, 'separate-charges-and-transfers', 'payment model');
  for (const key of [
    'hostedOnboarding',
    'snapshotWebhookVerification',
    'thinWebhookVerification',
    'thinEventAccountRetrieval',
    'idempotentMutations',
  ]) same(provider?.[key], true, key);

  allTrue(evidence?.readinessInvariant, 10, 'readiness invariant');
  allTrue(evidence?.refundAndPayoutInvariant, 5, 'refund/payout invariant');

  const configuration = evidence?.configuration;
  for (const key of [
    'testSecretOrRestrictedKeyAccepted',
    'webhookSigningSecretRequired',
    'liveCredentialRejectedOutsideProduction',
    'keyModeMismatchRejected',
  ]) same(configuration?.[key], true, key);
  for (const key of [
    'serverCredentialConfiguredInStaging',
    'webhookCredentialConfiguredInStaging',
    'deploymentPerformed',
  ]) same(configuration?.[key], false, key);

  const database = evidence?.database;
  same(database?.latestMigration, '071_stripe_connect_accounts_v2.up.sql', 'latest migration');
  same(database?.orderedUpMigrations, 71, 'up migration count');
  same(database?.pairedDownMigrations, 44, 'down migration count');
  same(database?.legacyRowsRemainV1, true, 'legacy v1 truth');
  same(database?.rollbackBlockedAfterV2Data, true, 'rollback guard');
  same(database?.freshPostgres16, 'passed', 'fresh PostgreSQL');
  same(database?.recoveryRoundTrip, 'passed', 'recovery round trip');

  const observation = evidence?.providerObservation;
  same(observation?.officialConnectorMode, 'test', 'connector mode');
  same(observation?.testModeAccountsObserved, 1, 'test account observation');
  same(observation?.platformIdentityVerified, false, 'platform identity claim');
  same(observation?.accountCapabilitiesVerified, false, 'capability claim');
  same(observation?.providerObjectsCreated, 0, 'created provider objects');
  same(observation?.appRuntimeProviderRequestsPerformed, 0, 'app-runtime provider requests');
  same(observation?.p0bRequiredScenarios, 8, 'P0B scenario count');
  same(observation?.p0bProviderScenariosPassed, 0, 'P0B passed scenarios');
  same(observation?.p0bStatus, 'hold-provider-credentials-and-sandbox-e2e', 'P0B state');

  const qa = evidence?.qa;
  same(qa?.focusedN25TestsPassed, 20, 'focused tests');
  same(qa?.backendTestsTotal, 796, 'Backend test total');
  same(qa?.backendTestsPassed, 794, 'Backend passed tests');
  same(qa?.backendExpectedDatabaseSkips, 2, 'Backend database skips');
  same(qa?.implementationRepositoryToolTestsPassed, 2102, 'implementation tool tests');
  same(qa?.closureRepositoryToolTestsPassed, 2106, 'closure tool tests');
  same(qa?.flutterTestsPassed, 652, 'Flutter tests');
  same(qa?.analyzer, 'passed-zero', 'analyzer');
  same(qa?.webWasm, 'passed', 'Web/Wasm');
  same(qa?.loopbackSmoke, 'passed', 'loopback');
  same(qa?.androidDebugBuild, 'passed', 'Android debug build');
  same(qa?.dependencyAudit, 'no-known-vulnerabilities', 'dependency audit');
  same(qa?.secretScan, 'no-new-high-confidence-secrets', 'secret scan');
  same(qa?.localStoreValidationMode, 'ci-metadata-only', 'local Store mode');
  same(qa?.historicalActivePlayArchiveAvailableLocally, false, 'historical archive claim');
  same(qa?.githubRegressionRun, expected.githubRegressionRun, 'GitHub Regression run');
  same(qa?.githubRegression, 'passed', 'GitHub Regression');
  same(qa?.githubCodeqlRun, expected.githubCodeqlRun, 'GitHub CodeQL run');
  same(qa?.githubCodeql, 'passed', 'GitHub CodeQL');
  same(qa?.cleanCheckoutReproducibility, 'passed', 'clean checkout');
  same(qa?.openCodeScanningAlerts, 0, 'code-scanning alerts');
  same(qa?.prDraft, true, 'PR Draft');
  same(qa?.prMerged, false, 'PR merged');

  for (const [key, value] of Object.entries(evidence?.boundaries ?? {})) {
    same(value, false, `boundary ${key}`);
  }
  same(Object.keys(evidence?.boundaries ?? {}).length, 18, 'boundary count');

  const serialized = JSON.stringify(evidence);
  if (/(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\/Users\/|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_)/u.test(serialized)) {
    fail('N25 evidence contains private or credential-shaped material.');
  }
  return evidence;
}

function run() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const evidence = JSON.parse(readFileSync(resolve(
    root,
    'docs/evidence/release-readiness/n25-stripe-test-mode-accounts-v2-20260903.json',
  ), 'utf8'));
  validateN25StripeTestModeAccountsV2(evidence);
  process.stdout.write('N25 Stripe test-mode Accounts v2 evidence: PASS\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'N25 evidence validation failed.'}\n`);
    process.exitCode = 1;
  }
}
