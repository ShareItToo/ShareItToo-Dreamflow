import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const backendRoot = resolve(import.meta.dirname, '..');
const deployScript = join(backendRoot, 'ops', 'deploy_release.sh');
const commit = 'a'.repeat(40);
const authorizationId = 'WP146-AUTH-20260914-001';
const pilotUserIds = 'synthetic-admin,synthetic-owner,synthetic-renter';

function readyEvidence() {
  return {
    schemaVersion: 1,
    kind: 'wp146-stripe-payout-and-activation-guard-evidence',
    version: 'WP146-2026-09-14.1',
    implementationCommit: commit,
    state: 'provider-sandbox-preflight-ready',
    providerObservation: {
      officialConnectorAuthenticated: true,
      accountMode: 'sandbox', livemode: false, providerReadOnly: true,
      connectedAccountCount: 0, webhookDestinationCount: 2,
    },
    activationPreflight: {
      runbookVersion: 'P0B-PSP-2026-08-21.1',
      authorizationToken: 'P0B_NEXT_PSP_SANDBOX_E2E_ONLY',
      provider: 'stripe', product: 'connect-marketplace',
      paymentPattern: 'separate-charges-and-transfers',
      licensedMarketplaceProductVerified: true,
      operatorControlVerified: true,
      productConfigurationApproved: true,
      dpaVerified: true,
      processingRegionsVerified: true,
      transferMechanismVerified: true,
      professionalReviewApproved: true,
      checkoutWithdrawalRefundModelApproved: true,
      testServerKeyPresent: true,
      platformWebhookSecretPresent: true,
      connectWebhookSecretPresent: true,
      providerCliOrEquivalentAvailable: true,
      evidenceReferences: {
        licensedProduct: 'PSP-PRODUCT-2026-001',
        executedContract: 'PSP-CONTRACT-2026-001',
        approvedProductConfiguration: 'PSP-CONFIG-2026-001',
        sandboxAccount: 'PSP-SANDBOX-2026-001',
        dpa: 'PSP-DPA-2026-001',
        processingRegions: 'PSP-REGIONS-2026-001',
        transferMechanism: 'PSP-TRANSFER-2026-001',
        professionalReview: 'PSP-REVIEW-2026-001',
        providerDashboardIdentity: 'PSP-IDENTITY-2026-001',
        platformWebhookDestination: 'PSP-WEBHOOK-PLATFORM-2026-001',
        connectWebhookDestination: 'PSP-WEBHOOK-CONNECT-2026-001',
      },
    },
    boundaries: {
      sandboxOnly: true, syntheticUsersOnly: true, realMoneyAuthorized: false,
      productionAuthorized: false, storeAuthorized: false,
    },
  };
}

function approvedExecutionGate(evidence) {
  const issuedAt = new Date(Date.now() - 60_000);
  const expiresAt = new Date(issuedAt.getTime() + 60 * 60 * 1000);
  const evidenceBytes = Buffer.from(JSON.stringify(evidence));
  return {
    schemaVersion: 1,
    kind: 'sit-stripe-staging-sandbox-execution-gate',
    status: 'approved',
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    authorizationId,
    readinessEvidenceSha256: crypto.createHash('sha256').update(evidenceBytes).digest('hex'),
    pilotUserIdsSha256: crypto.createHash('sha256')
      .update(JSON.stringify(pilotUserIds.split(',').sort())).digest('hex'),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    abortControl: {
      runtimeExpiryEnforced: true,
      memoryRedeployReviewed: true,
      memoryRedeployRef: 'backend/ops/deploy_release.sh:staging-without-stripe-overlay',
    },
    safety: {
      syntheticUsersOnly: true,
      realMoneyAuthorized: false,
      productionAuthorized: false,
    },
  };
}

