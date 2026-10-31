import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  validateStripeStagingExecutionGate,
  verifyStripeBackendCommitBinding,
} from '../ops/validate_stripe_staging_execution_gate.mjs';

const commit = 'a'.repeat(40);
const now = new Date('2026-09-14T10:00:00.000Z');
const issuedAt = '2026-09-14T09:30:00.000Z';
const expiresAt = '2026-09-14T10:30:00.000Z';
const authorizationId = 'WP146-AUTH-20260914-001';
const pilotUserIds = 'synthetic-admin,synthetic-owner,synthetic-renter';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readyEvidence(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'wp146-stripe-payout-and-activation-guard-evidence',
    version: 'WP146-2026-09-14.1',
    implementationCommit: commit,
    state: 'provider-sandbox-preflight-ready',
    providerObservation: {
      officialConnectorAuthenticated: true,
      accountMode: 'sandbox',
      livemode: false,
      providerReadOnly: true,
      connectedAccountCount: 0,
      webhookDestinationCount: 2,
    },
    activationPreflight: {
      runbookVersion: 'P0B-PSP-2026-08-21.1',
      authorizationToken: 'P0B_NEXT_PSP_SANDBOX_E2E_ONLY',
      provider: 'stripe',
      product: 'connect-marketplace',
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
      sandboxOnly: true,
      syntheticUsersOnly: true,
      realMoneyAuthorized: false,
      productionAuthorized: false,
      storeAuthorized: false,
    },
    ...overrides,
  };
}

function approvedGate(evidenceBytes, overrides = {}) {
  const users = pilotUserIds.split(',').sort();
  return {
    schemaVersion: 1,
    kind: 'sit-stripe-staging-sandbox-execution-gate',
    status: 'approved',
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    authorizationId,
    readinessEvidenceSha256: sha256(evidenceBytes),
    pilotUserIdsSha256: sha256(JSON.stringify(users)),
    issuedAt,
    expiresAt,
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
    ...overrides,
  };
}

async function gateFixture(gate) {
  const directory = await mkdtemp(join(tmpdir(), 'sit-stripe-execution-gate-'));
  const gateFile = join(directory, 'execution-gate.json');
  await writeFile(gateFile, `${JSON.stringify(gate, null, 2)}\n`, { mode: 0o600 });
  await chmod(gateFile, 0o600);
  return { directory, gateFile };
}

function validate(gateFile, evidenceBytes, options = {}) {
  return validateStripeStagingExecutionGate({
    gateFile,
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    pilotUserIds,
    authorizationId,
    authorizationIssuedAt: issuedAt,
    authorizationExpiresAt: expiresAt,
    readinessEvidenceBytes: evidenceBytes,
    verifyRuntimeBinding: ({ implementationCommit, deploymentCommit }) => {
      assert.equal(implementationCommit, commit);
      assert.equal(deploymentCommit, commit);
    },
    now,
    ...options,
  });
}

test('accepts an exact short-lived authorization only with immutable ready evidence', async (t) => {
  const evidenceBytes = Buffer.from(JSON.stringify(readyEvidence()));
  const fixture = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  assert.deepEqual(validate(fixture.gateFile, evidenceBytes), {
    provider: 'stripe',
    product: 'connect-marketplace',
    accountMode: 'sandbox',
    livemode: false,
    deploymentCommit: commit,
    pilotId: 'heilbronn_wave0',
    authorizedPilotUserCount: 3,
    authorizationId,
    expiresAt,
    executionAuthorized: true,
    realMoneyAuthorized: false,
    productionAuthorized: false,
  });
});

test('rejects hold evidence and any invented mandatory provider fact', async (t) => {
  const cases = [
    readyEvidence({ state: 'hold-provider-contract-credentials-and-sandbox-e2e' }),
    readyEvidence({ activationPreflight: {
      ...readyEvidence().activationPreflight,
      transferMechanismVerified: false,
    } }),
    readyEvidence({ providerObservation: {
      ...readyEvidence().providerObservation,
      webhookDestinationCount: 0,
    } }),
  ];
  for (const evidence of cases) {
    const evidenceBytes = Buffer.from(JSON.stringify(evidence));
    const fixture = await gateFixture(approvedGate(evidenceBytes));
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));
    assert.throws(
      () => validate(fixture.gateFile, evidenceBytes),
      (error) => String(error.code).startsWith('stripe_staging_readiness_'),
    );
  }
});

test('rejects an invalid implementation-to-deployment binding', async (t) => {
  const evidenceBytes = Buffer.from(JSON.stringify(readyEvidence()));
  const fixture = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  assert.throws(
    () => validate(fixture.gateFile, evidenceBytes, {
      verifyRuntimeBinding: () => {
        const error = new Error('invalid binding');
        error.code = 'stripe_staging_readiness_backend_drift';
        throw error;
      },
    }),
    (error) => error.code === 'stripe_staging_readiness_backend_drift',
  );
});

