#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const evidencePath =
  'docs/evidence/release-readiness/wp73-stripe-sandbox-compatibility-inventory-20260909.json';
const sourcePaths = [
  'backend/src/stripe_provider.js',
  'backend/src/stripe_secret_files.js',
  'backend/src/payment_workflow.js',
  'backend/src/config.js',
  'backend/compose.staging.stripe.yml',
  'backend/ops/validate_stripe_staging_secrets.mjs',
  'docs/operations/P0B_PSP_SANDBOX_E2E_RUNBOOK.md',
  'docs/evidence/release-readiness/wp66-payment-provider-integrity-and-candidate-20260909.json',
];

function fail(message) { throw new Error(message); }
function exact(actual, expected) { return JSON.stringify(actual) === JSON.stringify(expected); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function assertAncestor(repositoryRoot, commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    fail(`WP73 commit is not an ancestor of HEAD: ${commit}`);
  }
}

function validateSources(repositoryRoot, value) {
  if (!exact(value.sourceInventory?.map((entry) => entry.path), sourcePaths)) {
    fail('WP73 source inventory is incomplete or reordered.');
  }
  for (const entry of value.sourceInventory) {
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        || sha256(readFileSync(resolve(repositoryRoot, entry.path))) !== entry.sha256) {
      fail(`WP73 source hash drift: ${entry.path}`);
    }
  }
}

function validateRepositoryContracts(repositoryRoot) {
  const provider = readFileSync(resolve(repositoryRoot, 'backend/src/stripe_provider.js'), 'utf8');
  const workflow = readFileSync(resolve(repositoryRoot, 'backend/src/payment_workflow.js'), 'utf8');
  const config = readFileSync(resolve(repositoryRoot, 'backend/src/config.js'), 'utf8');
  const secrets = readFileSync(resolve(repositoryRoot, 'backend/src/stripe_secret_files.js'), 'utf8');
  const overlay = readFileSync(resolve(repositoryRoot, 'backend/compose.staging.stripe.yml'), 'utf8');
  const sdkVersion = readFileSync(resolve(repositoryRoot, 'backend/node_modules/stripe/cjs/apiVersion.js'), 'utf8');

  for (const pattern of [
    /client\.v2\.core\.accounts\.create/u,
    /dashboard: 'express'/u,
    /fees_collector: 'application'/u,
    /losses_collector: 'application'/u,
    /stripe_transfers: \{ requested: true \}/u,
    /client\.checkout\.sessions\.create/u,
    /source_transaction: chargeId/u,
    /client\.transfers\.createReversal/u,
  ]) if (!pattern.test(provider)) fail(`WP73 provider contract missing: ${pattern}`);

  if (!/event\.type\.startsWith\('charge\.dispute\.'\)/u.test(workflow)
      || !/Stripe-Streitfall; Auszahlung automatisch gesperrt\./u.test(workflow)) {
    fail('WP73 dispute payout-block contract is missing.');
  }
  const disputeStart = workflow.indexOf("if (event.type.startsWith('charge.dispute.'))");
  const disputeEnd = workflow.indexOf("return 'ignored';", disputeStart);
  const disputeBranch = workflow.slice(disputeStart, disputeEnd);
  if (/reverseTransfer|createReversal|transfer-reversal/u.test(disputeBranch)) {
    fail('WP73 blocking finding is stale: dispute reversal now exists.');
  }
  if (!/prepared\.payment\.provider_transfer_id/u.test(workflow)
      || !/stripeProvider\.reverseTransfer/u.test(workflow)) {
    fail('WP73 refund reversal comparison is missing.');
  }
  if (!/Stripe Staging transport requires file credentials/u.test(secrets)
      || !/stripeLivemode && deploymentEnvironment !== 'production'/u.test(config)
      || !/STRIPE_LIVEMODE: "false"/u.test(overlay)
      || (overlay.match(/read_only: true/gu) ?? []).length !== 3) {
    fail('WP73 test or secret boundary has drifted.');
  }
  if (!/2026-08-26\.dahlia/u.test(sdkVersion)) {
    fail('WP73 installed Stripe SDK API version has drifted.');
  }
}

