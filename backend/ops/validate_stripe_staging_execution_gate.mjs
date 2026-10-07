#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(moduleDirectory, '..', '..');
const readinessEvidencePath = 'docs/evidence/release-readiness/wp146-stripe-payout-and-activation-guard-20260914.json';
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u;
const requiredEvidenceReferences = Object.freeze([
  'licensedProduct',
  'executedContract',
  'approvedProductConfiguration',
  'sandboxAccount',
  'dpa',
  'processingRegions',
  'transferMechanism',
  'professionalReview',
  'providerDashboardIdentity',
  'platformWebhookDestination',
  'connectWebhookDestination',
]);

function fail(code) {
  const error = new Error('Stripe Staging execution gate failed.');
  error.code = code;
  throw error;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function inspectGateFile(filePath, repositoryRoot) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    fail('stripe_staging_execution_gate_path_invalid');
  }
  let resolvedRepository;
  try {
    resolvedRepository = realpathSync(repositoryRoot);
  } catch {
    fail('stripe_staging_execution_gate_unavailable');
  }
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(
      filePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC,
    );
    const descriptorMetadata = fstatSync(descriptor);
    const pathMetadata = lstatSync(filePath);
    const resolvedFile = realpathSync(filePath);
    if (!descriptorMetadata.isFile() || !pathMetadata.isFile()
        || pathMetadata.isSymbolicLink()
        || descriptorMetadata.dev !== pathMetadata.dev
        || descriptorMetadata.ino !== pathMetadata.ino
        || descriptorMetadata.nlink !== 1) {
      fail('stripe_staging_execution_gate_type_invalid');
    }
    if (isInside(resolvedRepository, resolvedFile)) {
      fail('stripe_staging_execution_gate_inside_repository');
    }
    const currentUid = process.getuid?.();
    if ((descriptorMetadata.uid !== 0 && descriptorMetadata.uid !== currentUid)
        || (descriptorMetadata.mode & 0o777) !== 0o600) {
      fail('stripe_staging_execution_gate_permissions_invalid');
    }
    if (descriptorMetadata.size < 256 || descriptorMetadata.size > 32_768) {
      fail('stripe_staging_execution_gate_size_invalid');
    }
    bytes = readFileSync(descriptor);
    return bytes;
  } catch (error) {
    if (String(error?.code ?? '').startsWith('stripe_staging_execution_gate_')) throw error;
    if (error?.code === 'ELOOP') fail('stripe_staging_execution_gate_type_invalid');
    fail('stripe_staging_execution_gate_unavailable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function loadReadinessEvidence(repositoryRoot, deploymentCommit) {
  try {
    return execFileSync(
      'git',
      ['show', `${deploymentCommit}:${readinessEvidencePath}`],
      { cwd: repositoryRoot, encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    fail('stripe_staging_readiness_evidence_unavailable');
  }
}

export function verifyStripeBackendCommitBinding({
  repositoryRoot,
  implementationCommit,
  deploymentCommit,
}) {
  if (!/^[0-9a-f]{40}$/u.test(implementationCommit ?? '')) {
    fail('stripe_staging_readiness_implementation_commit_invalid');
  }
  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', implementationCommit, deploymentCommit],
      { cwd: repositoryRoot, stdio: 'ignore' },
    );
    const backendDrift = execFileSync(
      'git',
      ['diff', '--name-only', '--no-renames', `${implementationCommit}..${deploymentCommit}`, '--', 'backend'],
      { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (backendDrift) fail('stripe_staging_readiness_backend_drift');
  } catch (error) {
    if (String(error?.code ?? '').startsWith('stripe_staging_readiness_')) throw error;
    fail('stripe_staging_readiness_commit_binding_invalid');
  }
}

function normalizedPilotUserIds(value) {
  if (typeof value !== 'string') fail('stripe_staging_pilot_users_invalid');
  const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  const unique = [...new Set(ids)].sort();
  if (ids.length !== unique.length || unique.length < 3 || unique.length > 12
      || unique.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u.test(id))) {
    fail('stripe_staging_pilot_users_invalid');
  }
  return unique;
}

function assertReadinessEvidence(evidence, deploymentCommit, verifyRuntimeBinding, repositoryRoot) {
  if (!exactKeys(evidence, [
    'schemaVersion', 'kind', 'version', 'implementationCommit', 'state',
    'providerObservation', 'activationPreflight', 'boundaries',
  ])
      || evidence.schemaVersion !== 1
      || evidence.kind !== 'wp146-stripe-payout-and-activation-guard-evidence'
      || evidence.version !== 'WP146-2026-09-14.1'
      || evidence.state !== 'provider-sandbox-preflight-ready') {
    fail('stripe_staging_readiness_evidence_identity_invalid');
  }
  verifyRuntimeBinding({
    repositoryRoot,
    implementationCommit: evidence.implementationCommit,
    deploymentCommit,
  });
  const observation = evidence.providerObservation;
  if (!exactKeys(observation, [
    'officialConnectorAuthenticated', 'accountMode', 'livemode',
    'providerReadOnly', 'connectedAccountCount', 'webhookDestinationCount',
  ])
      || observation.officialConnectorAuthenticated !== true
      || observation.accountMode !== 'sandbox'
      || observation.livemode !== false
      || observation.providerReadOnly !== true
      || !Number.isSafeInteger(observation.connectedAccountCount)
      || observation.connectedAccountCount < 0
      || observation.webhookDestinationCount !== 2) {
    fail('stripe_staging_readiness_provider_observation_invalid');
  }
  const preflight = evidence.activationPreflight;
  if (!exactKeys(preflight, [
    'runbookVersion', 'authorizationToken', 'provider', 'product',
    'paymentPattern', 'licensedMarketplaceProductVerified',
    'operatorControlVerified', 'productConfigurationApproved', 'dpaVerified',
    'processingRegionsVerified', 'transferMechanismVerified',
    'professionalReviewApproved', 'checkoutWithdrawalRefundModelApproved',
    'testServerKeyPresent', 'platformWebhookSecretPresent',
    'connectWebhookSecretPresent', 'providerCliOrEquivalentAvailable',
    'evidenceReferences',
  ])
      || preflight.runbookVersion !== 'P0B-PSP-2026-08-21.1'
      || preflight.authorizationToken !== 'P0B_NEXT_PSP_SANDBOX_E2E_ONLY'
      || preflight.provider !== 'stripe'
      || preflight.product !== 'connect-marketplace'
      || preflight.paymentPattern !== 'separate-charges-and-transfers'
      || [
        'licensedMarketplaceProductVerified', 'operatorControlVerified',
        'productConfigurationApproved', 'dpaVerified', 'processingRegionsVerified',
        'transferMechanismVerified', 'professionalReviewApproved',
        'checkoutWithdrawalRefundModelApproved', 'testServerKeyPresent',
        'platformWebhookSecretPresent', 'connectWebhookSecretPresent',
        'providerCliOrEquivalentAvailable',
      ].some((key) => preflight[key] !== true)
      || !exactKeys(preflight.evidenceReferences, requiredEvidenceReferences)
      || requiredEvidenceReferences.some(
        (key) => !safeReferencePattern.test(preflight.evidenceReferences[key] ?? ''),
      )) {
    fail('stripe_staging_readiness_preflight_invalid');
  }
  if (!exactKeys(evidence.boundaries, [
    'sandboxOnly', 'syntheticUsersOnly', 'realMoneyAuthorized',
    'productionAuthorized', 'storeAuthorized',
  ])
      || evidence.boundaries.sandboxOnly !== true
      || evidence.boundaries.syntheticUsersOnly !== true
      || evidence.boundaries.realMoneyAuthorized !== false
      || evidence.boundaries.productionAuthorized !== false
      || evidence.boundaries.storeAuthorized !== false) {
    fail('stripe_staging_readiness_boundaries_invalid');
  }
}

export function validateStripeStagingExecutionGate({
  gateFile,
  deploymentCommit,
  pilotId,
  pilotUserIds,
  authorizationId,
  authorizationIssuedAt,
  authorizationExpiresAt,
  repositoryRoot = defaultRepositoryRoot,
  readinessEvidenceBytes = undefined,
  verifyRuntimeBinding = verifyStripeBackendCommitBinding,
  now = new Date(),
}) {
  let gateBytes;
  let evidenceBytes;
  try {
    gateBytes = inspectGateFile(gateFile, repositoryRoot);
    evidenceBytes = readinessEvidenceBytes == null
      ? loadReadinessEvidence(repositoryRoot, deploymentCommit)
      : Buffer.from(readinessEvidenceBytes);
    let gate;
    let evidence;
    try {
      gate = JSON.parse(gateBytes.toString('utf8'));
      evidence = JSON.parse(evidenceBytes.toString('utf8'));
    } catch {
      fail('stripe_staging_execution_gate_json_invalid');
    }
    if (!/^[0-9a-f]{40}$/u.test(deploymentCommit ?? '')) {
      fail('stripe_staging_execution_gate_commit_invalid');
    }
    assertReadinessEvidence(
      evidence,
      deploymentCommit,
      verifyRuntimeBinding,
      repositoryRoot,
    );
    const users = normalizedPilotUserIds(pilotUserIds);
    if (!exactKeys(gate, [
      'schemaVersion', 'kind', 'status', 'deploymentCommit', 'pilotId',
      'authorizationId', 'readinessEvidenceSha256', 'pilotUserIdsSha256',
      'issuedAt', 'expiresAt', 'abortControl', 'safety',
    ])
        || gate.schemaVersion !== 1
        || gate.kind !== 'sit-stripe-staging-sandbox-execution-gate'
        || gate.status !== 'approved'
        || gate.deploymentCommit !== deploymentCommit
        || gate.pilotId !== 'heilbronn_wave0'
        || pilotId !== 'heilbronn_wave0'
        || gate.authorizationId !== authorizationId
        || !safeReferencePattern.test(gate.authorizationId ?? '')
        || gate.readinessEvidenceSha256 !== sha256(evidenceBytes)
        || gate.pilotUserIdsSha256 !== sha256(JSON.stringify(users))
        || gate.issuedAt !== authorizationIssuedAt
        || gate.expiresAt !== authorizationExpiresAt) {
      fail('stripe_staging_execution_gate_facts_invalid');
    }
    if (!exactKeys(gate.abortControl, [
      'runtimeExpiryEnforced', 'memoryRedeployReviewed', 'memoryRedeployRef',
    ])
        || gate.abortControl.runtimeExpiryEnforced !== true
        || gate.abortControl.memoryRedeployReviewed !== true
        || gate.abortControl.memoryRedeployRef
          !== 'backend/ops/deploy_release.sh:staging-without-stripe-overlay') {
      fail('stripe_staging_execution_gate_abort_invalid');
    }
    if (!exactKeys(gate.safety, [
      'syntheticUsersOnly', 'realMoneyAuthorized', 'productionAuthorized',
    ])
        || gate.safety.syntheticUsersOnly !== true
        || gate.safety.realMoneyAuthorized !== false
        || gate.safety.productionAuthorized !== false) {
      fail('stripe_staging_execution_gate_safety_invalid');
    }
    const issuedAt = new Date(gate.issuedAt);
    const expiresAt = new Date(gate.expiresAt);
    const current = new Date(now);
    if (![issuedAt, expiresAt, current].every((value) => Number.isFinite(value.getTime()))
        || issuedAt > current
        || expiresAt <= current
        || expiresAt.getTime() - issuedAt.getTime() > 24 * 60 * 60 * 1000) {
      fail('stripe_staging_execution_gate_time_invalid');
    }
    const serialized = JSON.stringify(gate);
    if (/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+|@[A-Za-z0-9.-]+|\/(?:Users|home)\//u
      .test(serialized)) {
      fail('stripe_staging_execution_gate_private_material');
    }
    return Object.freeze({
      provider: 'stripe',
      product: 'connect-marketplace',
      accountMode: 'sandbox',
      livemode: false,
      deploymentCommit,
      pilotId,
      authorizedPilotUserCount: users.length,
      authorizationId,
      expiresAt: gate.expiresAt,
      executionAuthorized: true,
      realMoneyAuthorized: false,
      productionAuthorized: false,
    });
  } finally {
    gateBytes?.fill(0);
    evidenceBytes?.fill(0);
  }
}

function runCli() {
  validateStripeStagingExecutionGate({
    gateFile: process.env.SIT_PSP_SANDBOX_EXECUTION_GATE_FILE ?? '',
    deploymentCommit: process.env.SIT_DEPLOYMENT_COMMIT ?? '',
    pilotId: process.env.SIT_STAGING_PILOT_ID ?? '',
    pilotUserIds: process.env.PAYMENT_PILOT_USER_IDS ?? '',
    authorizationId: process.env.PAYMENT_SANDBOX_AUTHORIZATION_ID ?? '',
    authorizationIssuedAt: process.env.PAYMENT_SANDBOX_AUTH_ISSUED_AT ?? '',
    authorizationExpiresAt: process.env.PAYMENT_SANDBOX_AUTH_EXPIRES_AT ?? '',
  });
  process.stdout.write('Stripe Staging execution gate: PASS\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Stripe Staging execution gate failed.'}\n`);
    process.exitCode = 1;
  }
}
