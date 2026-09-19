import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertGreenCleanup,
  assertGreenContainerInventory,
  assertGreenRuntimeConfig,
  assertGreenRuntimeImage,
  assertGreenTargetManifest,
  buildGreenPromotionCommands,
  buildGreenPromotionPlan,
  greenTarget,
  sanitizeGreenEvidence,
  writeGreenEvidence,
} from '../ops/green_staging_promotion.mjs';

const runtimeCommit = '266f69c21dd61bfcdb212c24a0c8788b172bed9e';
const opsCommit = '8fecd57018ab10a0c6733531539472e6179a02db';
const targetManifest = {
  kind: 'sit-green-staging-target', schemaVersion: 1, composeProject: 'sit-green',
  greenLabel: 'com.shareittoo.sit.green=true', runId: greenTarget.runId,
  apiContainer: greenTarget.apiContainer, databaseContainer: greenTarget.databaseContainer,
  databaseVolume: greenTarget.databaseVolume, network: greenTarget.network,
  providerNetwork: greenTarget.providerNetwork, uploadsVolume: greenTarget.uploadsVolume,
  networkInternal: true, sourceSchema: 87, currentSchema: 92, targetDigest: 'a'.repeat(64),
};
const config = {
  environment: 'staging', envFile: '/docker/shareittoo/staging-secrets/green.env',
  envNames: ['NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'JWT_SECRET', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER', 'SIT_LISTING_AI_EXTERNAL_ALLOWED', 'ACCESS_GATE_MODE', 'ACCESS_GATE_USER_IDS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'FCM_PROJECT_ID', 'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_ENABLED', 'SIT_STAGING_COMPOSE_PROJECT', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE', 'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE'],
  mfaFile: '/docker/shareittoo/staging-secrets/mfa-encryption-key',
  firebaseFile: '/docker/shareittoo/staging-secrets/firebase.json',
  technicalSandboxKeyFile: '/docker/shareittoo/staging-secrets/technical-sandbox-key',
  technicalSandboxWebhookFile: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook',
  syntheticUserId: 'synthetic_sandbox_user_pilot_20260919', paymentTransport: 'memory',
  stripeLiveMode: false, identityTransport: 'memory', listingAiProvider: 'on_device',
  listingAiExternalAllowed: false, accessGateDigest: 'b'.repeat(64), providerConfigDigest: 'c'.repeat(64),
  mounts: [
    { source: '/docker/shareittoo/staging-secrets/mfa-encryption-key', destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/firebase.json', destination: '/run/secrets/firebase.json', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-key', destination: '/run/secrets/technical-sandbox-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook', destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/synthetic-sandbox-user-password', destination: '/run/secrets/synthetic-sandbox-user-password', readOnly: true },
  ],
};

test('Green target accepts only the exact verified resource identities', () => {
  assert.deepEqual(assertGreenTargetManifest(targetManifest), targetManifest);
  for (const mutation of [
    { ...targetManifest, composeProject: 'sit-staging' },
    { ...targetManifest, network: 'sit-green-network-lookalike' },
    { ...targetManifest, databaseContainer: 'shareittoo-staging-postgres' },
    { ...targetManifest, sourceSchema: 92 },
    { ...targetManifest, greenLabel: 'com.shareittoo.sit.green=false' },
  ]) {
    assert.throws(() => assertGreenTargetManifest(mutation));
  }
});

test('Green runtime config fails closed for external/mock/legacy or secret-bearing variants', () => {
  assert.equal(assertGreenRuntimeConfig(config).listingAiProvider, 'on_device');
  assert.throws(() => assertGreenRuntimeConfig({ ...config, listingAiProvider: 'mock' }), /green_config_safety_boundary_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, listingAiExternalAllowed: true }), /green_config_safety_boundary_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, envNames: [...config.envNames, 'STRIPE_SECRET_KEY'] }), /green_config_env_allowlist_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, environment: 'production' }), /green_config_env_allowlist_invalid/u);
});