async function dockerFixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-deploy-stripe-test-'));
  const docker = join(root, 'docker');
  const git = join(root, 'git');
  const capture = join(root, 'docker-calls.txt');
  const evidence = readyEvidence();
  const evidenceFile = join(root, 'readiness-evidence.json');
  await writeFile(evidenceFile, JSON.stringify(evidence), { mode: 0o600 });
  await writeFile(docker, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$DOCKER_CAPTURE"
if [[ "$*" == *org.opencontainers.image.revision* ]]; then
  printf '%s\\n' "$MOCK_COMMIT"
elif [[ "$*" == *org.opencontainers.image.version* ]]; then
  printf '%s\\n' '0.1.0-test'
elif [[ "$*" == *org.opencontainers.image.created* ]]; then
  printf '%s\\n' '2026-09-05T00:00:00Z'
else
  exit 97
fi
`, { mode: 0o700 });
  await chmod(docker, 0o700);
  await writeFile(git, `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == show && "$2" == *wp146-stripe-payout-and-activation-guard-20260914.json ]]; then
  exec /bin/cat "$MOCK_STRIPE_READINESS_EVIDENCE"
fi
if [[ "$1" == merge-base && "$2" == --is-ancestor ]]; then
  exit 0
fi
if [[ "$1" == diff && "$2" == --name-only ]]; then
  exit 0
fi
exec /usr/bin/git "$@"
`, { mode: 0o700 });
  await chmod(git, 0o700);
  const executionGate = join(root, 'stripe-execution-gate.json');
  const gate = approvedExecutionGate(evidence);
  await writeFile(
    executionGate,
    `${JSON.stringify(gate, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(executionGate, 0o600);
  return { root, capture, executionGate, evidenceFile, gate };
}

function stripeAuthorizationEnv(fixture) {
  return {
    MOCK_STRIPE_READINESS_EVIDENCE: fixture.evidenceFile,
    PAYMENT_PILOT_USER_IDS: pilotUserIds,
    PAYMENT_SANDBOX_AUTHORIZATION_ID: authorizationId,
    PAYMENT_SANDBOX_AUTH_ISSUED_AT: fixture.gate.issuedAt,
    PAYMENT_SANDBOX_AUTH_EXPIRES_AT: fixture.gate.expiresAt,
  };
}

test('production rejects the Staging Stripe flag before invoking Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'production', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      ENABLE_STAGING_STRIPE: '1',
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /staging Stripe override is forbidden for production/u);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('Staging Stripe requires the exact commit confirmation before Docker', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      ENABLE_STAGING_STRIPE: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_STRIPE: 'b'.repeat(40),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CONFIRM_STAGING_STRIPE must equal the exact deployment commit/u);
  await assert.rejects(readFile(fixture.capture, 'utf8'), { code: 'ENOENT' });
});

test('Staging Stripe validates private files before Compose can run', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      NODE_BINARY: process.execPath,
      ENABLE_STAGING_STRIPE: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_STRIPE: commit,
      SIT_PSP_SANDBOX_EXECUTION_GATE_FILE: fixture.executionGate,
      ...stripeAuthorizationEnv(fixture),
      STRIPE_SECRET_KEY_HOST_FILE: join(fixture.root, 'missing-key'),
      STRIPE_WEBHOOK_SECRET_HOST_FILE: join(fixture.root, 'missing-webhook'),
      STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE: join(fixture.root, 'missing-connect-webhook'),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stripe Staging secret gate failed/u);
  const calls = await readFile(fixture.capture, 'utf8');
  assert.equal(calls.includes(' compose '), false);
  assert.equal(calls.split('\n').filter(Boolean).length, 3);
});