function validateProviderObservation(value) {
  if (!exact(value.providerObservation, {
    reportedSeparateSandboxExists: true,
    reportedInternalSandboxNameVerified: true,
    reportedUnderIntendedOperatorIdentity: true,
    independentlyVerifiedThisPackage: false,
    officialConnectorReadAttempted: true,
    officialConnectorState: 'reauthentication-required',
    sanitizedConnectorFailure: 'oauth_token_invalid_grant',
    stripeCliAvailable: false,
    actualStripeAccountReadPerformed: false,
    credentialReadOrExtracted: false,
    browserCookieRead: false,
    providerObjectCreatedOrChanged: false,
  })) fail('WP73 provider observation overclaims current truth.');
}

function validateCompatibility(value) {
  if (value.compatibility?.overallVerdict
      !== 'compatible-after-required-dispute-recovery-correction-and-read-only-provider-verification') {
    fail('WP73 compatibility verdict has drifted.');
  }
  if (!exact(value.compatibility.accountsV2, {
    verdict: 'PASS-REPOSITORY-CONTRACT',
    configuration: 'recipient',
    dashboard: 'express',
    feesCollector: 'application',
    lossesCollector: 'application',
    requestedCapability: 'stripe_balance.stripe_transfers',
    readinessRequiresTransfersActive: true,
    readinessRequiresPayoutsActive: true,
    legacyV1CannotPromoteReadiness: true,
    actualSandboxConfigurationVerified: false,
  })) fail('WP73 Accounts v2 verdict is invalid.');
  const finding = value.blockingFinding;
  if (!exact({
    id: finding?.id,
    severity: finding?.severity,
    proven: finding?.proven,
    alreadyPaidTransferAutomaticallyRecoveredOnDispute:
      finding?.alreadyPaidTransferAutomaticallyRecoveredOnDispute,
    futurePayoutBlockedOnDispute: finding?.futurePayoutBlockedOnDispute,
    chargebackLedgerRecorded: finding?.chargebackLedgerRecorded,
    retryableReversalRecoveryStatePresent: finding?.retryableReversalRecoveryStatePresent,
    providerTrafficAllowedBeforeCorrection: finding?.providerTrafficAllowedBeforeCorrection,
  }, {
    id: 'stripe-dispute-paid-transfer-recovery',
    severity: 'P0-payment-integrity-before-provider-traffic',
    proven: true,
    alreadyPaidTransferAutomaticallyRecoveredOnDispute: false,
    futurePayoutBlockedOnDispute: true,
    chargebackLedgerRecorded: true,
    retryableReversalRecoveryStatePresent: false,
    providerTrafficAllowedBeforeCorrection: false,
  }) || typeof finding?.basis !== 'string' || finding.basis.length < 180
      || typeof finding?.requiredClosure !== 'string' || finding.requiredClosure.length < 180) {
    fail('WP73 blocking finding is incomplete or overstated.');
  }
}

function validateGate(value) {
  if (value.ownerGate?.id !== 'WP73_STRIPE_READONLY_REAUTH_REQUIRED'
      || value.ownerGate?.required !== true
      || value.ownerGate?.afterActionReadOnlyChecks?.length !== 7
      || [value.ownerGate?.doesNotAuthorizeCredentials,
        value.ownerGate?.doesNotAuthorizeProviderTraffic,
        value.ownerGate?.doesNotAuthorizeLiveMode,
        value.ownerGate?.doesNotAuthorizeBillingOrMoney].some((entry) => entry !== true)
      || typeof value.ownerGate?.exactAction !== 'string'
      || value.ownerGate.exactAction.length < 180) {
    fail('WP73 exact owner gate is incomplete.');
  }
  if (!exact(value.nextLocalPackage, {
    id: 'WP74',
    name: 'Stripe dispute transfer-recovery integrity',
    mayRunWithoutProviderAccess: true,
    scope: 'Close the proven paid-transfer chargeback recovery gap locally with deterministic provider fakes, PostgreSQL integration coverage, explicit uncertain-state recovery and no external Stripe call.',
  })) fail('WP73 safe next local package has drifted.');
}