test('runtime image must be immutable GHCR commit plus digest', () => {
  assert.equal(assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }).runtimeCommit, runtimeCommit);
  assert.throws(() => assertGreenRuntimeImage({ image: 'shareittoo-api:latest', digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }), /runtime_image_tag_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: 'sha256:short', runtimeCommit }), /runtime_image_digest_required/u);
});

test('inventory rejects wrong schema, host ports and non-Green labels', () => {
  const inventory = {
    api: { name: greenTarget.apiContainer, greenLabel: true, hostPorts: 0, running: true },
    database: { name: greenTarget.databaseContainer, greenLabel: true, running: true },
    network: { name: greenTarget.network, internal: true }, providerNetwork: { name: greenTarget.providerNetwork },
    uploadsVolume: { name: greenTarget.uploadsVolume }, schema: 87,
  };
  assert.equal(assertGreenContainerInventory(inventory), true);
  assert.throws(() => assertGreenContainerInventory({ ...inventory, schema: 92 }));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, api: { ...inventory.api, hostPorts: 1 } }));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, network: { name: 'sit-staging', internal: true } }));
});

test('promotion plan keeps backup, isolated 87-to-92 rehearsal, acceptance and final no-port promotion ordered', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  assert.deepEqual(plan.commandPolicy.finalNetworks, [greenTarget.network, greenTarget.providerNetwork]);
  assert.equal(plan.commandPolicy.finalHostPorts, 0);
  assert.ok(plan.phases.findIndex((phase) => phase.includes('fresh protected database backup')) < plan.phases.findIndex((phase) => phase.includes('stop and seal')));
  assert.match(plan.phases.join('\n'), /87 to 92/u);
  assert.match(plan.phases.join('\n'), /synthetic sandbox user/u);
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  const final = commands.find((entry) => entry.phase === 'final_create_no_host_port');
  assert.ok(candidate.args.includes('--publish') && candidate.args.includes('127.0.0.1:18082:8080'));
  assert.ok(!final.args.includes('--publish') && !final.args.includes('-p'));
  assert.ok(final.args.includes(`type=volume,src=${greenTarget.uploadsVolume},dst=/data/uploads,readonly=false`));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision'));
  assert.equal(commands.some((entry) => entry.args?.some((arg) => /shareittoo-staging-postgres|shareittoo_staging_backend|shareittoo_staging_postgres_data|prod|production/iu.test(arg))), false);
});

test('sanitized evidence and cleanup never turn Green promotion into legacy/prod mutation', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const evidence = sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { schema: 92 }, imageReadback: { live: 200, ready: 200 } });
  assert.equal(evidence.redaction, 'sensitive values omitted');
  assert.doesNotMatch(JSON.stringify(evidence), /DATABASE_URL|JWT_SECRET|password|token|whsec_|sk_live_|sk_test_/iu);
  assert.equal(assertGreenCleanup({ removed: ['sit-green-rehearsal-network-x'], verifiedAbsent: ['sit-green-rehearsal-network-x'], oldApiSealed: true, oldApiRunning: false }), true);
  assert.throws(() => assertGreenCleanup({ removed: ['shareittoo-staging-api'], verifiedAbsent: ['shareittoo-staging-api'], oldApiSealed: true, oldApiRunning: false }));
});

test('evidence writer is external, exclusive and mode 0600', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-promotion-evidence-'));
  const file = path.join(root, 'evidence.json');
  try {
    const result = await writeGreenEvidence(file, { kind: 'sit-green-promotion', redaction: 'sensitive values omitted' });
    assert.equal(result.path, file);
    assert.equal(lstatSync(file).mode & 0o777, 0o600);
    await assert.rejects(() => writeGreenEvidence(file, { kind: 'sit-green-promotion' }), /green_evidence_path_exists/u);
    await assert.rejects(() => writeGreenEvidence(path.join(root, 'secret.json'), { password: 'not allowed' }), /green_evidence_secret_leak/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