test('Staging Stripe requires the private exact-commit execution gate before secrets', async (t) => {
  const fixture = await dockerFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = spawnSync('bash', [deployScript, 'staging', commit], {
    cwd: backendRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.root}:${process.env.PATH}`,
      NODE_BINARY: process.execPath,
      ENABLE_STAGING_STRIPE: '1',
      SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
      CONFIRM_STAGING_STRIPE: commit,
      SIT_PSP_SANDBOX_EXECUTION_GATE_FILE: join(fixture.root, 'missing-gate'),
      ...stripeAuthorizationEnv(fixture),
      STRIPE_SECRET_KEY_HOST_FILE: join(fixture.root, 'missing-key'),
      STRIPE_WEBHOOK_SECRET_HOST_FILE: join(fixture.root, 'missing-webhook'),
      STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE: join(fixture.root, 'missing-connect-webhook'),
      DOCKER_CAPTURE: fixture.capture,
      MOCK_COMMIT: commit,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stripe Staging execution gate failed/u);
  const calls = await readFile(fixture.capture, 'utf8');
  assert.equal(calls.includes(' compose '), false);
  assert.equal(calls.split('\n').filter(Boolean).length, 3);
});

test('deployment source keeps Stripe Staging opt-in, file-only, test-only and sanitized', async () => {
  const [deploy, overlay, config, secretFiles, app, workflow] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(join(backendRoot, 'compose.staging.stripe.yml'), 'utf8'),
    readFile(join(backendRoot, 'src', 'config.js'), 'utf8'),
    readFile(join(backendRoot, 'src', 'stripe_secret_files.js'), 'utf8'),
    readFile(join(backendRoot, 'src', 'app.js'), 'utf8'),
    readFile(resolve(backendRoot, '..', '.github', 'workflows', 'regression.yml'), 'utf8'),
  ]);
  assert.match(deploy, /ENABLE_STAGING_STRIPE:-0/u);
  assert.match(deploy, /CONFIRM_STAGING_STRIPE/u);
  assert.match(deploy, /SIT_PSP_SANDBOX_EXECUTION_GATE_FILE/u);
  assert.match(deploy, /PAYMENT_SANDBOX_AUTH_EXPIRES_AT/u);
  assert.match(deploy, /validate_stripe_staging_execution_gate\.mjs/u);
  assert.match(deploy, /validate_stripe_staging_secrets\.mjs/u);
  assert.match(deploy, /Staging Stripe health does not confirm/u);
  assert.match(deploy, /PAYMENT_TRANSPORT: memory/u);
  assert.match(overlay, /PAYMENT_TRANSPORT: stripe/u);
  assert.match(overlay, /STRIPE_LIVEMODE: "false"/u);
  assert.match(overlay, /PAYMENT_PILOT_USER_IDS:\s+\$\{PAYMENT_PILOT_USER_IDS:\?/u);
  assert.match(overlay, /PAYMENT_SANDBOX_AUTHORIZATION_ID/u);
  for (const name of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
  ]) assert.match(overlay, new RegExp(`${name}: ""`, 'u'));
  for (const target of [
    '/run/secrets/stripe-secret-key',
    '/run/secrets/stripe-webhook-secret',
    '/run/secrets/stripe-connect-webhook-secret',
  ]) assert.match(overlay, new RegExp(target, 'u'));
  assert.equal((overlay.match(/read_only: true/gu) ?? []).length, 3);
  assert.equal((overlay.match(/create_host_path: false/gu) ?? []).length, 3);
  assert.doesNotMatch(overlay, /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/u);
  assert.match(config, /readStripeSecretConfiguration/u);
  assert.match(secretFiles, /Stripe Staging transport requires file credentials/u);
  assert.match(app, /const paymentProviderHealth = Object\.freeze\(\{/u);
  assert.equal((app.match(/paymentProvider: paymentProviderHealth/gu) ?? []).length, 2);
  assert.doesNotMatch(
    app.slice(app.indexOf('const paymentProviderHealth'), app.indexOf('const attemptFirebaseIdentityDeletion')),
    /(?:secretKey|webhookSecret|credentialPresent)/u,
  );
  assert.match(workflow, /-f compose\.staging\.stripe\.yml/u);
  for (const name of [
    'STRIPE_SECRET_KEY_HOST_FILE',
    'STRIPE_WEBHOOK_SECRET_HOST_FILE',
    'STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE',
  ]) assert.match(workflow, new RegExp(`${name}: /run/shareittoo-ci/`, 'u'));
});