test('real Git binding permits evidence-only commits and rejects backend drift', async (t) => {
  const repository = await mkdtemp(join(tmpdir(), 'sit-stripe-git-binding-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  git('init', '--quiet');
  await mkdir(join(repository, 'backend'), { recursive: true });
  await mkdir(join(repository, 'docs'), { recursive: true });
  await writeFile(join(repository, 'backend', 'runtime.js'), 'export const value = 1;\n');
  git('add', 'backend/runtime.js');
  git('-c', 'user.name=SIT Test', '-c', 'user.email=sit@example.invalid',
    'commit', '--quiet', '-m', 'runtime');
  const implementationCommit = git('rev-parse', 'HEAD');
  await writeFile(join(repository, 'docs', 'evidence.md'), 'evidence\n');
  git('add', 'docs/evidence.md');
  git('-c', 'user.name=SIT Test', '-c', 'user.email=sit@example.invalid',
    'commit', '--quiet', '-m', 'evidence');
  const evidenceCommit = git('rev-parse', 'HEAD');
  assert.doesNotThrow(() => verifyStripeBackendCommitBinding({
    repositoryRoot: repository,
    implementationCommit,
    deploymentCommit: evidenceCommit,
  }));

  await writeFile(join(repository, 'backend', 'runtime.js'), 'export const value = 2;\n');
  git('add', 'backend/runtime.js');
  git('-c', 'user.name=SIT Test', '-c', 'user.email=sit@example.invalid',
    'commit', '--quiet', '-m', 'runtime drift');
  const driftCommit = git('rev-parse', 'HEAD');
  assert.throws(
    () => verifyStripeBackendCommitBinding({
      repositoryRoot: repository,
      implementationCommit,
      deploymentCommit: driftCommit,
    }),
    (error) => error.code === 'stripe_staging_readiness_backend_drift',
  );
});

test('rejects evidence hash, users, commit, live boundary and expiry drift', async (t) => {
  const evidenceBytes = Buffer.from(JSON.stringify(readyEvidence()));
  const cases = [
    [approvedGate(evidenceBytes, { readinessEvidenceSha256: 'b'.repeat(64) }), {}],
    [approvedGate(evidenceBytes, { deploymentCommit: 'b'.repeat(40) }), {}],
    [approvedGate(evidenceBytes, { safety: {
      syntheticUsersOnly: true, realMoneyAuthorized: true, productionAuthorized: false,
    } }), {}],
    [approvedGate(evidenceBytes, { expiresAt: '2026-09-14T10:00:00.000Z' }), {
      authorizationExpiresAt: '2026-09-14T10:00:00.000Z',
    }],
  ];
  for (const [gate, options] of cases) {
    const fixture = await gateFixture(gate);
    t.after(() => rm(fixture.directory, { recursive: true, force: true }));
    assert.throws(() => validate(fixture.gateFile, evidenceBytes, options));
  }
  const fixture = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  assert.throws(
    () => validate(fixture.gateFile, evidenceBytes, { pilotUserIds: 'owner,renter' }),
    (error) => error.code === 'stripe_staging_pilot_users_invalid',
  );
});

test('rejects unsafe locations, links and permissions', async (t) => {
  const evidenceBytes = Buffer.from(JSON.stringify(readyEvidence()));
  assert.throws(
    () => validate('relative-gate.json', evidenceBytes),
    (error) => error.code === 'stripe_staging_execution_gate_path_invalid',
  );
  const fixture = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  await chmod(fixture.gateFile, 0o644);
  assert.throws(
    () => validate(fixture.gateFile, evidenceBytes),
    (error) => error.code === 'stripe_staging_execution_gate_permissions_invalid',
  );
  const linked = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(linked.directory, { recursive: true, force: true }));
  const symlinkFile = join(linked.directory, 'execution-gate-link.json');
  await symlink(linked.gateFile, symlinkFile);
  assert.throws(
    () => validate(symlinkFile, evidenceBytes),
    (error) => error.code === 'stripe_staging_execution_gate_type_invalid',
  );
  const hardLinked = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(hardLinked.directory, { recursive: true, force: true }));
  const hardLinkFile = join(hardLinked.directory, 'execution-gate-hard-link.json');
  await link(hardLinked.gateFile, hardLinkFile);
  assert.throws(
    () => validate(hardLinkFile, evidenceBytes),
    (error) => error.code === 'stripe_staging_execution_gate_type_invalid',
  );
  const repositoryFixture = await gateFixture(approvedGate(evidenceBytes));
  t.after(() => rm(repositoryFixture.directory, { recursive: true, force: true }));
  const repositoryRoot = join(repositoryFixture.directory, 'repository');
  await mkdir(repositoryRoot);
  const inRepository = join(repositoryRoot, 'execution-gate.json');
  await writeFile(inRepository, `${JSON.stringify(approvedGate(evidenceBytes))}\n`, { mode: 0o600 });
  assert.throws(
    () => validate(inRepository, evidenceBytes, { repositoryRoot }),
    (error) => error.code === 'stripe_staging_execution_gate_inside_repository',
  );
});

test('rejects credential-shaped or identity material in the authorization artifact', async (t) => {
  const evidenceBytes = Buffer.from(JSON.stringify(readyEvidence()));
  const fixture = await gateFixture(approvedGate(evidenceBytes, {
    authorizationId: `rk_test_${'x'.repeat(24)}`,
  }));
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  assert.throws(() => validate(fixture.gateFile, evidenceBytes, {
    authorizationId: `rk_test_${'x'.repeat(24)}`,
  }));
});
