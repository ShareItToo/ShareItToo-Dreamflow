#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = 'store/google-play/sit-pilot-feature-scope-20260917.json';
const scopeId = 'SIT-PILOT-FEATURE-SCOPE-20260917';
const forbiddenPilotFlags = Object.freeze([
  'realMoney',
  'paidDelivery',
  'shipping',
  'express',
  'vehicles',
  'deposit',
  'insurance',
]);
const forbiddenEffectTerms = /(?:real[- ]money|paid[- ]delivery|shipping|express|vehicle|deposit|insurance|placeholder|demo[- ]only|toast[- ]only|no[- ]op)/iu;

function fail(message) {
  throw new Error(`BLOCK:${scopeId}:${message}`);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validateManifest(manifest = readJson(manifestPath), { repositoryRoot = root } = {}) {
  assert(manifest?.schemaVersion === 1, 'schema_version_invalid');
  assert(manifest?.kind === 'sit-pilot-feature-scope-20260917', 'kind_invalid');
  assert(manifest?.pilot?.region === 'Germany', 'pilot_region_invalid');
  assert(manifest?.pilot?.mode === 'private-adult-staging', 'pilot_mode_invalid');
  assert(manifest?.pilot?.applicationId === 'com.shareittoo.app', 'application_id_invalid');
  assert(manifest?.pilot?.releaseChannel === 'internal', 'release_channel_invalid');
  for (const flag of forbiddenPilotFlags) {
    assert(manifest.pilot[flag] === false, `pilot_boundary_${flag}_must_be_false`);
  }
  assert(manifest?.candidate?.versionName === '1.0.0', 'candidate_version_name_invalid');
  assert(/^2026091705$/u.test(String(manifest?.candidate?.versionCode ?? '')), 'candidate_version_code_invalid');
  assert(manifest?.runtimeEvidence?.source === 'real-public-green-staging-readback',
    'runtime_evidence_source_invalid');
  assert(typeof manifest.runtimeEvidenceRef === 'string'
      && existsSync(resolve(repositoryRoot, manifest.runtimeEvidenceRef)),
    'runtime_evidence_ref_missing');
  const recordedRuntimeEvidence = JSON.parse(readFileSync(
    resolve(repositoryRoot, manifest.runtimeEvidenceRef), 'utf8',
  ));
  assert(recordedRuntimeEvidence?.kind === 'sit-pilot-feature-scope-runtime-readback-20260919',
    'runtime_evidence_kind_invalid');
  assert(recordedRuntimeEvidence.environment === 'staging'
      && recordedRuntimeEvidence.publicReachability?.versionHttp === 200
      && recordedRuntimeEvidence.publicReachability.versionCommit === recordedRuntimeEvidence.runtimeCommit
      && recordedRuntimeEvidence.publicReachability.liveHttp === 200
      && recordedRuntimeEvidence.publicReachability.readyHttp === 200
      && recordedRuntimeEvidence.publicReachability.readyStatus === 'ok',
    'public_runtime_reachability_invalid');
  assert(recordedRuntimeEvidence.promotionEvidence?.path
      === '/docker/shareittoo/green-promotions/9b20afed8f4d-attempt13/evidence.json'
      && recordedRuntimeEvidence.promotionEvidence.sha256
        === 'c9dc9ab644887fea8e34480e0d651c95c1873fbe3f3ebb4fe2da6044691b28bb'
      && recordedRuntimeEvidence.promotionEvidence.mode === '0600',
    'promotion_evidence_binding_invalid');
  const authenticated = recordedRuntimeEvidence.authenticatedSyntheticReadback;
  assert(authenticated?.loginHttp === 200
      && authenticated.authMeHttp === 200
      && authenticated.userId === 'synthetic_sandbox_user_pilot_20260919'
      && authenticated.userIdMatchesProvisionedIdentity === true
      && authenticated.accountStatus === 'active'
      && authenticated.syntheticOnly === true
      && authenticated.logoutHttp === 204,
    'authenticated_synthetic_readback_invalid');
  assert(authenticated.paymentCapabilities?.http === 200
      && authenticated.paymentCapabilities.provider === null
      && authenticated.paymentCapabilities.providerBacked === false
      && authenticated.paymentCapabilities.normalCheckoutAvailable === false
      && authenticated.paymentCapabilities.liveMoney === false,
    'authenticated_payment_readback_invalid');
  assert(authenticated.technicalSandbox?.available === true
      && authenticated.technicalSandbox.provider === 'stripe'
      && authenticated.technicalSandbox.mode === 'test'
      && authenticated.technicalSandbox.amountMinor === 100
      && authenticated.technicalSandbox.currency === 'EUR'
      && authenticated.technicalSandbox.maxRuns === 3
      && authenticated.technicalSandbox.syntheticOnly === true
      && authenticated.technicalSandbox.liveMoney === false
      && authenticated.technicalSandbox.bookingEffects === false
      && authenticated.technicalSandbox.ledgerEffects === false
      && authenticated.technicalSandbox.connectEffects === false,
    'authenticated_technical_sandbox_readback_invalid');
  assert(authenticated.mfa?.statusHttp === 200
      && authenticated.mfa.enabled === false
      && authenticated.mfa.pending === false
      && authenticated.mfa.recoveryCodesRemaining === 0,
    'authenticated_mfa_readback_invalid');
  assert(authenticated.identityVerification?.statusHttp === 200
      && authenticated.identityVerification.status === 'not_started'
      && authenticated.identityVerification.livemode === false
      && authenticated.identityVerification.redactionStatus === null,
    'authenticated_identity_readback_invalid');
  const boundaries = recordedRuntimeEvidence.boundaries;
  assert(boundaries?.credentialsRecorded === false
      && boundaries.tokensRecorded === false
      && boundaries.providerMutation === false
      && boundaries.production === false
      && boundaries.normalPaymentChanged === false,
    'runtime_boundary_invalid');
  assert(JSON.stringify(recordedRuntimeEvidence.backendShortCommit)
      === JSON.stringify(manifest.runtimeEvidence.backendShortCommit)
      && JSON.stringify(recordedRuntimeEvidence.runtimeCommit)
        === JSON.stringify(manifest.runtimeEvidence.runtimeCommit)
      && JSON.stringify(recordedRuntimeEvidence.opsCommit)
        === JSON.stringify(manifest.runtimeEvidence.opsCommit)
      && JSON.stringify(recordedRuntimeEvidence.schema)
        === JSON.stringify(manifest.runtimeEvidence.schema)
      && JSON.stringify(recordedRuntimeEvidence.payment)
        === JSON.stringify(manifest.runtimeEvidence.payment)
      && JSON.stringify(recordedRuntimeEvidence.technicalSandbox)
        === JSON.stringify(manifest.runtimeEvidence.technicalSandbox)
      && JSON.stringify(recordedRuntimeEvidence.mfa)
        === JSON.stringify(manifest.runtimeEvidence.mfa)
      && JSON.stringify(recordedRuntimeEvidence.identityVerification)
        === JSON.stringify(manifest.runtimeEvidence.identityVerification),
    'runtime_evidence_manifest_drift');
  assert(/^[0-9a-f]{12}$/u.test(String(manifest?.runtimeEvidence?.backendShortCommit ?? '')),
    'runtime_backend_commit_invalid');
  assert(/^[0-9a-f]{40}$/u.test(String(manifest?.runtimeEvidence?.runtimeCommit ?? '')),
    'runtime_commit_invalid');
  assert(/^[0-9a-f]{40}$/u.test(String(manifest?.runtimeEvidence?.opsCommit ?? '')),
    'ops_commit_invalid');
  assert(manifest.runtimeEvidence.schema === 92, 'runtime_schema_invalid');
  assert(manifest.runtimeEvidence.payment?.capabilitiesHttp === 200
      && manifest.runtimeEvidence.payment.provider === null
      && manifest.runtimeEvidence.payment.providerBacked === false
      && manifest.runtimeEvidence.payment.normalCheckoutAvailable === false
      && manifest.runtimeEvidence.payment.liveMoney === false
      && manifest.runtimeEvidence.payment.transport === 'memory'
      && manifest.runtimeEvidence.payment.providerStatus === 'disabled'
      && manifest.runtimeEvidence.payment.mode === 'unavailable'
      && manifest.runtimeEvidence.payment.livemode === false,
    'payment_runtime_boundary_invalid');
  const technicalSandbox = manifest.runtimeEvidence.technicalSandbox;
  assert(technicalSandbox?.available === true
      && technicalSandbox.provider === 'stripe'
      && technicalSandbox.mode === 'test'
      && technicalSandbox.amountMinor === 100
      && technicalSandbox.currency === 'EUR'
      && technicalSandbox.maxRuns === 3
      && technicalSandbox.syntheticOnly === true
      && technicalSandbox.liveMoney === false
      && technicalSandbox.bookingEffects === false
      && technicalSandbox.ledgerEffects === false
      && technicalSandbox.connectEffects === false,
    'technical_sandbox_runtime_boundary_invalid');
  assert(manifest.runtimeEvidence.mfa?.statusHttp === 200
      && manifest.runtimeEvidence.mfa.enabled === false
      && manifest.runtimeEvidence.mfa.pending === false
      && manifest.runtimeEvidence.mfa.recoveryCodesRemaining === 0,
    'mfa_runtime_parity_invalid');
  assert(manifest.runtimeEvidence.identityVerification?.statusHttp === 200
      && manifest.runtimeEvidence.identityVerification.status === 'not_started'
      && manifest.runtimeEvidence.identityVerification.livemode === false
      && manifest.runtimeEvidence.identityVerification.redactionStatus === null,
    'identityVerification_runtime_parity_invalid');
  assert(Array.isArray(manifest.reachablePaths) && manifest.reachablePaths.length >= 1,
    'reachable_inventory_too_small');
  assert(Array.isArray(manifest.expectedReachableGroups)
      && manifest.expectedReachableGroups.length >= 1,
    'expected_reachable_groups_missing');

  const blockers = [];
  const ids = new Set();
  const classifiedGroups = new Set();
  for (const entry of manifest.reachablePaths) {
    assert(entry && typeof entry === 'object', 'path_entry_not_object');
    assert(typeof entry.id === 'string' && entry.id.length > 0, 'path_id_missing');
    assert(!ids.has(entry.id), `duplicate_path:${entry.id}`);
    ids.add(entry.id);
    if (entry.reachable === false) {
      assert(entry.pilot === 'excluded' && typeof entry.condition === 'string'
          && entry.condition.length > 0,
        `conditional_path_without_explicit_condition:${entry.id}`);
    }
    assert(typeof entry.route === 'string' && entry.route.length > 0, `route_missing:${entry.id}`);
    assert(typeof entry.source === 'string' && existsSync(resolve(repositoryRoot, entry.source)),
      `source_missing:${entry.id}`);
    const source = readFileSync(resolve(repositoryRoot, entry.source), 'utf8');
    assert(typeof entry.reachabilityMarker === 'string' && source.includes(entry.reachabilityMarker),
      `reachability_marker_missing:${entry.id}`);
    assert(typeof entry.effect === 'string' && entry.effect.length > 0, `effect_missing:${entry.id}`);
    assert(!forbiddenEffectTerms.test(entry.effect), `unsafe_or_deceptive_effect:${entry.id}`);
    assert(Array.isArray(entry.proof) && entry.proof.length > 0, `proof_missing:${entry.id}`);
    for (const proof of entry.proof) {
      assert(typeof proof === 'string' && existsSync(resolve(repositoryRoot, proof)),
        `proof_missing:${entry.id}:${proof}`);
    }
    assert(entry.pilot === 'allowed' || entry.pilot === 'excluded', `pilot_state_invalid:${entry.id}`);
    if (entry.reachable !== false && entry.pilot === 'excluded') {
      assert(typeof entry.blocker === 'string' && entry.blocker.length > 0,
        `excluded_path_without_blocker:${entry.id}`);
      blockers.push({ id: entry.id, route: entry.route, blocker: entry.blocker });
    }
    if (entry.runtimeEvidence != null) {
      assert(entry.runtimeEvidence === 'payment'
          || entry.runtimeEvidence === 'mfa'
          || entry.runtimeEvidence === 'identityVerification',
        `runtime_evidence_ref_invalid:${entry.id}`);
    }
    classifiedGroups.add(entry.id);
  }
  for (const expected of manifest.expectedReachableGroups) {
    assert(classifiedGroups.has(expected), `reachable_group_unclassified:${expected}`);
  }
  assert(Array.isArray(manifest.conditionalPaths) && manifest.conditionalPaths.length > 0,
    'conditional_inventory_missing');
  for (const entry of manifest.conditionalPaths) {
    assert(entry && typeof entry === 'object', 'conditional_entry_not_object');
    assert(typeof entry.id === 'string' && entry.id.length > 0, 'conditional_id_missing');
    assert(typeof entry.condition === 'string' && entry.condition.length > 0,
      `conditional_condition_missing:${entry.id}`);
    assert(typeof entry.excludedReason === 'string' && entry.excludedReason.length > 0,
      `conditional_reason_missing:${entry.id}`);
    assert(typeof entry.source === 'string' && existsSync(resolve(repositoryRoot, entry.source)),
      `conditional_source_missing:${entry.id}`);
    const source = readFileSync(resolve(repositoryRoot, entry.source), 'utf8');
    assert(source.includes(entry.reachabilityMarker), `conditional_marker_missing:${entry.id}`);
    assert(Array.isArray(entry.proof) && entry.proof.length > 0,
      `conditional_proof_missing:${entry.id}`);
    for (const proof of entry.proof) {
      assert(typeof proof === 'string' && existsSync(resolve(repositoryRoot, proof)),
        `conditional_proof_missing:${entry.id}:${proof}`);
    }
  }

  const result = {
    gate: scopeId,
    status: blockers.length === 0 ? 'PASS' : 'BLOCK',
    candidate: manifest.candidate,
    inventoryCount: manifest.reachablePaths.length,
    allowedCount: manifest.reachablePaths.filter((entry) => entry.pilot === 'allowed').length,
    blockerCount: blockers.length,
    blockers,
  };
  if (blockers.length > 0) {
    fail(`reachable_excluded_paths=${blockers.map((entry) => entry.id).join(',')}`);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateManifest())}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export { validateManifest };