function validateVerification(repositoryRoot, value, checkGitState) {
  const pending = {
    implementationHead: null,
    focusedTests: 'pending',
    fullLocalRegression: 'pending',
    localToolTestsPassed: null,
    githubRegressionRun: null,
    githubCodeqlRun: null,
    openPrMergeAlerts: null,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status === 'implemented-pending-local-github') {
    if (!exact(value.verification, pending)) fail('WP73 pending verification is invalid.');
    return;
  }
  const complete = {
    implementationHead: '__IMPLEMENTATION_HEAD__',
    focusedTests: 'passed-51',
    fullLocalRegression: 'passed',
    localToolTestsPassed: '__TOOL_TEST_COUNT__',
    githubRegressionRun: '__REGRESSION_RUN__',
    githubCodeqlRun: '__CODEQL_RUN__',
    openPrMergeAlerts: 0,
    pullRequest7: 'draft-open-mergeable-unmerged',
  };
  if (value.status !== 'complete-local-github' || !exact(value.verification, complete)) {
    fail('WP73 complete verification is invalid.');
  }
  if (checkGitState) assertAncestor(repositoryRoot, value.verification.implementationHead);
}

export function validateWp73StripeSandboxCompatibilityInventory({
  repositoryRoot = root,
  evidence,
  checkGitState = true,
} = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, evidencePath), 'utf8'));
  if (value.schemaVersion !== 1
      || value.kind !== 'sit-wp73-stripe-sandbox-compatibility-inventory'
      || value.capturedOn !== '2026-09-09') fail('WP73 identity is invalid.');
  if (!exact(value.repository, {
    branch: 'codex/master-workflow-20260808',
    packageBaseHead: '37800aeba9ae1dd0d0a7ca0c30bb2c6a2da52f48',
    pullRequest7: 'draft-open-mergeable-unmerged',
    mobileRuntimeChanged: false,
    backendRuntimeChanged: false,
  })) fail('WP73 repository binding is invalid.');
  if (checkGitState) assertAncestor(repositoryRoot, value.repository.packageBaseHead);
  validateSources(repositoryRoot, value);
  validateRepositoryContracts(repositoryRoot);
  validateProviderObservation(value);
  validateCompatibility(value);
  validateGate(value);
  validateVerification(repositoryRoot, value, checkGitState);
  if (Object.values(value.boundaries ?? {}).some((entry) => entry === true)
      && !exact(value.boundaries, {
        readOnlyPackage: true,
        stripeConnectorReauthenticated: false,
        stripeDashboardChanged: false,
        stripeApiCalled: false,
        credentialCreatedReadExtractedOrCommitted: false,
        paymentProductCreated: false,
        connectedAccountCreated: false,
        eventDestinationCreated: false,
        sandboxPaymentAttempted: false,
        realMoneyUsed: false,
        billingChanged: false,
        stagingChanged: false,
        productionChanged: false,
        mobileRuntimeChanged: false,
        backendRuntimeChanged: false,
        googlePlayChanged: false,
        firebaseCloudVpsDnsChanged: false,
        deviceContacted: false,
        pullRequestMerged: false,
        containsSecrets: false,
        containsPersonalIdentity: false,
        containsPrivateFilesystemPath: false,
      })) fail('WP73 boundary evidence is invalid.');
  const serialized = JSON.stringify(value);
  if (/\/(?:Users|home)\/|@[A-Za-z0-9]|\+49[0-9]|BEGIN PRIVATE|\b(?:sk|rk)_(?:test|live)_|\bwhsec_|access_token|refresh_token|deviceSerial|androidId|\bimei\b/iu.test(serialized)) {
    fail('WP73 evidence contains private or secret-shaped content.');
  }
  return Object.freeze({
    status: value.status,
    overallVerdict: value.compatibility.overallVerdict,
    blockingFinding: value.blockingFinding.id,
    ownerGate: value.ownerGate.id,
    nextLocalPackage: value.nextLocalPackage.id,
    providerChanged: value.providerObservation.providerObjectCreatedOrChanged,
  });
}

async function run() {
  process.stdout.write(`${JSON.stringify(validateWp73StripeSandboxCompatibilityInventory(), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await run(); } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP73 validation failed.'}\n`);
    process.exitCode = 1;
  }
}
