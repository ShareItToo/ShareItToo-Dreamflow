import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertGreenCleanup,
  assertGreenContainerInventory,
  assertGreenProtectedEnvironment,
  assertGreenRuntimeEnvironmentReadback,
  assertGreenRuntimeConfig,
  assertGreenRuntimeImage,
  assertGreenImageReadback,
  assertGreenRuntimeReadbacks,
  assertGreenFinalContainerReadback,
  assertGreenSuccessorPreStartReadback,
  summarizeGreenFinalContainerReadback,
  assertGreenTargetManifest,
  buildGreenPromotionCommands,
  buildGreenPromotionPlan,
  greenTarget,
  greenBroadPromotionEnvironment,
  greenTechnicalSandboxEnvironment,
  greenTechnicalSandboxHealth,
  assertGreenTechnicalSandboxProviderOff,
  sanitizeGreenEvidence,
  normalizedGreenTargetDigest,
  assertGreenCommandBindings,
  writeGreenEvidence,
  runGreenEmergencyCleanup,
  runGreenForwardRecovery,
  runGreenCommandWithBufferInput,
  runGreenPromotion,
  syntheticSandboxCredentialFilePath,
  containsForbiddenGreenTargetIdentifier,
} from '../ops/green_staging_promotion.mjs';
import { readStagingAccessConfiguration, stagingAnonymousPathAllowed } from '../src/staging_access_gate.js';
import { readListingAiGatewayConfiguration } from '../src/listing_ai_gateway_config.js';
import { isMfaProbeContainer, runMfaProbe } from '../ops/staging_controlled_acceptance.mjs';

const runtimeCommit = '266f69c21dd61bfcdb212c24a0c8788b172bed9e';
const opsCommit = '8fecd57018ab10a0c6733531539472e6179a02db';
const targetManifest = {
  kind: 'sit-green-staging-target', schemaVersion: 1, composeProject: 'sit-green',
  greenLabel: 'com.shareittoo.sit.green=true', runId: greenTarget.runId,
  apiContainer: greenTarget.apiContainer, databaseContainer: greenTarget.databaseContainer,
  databaseVolume: greenTarget.databaseVolume, network: greenTarget.network,
  providerNetwork: greenTarget.providerNetwork, uploadsVolume: greenTarget.uploadsVolume,
  networkInternal: true, sourceSchema: 92, currentSchema: 95, prePromotionImage: greenTarget.prePromotionImage,
};
targetManifest.targetDigest = normalizedGreenTargetDigest(targetManifest);
const config = {
  environment: 'test', envFile: '/docker/shareittoo/staging-secrets/green.env',
  envNames: ['NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'JWT_SECRET', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'MAIL_TRANSPORT', 'PUSH_TRANSPORT', 'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER', 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', 'SIT_STAGING_ACCESS_GATE_ENABLED', 'SIT_STAGING_ALLOWED_USER_IDS', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_VERIFICATION_ENABLED', 'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_BUDGET_CENTS', 'ENABLE_STAGING_STRIPE', 'TECHNICAL_SANDBOX_ENABLED', 'TECHNICAL_SANDBOX_KILL_SWITCH', 'TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_USER_IDS', 'TECHNICAL_SANDBOX_AUTHORIZATION_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT', 'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE', 'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE', 'SIT_STAGING_PILOT_ID', 'SYNTHETIC_SANDBOX_PASSWORD_FILE'],
  mfaFile: '/docker/shareittoo/staging-secrets/mfa-encryption-key',
  firebaseFile: '/docker/shareittoo/staging-secrets/firebase.json',
  technicalSandboxKeyFile: '/docker/shareittoo/staging-secrets/technical-sandbox-key',
  technicalSandboxWebhookFile: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook',
  syntheticUserId: 'synthetic_sandbox_user_pilot_20260919', paymentTransport: 'memory',
  stripeLiveMode: false, mailTransport: 'memory', pushTransport: 'memory', identityTransport: 'memory', listingAiProvider: 'on_device',
  listingAiExternalAllowed: false, listingAiBudgetCents: 0, accessGateDigest: 'b'.repeat(64), providerConfigDigest: 'c'.repeat(64),
  mounts: [
    { source: '/docker/shareittoo/staging-secrets/mfa-encryption-key', destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/firebase.json', destination: '/run/secrets/firebase-service-account.json', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-key', destination: '/run/secrets/technical-sandbox-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook', destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/uploads', destination: '/data/uploads', readOnly: false },
  ],
};

function migrationLedgerThrough(schema) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'migrations');
  const rows = readdirSync(root).filter((name) => /^\d+_.+\.up\.sql$/u.test(name) && Number(name.slice(0, 3)) <= schema).sort()
    .map((name) => `${name}|${crypto.createHash('sha256').update(readFileSync(path.join(root, name))).digest('hex')}`);
  return `${rows.join('\n')}\n`;
}

const sourceMigrationLedger = migrationLedgerThrough(92);
const currentMigrationLedger = migrationLedgerThrough(95);
const emptyFindingFingerprint = JSON.stringify({ paymentRecoveryNeedsReview: [], supportNextUpdateOverdue: [] });
const targetContainerSet = `${greenTarget.apiContainer}\t\t\ttrue\t${greenTarget.runId}\n${greenTarget.databaseContainer}\t\t\ttrue\t\n`;
const sourceMounts = [
  { destination: '/data/uploads', type: 'volume', source: null, volume: greenTarget.uploadsVolume, readOnly: false },
  { destination: '/run/secrets/firebase-service-account.json', type: 'bind', source: config.firebaseFile, volume: null, readOnly: true },
  { destination: '/run/secrets/mfa-encryption-key', type: 'bind', source: config.mfaFile, volume: null, readOnly: true },
  { destination: '/run/secrets/technical-sandbox-key', type: 'bind', source: config.technicalSandboxKeyFile, volume: null, readOnly: true },
  { destination: '/run/secrets/technical-sandbox-webhook', type: 'bind', source: config.technicalSandboxWebhookFile, volume: null, readOnly: true },
];
const finalMounts = sourceMounts.filter((mount) => mount.destination === '/data/uploads'
  || mount.destination === '/run/secrets/firebase-service-account.json'
  || mount.destination === '/run/secrets/mfa-encryption-key').map((mount) => ({
  Destination: mount.destination,
  Type: mount.type,
  ...(mount.type === 'bind' ? { Source: mount.source } : { Name: mount.volume }),
  RW: !mount.readOnly,
}));
const greenRuntimeEnvEntries = Object.entries({ ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment }).map(([name, value]) => `${name}=${value}`);
const originalApiIdentityRecord = {
  Id: 'api-original-id',
  Config: { Image: greenTarget.prePromotionImage, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['DATABASE_URL=postgres://shareittoo_green@green-db/shareittoo_green'] },
  NetworkSettings: { Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
};
const stableIdentityValue = (value) => Array.isArray(value)
  ? value.map((entry) => stableIdentityValue(entry))
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableIdentityValue(value[key])]))
    : value;
const originalApiIdentity = {
  id: originalApiIdentityRecord.Id,
  config: JSON.stringify(stableIdentityValue(originalApiIdentityRecord.Config)),
  networks: JSON.stringify(stableIdentityValue(originalApiIdentityRecord.NetworkSettings.Networks)),
};
const restoredApiIdentityRecord = { ...originalApiIdentityRecord, Name: `/${greenTarget.apiContainer}`, State: { Running: true } };

test('MFA probe container contract accepts only dedicated names or an exact Docker ID', () => {
  assert.equal(isMfaProbeContainer('shareittoo-staging-acceptance-api'), true);
  assert.equal(isMfaProbeContainer('sit-green-acceptance-0123456789ab'), true);
  assert.equal(isMfaProbeContainer('a'.repeat(64)), true);
  for (const invalid of [
    'a'.repeat(12),
    'a'.repeat(63),
    'a'.repeat(65),
    'g'.repeat(64),
    'A'.repeat(64),
    'sit-grn-c-runtime-0123456789abcdef',
    'sit-green-acceptance-0123456789a',
  ]) assert.equal(isMfaProbeContainer(invalid), false, invalid);
});

function restoreFixture(options, running = true) {
  if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify({ ...originalApiIdentityRecord, Name: `/${greenTarget.sealedApiContainer}` }) };
  if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
  if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
  if (options.phase === 'failure_restore_current_api_identity_after_rename' || options.phase === 'failure_restore_green_api_identity_verify') return { stdout: JSON.stringify({ ...restoredApiIdentityRecord, State: { Running: running } }) };
  return null;
}

test('Green target accepts only the exact verified resource identities', () => {
  assert.deepEqual(assertGreenTargetManifest(targetManifest), targetManifest);
  for (const mutation of [
    { ...targetManifest, composeProject: 'sit-staging' },
    { ...targetManifest, network: 'sit-green-network-lookalike' },
    { ...targetManifest, databaseContainer: 'shareittoo-staging-postgres' },
    { ...targetManifest, sourceSchema: 91 },
    { ...targetManifest, currentSchema: 94 },
    { ...targetManifest, greenLabel: 'com.shareittoo.sit.green=false' },
  ]) {
    assert.throws(() => assertGreenTargetManifest(mutation));
  }
});

test('forbidden production identifiers use token boundaries, not arbitrary path substrings', () => {
  for (const value of [
    '/tmp/sit-r10-clean-reproducibility-abc123',
    'shareittoo-staging-api',
    'productional-analysis',
  ]) assert.equal(containsForbiddenGreenTargetIdentifier(value), false, value);
  for (const value of ['/prod/', 'shareittoo-prod-api', 'shareittoo_production_db', 'registry:prod']) {
    assert.equal(containsForbiddenGreenTargetIdentifier(value), true, value);
  }
});

test('Green runtime config fails closed for external/mock/legacy or secret-bearing variants', () => {
  assert.equal(assertGreenRuntimeConfig(config).listingAiProvider, 'on_device');
  assert.throws(() => assertGreenRuntimeConfig({ ...config, listingAiProvider: 'mock' }), /green_config_safety_boundary_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, listingAiExternalAllowed: true }), /green_config_safety_boundary_invalid/u);
  for (const [name, value] of [
    ['mailTransport', 'smtp'], ['pushTransport', 'fcm'], ['paymentTransport', 'stripe'], ['identityTransport', 'stripe'],
    ['listingAiProvider', 'openai'], ['listingAiExternalAllowed', true], ['listingAiBudgetCents', 1],
  ]) assert.throws(() => buildGreenPromotionPlan({
    targetManifest, config: { ...config, [name]: value }, runtimeCommit,
    runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit,
    evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  }), /green_config_safety_boundary_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, envNames: [...config.envNames, 'STRIPE_SECRET_KEY'] }), /green_config_env_allowlist_invalid/u);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, environment: 'production' }), /green_config_env_allowlist_invalid/u);
});

test('Green provider-off contract matches the real Listing-AI server parser', () => {
  const listing = readListingAiGatewayConfiguration(greenBroadPromotionEnvironment, { deploymentEnvironment: 'test' });
  assert.equal(listing.provider, 'on_device');
  assert.equal(listing.budgetCents, 0);
  assert.equal(listing.externalProviderExecutionAllowed, false);
  assert.throws(() => readListingAiGatewayConfiguration({
    ...greenBroadPromotionEnvironment,
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: 'false',
  }, { deploymentEnvironment: 'test' }));
});

test('protected Green runtime environment binds memory payment, pilot, paths and no provider secrets', () => {
  const values = {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    ENABLE_STAGING_STRIPE: '0', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory', SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', SIT_LISTING_AI_BUDGET_CENTS: '0',
    ...greenTechnicalSandboxEnvironment,
    SIT_STAGING_PILOT_ID: 'heilbronn_wave0', SIT_STAGING_COMPOSE_PROJECT: 'sit-green', SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919',
    SYNTHETIC_SANDBOX_PASSWORD_FILE: syntheticSandboxCredentialFilePath,
  };
  assert.equal(assertGreenProtectedEnvironment(values, config), true);
  assert.equal(assertGreenTechnicalSandboxProviderOff(values), true);
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, FIREBASE_AUTH_ENABLED: 'true' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, FIREBASE_PHONE_VERIFICATION_ENABLED: 'true' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, DEPLOYMENT_ENVIRONMENT: 'staging' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'true' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: 'digest=owner' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, PAYMENT_TRANSPORT: 'stripe' }, config));
  for (const [name, value] of [
    ['MAIL_TRANSPORT', 'smtp'], ['PUSH_TRANSPORT', 'fcm'], ['IDENTITY_VERIFICATION_TRANSPORT', 'stripe'],
    ['SIT_LISTING_AI_PROVIDER', 'openai'], ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'], ['SIT_LISTING_AI_BUDGET_CENTS', '1'],
  ]) assert.throws(() => assertGreenProtectedEnvironment({ ...values, [name]: value }, config), /green_broad_promotion_provider_off_invalid/u);
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, OPENAI_API_KEY: 'present' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, SYNTHETIC_SANDBOX_PASSWORD_FILE: '/run/secrets/synthetic-sandbox-user-password' }, config));
});

test('Green promotion has an explicit provider-off technical Sandbox plan and readback', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  assert.deepEqual(plan.technicalSandbox, {
    ...greenTechnicalSandboxHealth,
    authorizationRenewal: false,
    providerTraffic: false,
  });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(commands.some((entry) => entry.args.some((arg) => /technical-sandbox-(?:key|webhook)/u.test(arg))), false);
  assert.equal(assertGreenRuntimeEnvironmentReadback({
    DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', googleRegistrationAllowlistEmpty: true,
    ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment,
  }), true);
  assert.throws(() => assertGreenTechnicalSandboxProviderOff({
    ...greenTechnicalSandboxEnvironment, TECHNICAL_SANDBOX_AUTHORIZATION_ID: 'stale-auth',
  }), /green_technical_sandbox_provider_off_invalid/u);
  assert.throws(() => assertGreenRuntimeEnvironmentReadback({
    DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', googleRegistrationAllowlistEmpty: true,
    ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, TECHNICAL_SANDBOX_ENABLED: '1',
  }), /green_technical_sandbox_provider_off_invalid/u);
  for (const [name, value] of [
    ['MAIL_TRANSPORT', 'smtp'], ['PUSH_TRANSPORT', 'fcm'], ['IDENTITY_VERIFICATION_TRANSPORT', 'stripe'],
    ['SIT_LISTING_AI_PROVIDER', 'openai'], ['SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', '1'], ['SIT_LISTING_AI_BUDGET_CENTS', '1'],
  ]) assert.throws(() => assertGreenRuntimeEnvironmentReadback({
    DEPLOYMENT_ENVIRONMENT: 'test', SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    googleRegistrationAllowlistEmpty: true, ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, [name]: value,
  }), /green_broad_promotion_provider_off_invalid/u);
});

test('promotion executor contract rejects external provider selections before candidate or final commands exist', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  for (const [name, value] of [
    ['mailTransport', 'smtp'], ['pushTransport', 'fcm'], ['paymentTransport', 'stripe'], ['identityTransport', 'stripe'],
    ['listingAiProvider', 'openai'], ['listingAiExternalAllowed', true], ['listingAiBudgetCents', 1],
  ]) {
    assert.throws(() => buildGreenPromotionCommands({
      plan, configFile: config.envFile, config: { ...config, [name]: value },
    }), /green_config_safety_boundary_invalid/u);
  }
});

test('runtime image must be immutable GHCR commit plus digest', () => {
  assert.equal(assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }).runtimeCommit, runtimeCommit);
  assert.throws(() => assertGreenRuntimeImage({ image: 'shareittoo-api:latest', digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }), /runtime_image_tag_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: 'sha256:short', runtimeCommit }), /runtime_image_digest_required/u);
});

test('runtime readback binds version and capability safety surface', () => {
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  assert.equal(assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: payload, ready: payload, runtimeCommit }), true);
  const extendedPayload = { checks: { ...payload.checks, technicalSandbox: { ...greenTechnicalSandboxHealth, observedAt: 'synthetic-fixture' } } };
  assert.equal(assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: extendedPayload, ready: extendedPayload, runtimeCommit }), true);
  assert.throws(() => assertGreenRuntimeReadbacks({ version: { commit: '0'.repeat(40), environment: 'test' }, health: payload, ready: payload, runtimeCommit }));
  assert.throws(() => assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: { ...payload, checks: { ...payload.checks, technicalSandbox: { ...payload.checks.technicalSandbox, amountMinor: 200 } } }, ready: payload, runtimeCommit }));
});

test('production-shaped image inspect readback may omit Config.Image but must bind digest and revision', () => {
  const runtime = { image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: `sha256:${'d'.repeat(64)}`, runtimeCommit };
  const readback = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`${runtime.image}@${runtime.digest}`] };
  assert.equal(assertGreenImageReadback(readback, runtime), true);
  assert.throws(() => assertGreenImageReadback({ ...readback, RepoDigests: [`${runtime.image}@sha256:${'e'.repeat(64)}`] }, runtime), /green_image_readback_mismatch/u);
});

test('inventory rejects wrong schema, host ports and non-Green labels', () => {
  const inventory = {
    api: { name: greenTarget.apiContainer, greenLabel: false, prePromotionTuple: true, hostPorts: 0, running: true, networks: [greenTarget.network, greenTarget.providerNetwork], image: targetManifest.prePromotionImage, user: 'shareittoo', databaseHost: greenTarget.databaseContainer, databaseName: greenTarget.databaseName, databaseUser: greenTarget.databaseUser, uploadsVolume: greenTarget.uploadsVolume, groupAdd: true, mounts: sourceMounts },
    database: { name: greenTarget.databaseContainer, greenLabel: true, running: true },
    network: { name: greenTarget.network, internal: true }, providerNetwork: { name: greenTarget.providerNetwork },
    uploadsVolume: { name: greenTarget.uploadsVolume }, schema: 92,
  };
  assert.equal(assertGreenContainerInventory(inventory, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), true);
  assert.throws(() => assertGreenContainerInventory({ ...inventory, schema: 95 }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, api: { ...inventory.api, hostPorts: 1 } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config));
  assert.throws(() => assertGreenContainerInventory({ ...inventory, network: { name: 'sit-staging', internal: true } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config));
});

test('promotion plan keeps backup, isolated 92-to-95 rehearsal, acceptance and final no-port promotion ordered', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  assert.deepEqual(plan.commandPolicy.finalNetworks, [greenTarget.network, greenTarget.providerNetwork]);
  assert.equal(plan.commandPolicy.finalHostPorts, 0);
  assert.ok(plan.phases.findIndex((phase) => phase.includes('stop and seal')) < plan.phases.findIndex((phase) => phase.includes('fresh protected database backup')));
  assert.match(plan.phases.join('\n'), /92 to 95/u);
  assert.match(plan.phases.join('\n'), /095_staging_google_registration_replays\.up\.sql/u);
  assert.match(plan.phases.join('\n'), /synthetic sandbox user/u);
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  const final = commands.find((entry) => entry.phase === 'final_create_no_host_port');
  assert.ok(candidate.args.includes('--publish') && candidate.args.includes('127.0.0.1:18082:8080'));
  assert.ok(candidate.args.includes('SIT_GREEN_REHEARSAL=1'));
  assert.ok(candidate.args.includes('SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password'));
  assert.ok(candidate.args.includes(`type=bind,src=${syntheticSandboxCredentialFilePath},dst=/run/secrets/synthetic-sandbox-user-password,readonly`));
  assert.ok(!final.args.includes('--publish') && !final.args.includes('-p'));
  assert.equal(final.args.some((arg) => arg.includes('synthetic-sandbox-user-password')), false);
  assert.equal(final.args.includes(syntheticSandboxCredentialFilePath), false);
  assert.ok(final.args.includes(`type=volume,src=${greenTarget.uploadsVolume},dst=/data/uploads,readonly=false`));
  assert.ok(final.args.includes('--group-add') && final.args.includes('65532'));
  assert.ok(final.args.some((arg) => arg.includes('com.shareittoo.sit.green=true')));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_migrate_92_to_95'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_migration_readback') < commands.findIndex((entry) => entry.phase === 'isolated_migration_ledger_readback'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_migration_ledger_readback') < commands.findIndex((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_postgres_init_complete_log_readback') < commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_1'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_1') < commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_2'));
  assert.ok(commands.findIndex((entry) => entry.phase === 'isolated_postgres_stable_select_2') < commands.findIndex((entry) => entry.phase === 'isolated_restore'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_restore' && entry.inputFile));
  assert.ok(commands.find((entry) => entry.phase === 'candidate_mfa_identity_probes'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_network_cleanup_verify'));
  assert.ok(commands.find((entry) => entry.phase === 'canonical_forward_migration_92_to_95'));
  assert.ok(commands.find((entry) => entry.phase === 'canonical_schema_readback'));
  assert.ok(commands.find((entry) => entry.phase === 'sealed_name_conflict_check'));
  assert.ok(commands.find((entry) => entry.phase === 'final_inventory_readback'));
  assert.ok(commands.find((entry) => entry.phase === 'final_image_readback'));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision_canonical'));
  assert.equal(commands.some((entry) => entry.command === 'docker' && entry.args?.[0] === 'volume'), false);
  assert.equal(commands.some((entry) => /isolated_.*volume/u.test(entry.phase)), false);
  const phaseIndex = (phase) => commands.findIndex((entry) => entry.phase === phase);
  assert.ok(phaseIndex('target_container_set_readback') < phaseIndex('quiesce_green_api'));
  assert.ok(phaseIndex('quiesce_green_api') < phaseIndex('quiesce_green_api_verify'));
  assert.ok(phaseIndex('quiesce_green_api_verify') < phaseIndex('source_foreign_writer_readback_before_backup'));
  assert.ok(phaseIndex('source_foreign_writer_readback_before_backup') < phaseIndex('fresh_protected_backup'));
  assert.ok(phaseIndex('fresh_protected_backup') < phaseIndex('source_foreign_writer_readback_after_backup'));
  assert.ok(phaseIndex('isolated_finding_fingerprint_readback') < phaseIndex('candidate_start'));
  assert.ok(phaseIndex('candidate_finding_fingerprint_readback') < phaseIndex('candidate_health_and_feature_probes'));
  assert.ok(phaseIndex('quiesce_green_api') < phaseIndex('candidate_acceptance_create'));
  assert.ok(phaseIndex('candidate_cleanup_verify') < phaseIndex('canonical_forward_migration_92_to_95'));
  assert.ok(phaseIndex('canonical_schema_readback') < phaseIndex('final_create_no_host_port'));
  assert.equal(commands.some((entry) => entry.args?.some((arg) => (
    /shareittoo-staging-postgres|shareittoo_staging_backend|shareittoo_staging_postgres_data/iu.test(arg)
      || containsForbiddenGreenTargetIdentifier(arg)
  ))), false);
});

test('isolated resource names and labels carry a fresh per-execution ownership nonce', () => {
  const first = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'a'.repeat(32) });
  const second = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'b'.repeat(32) });
  assert.match(first.isolated.candidate, new RegExp(first.isolated.ownershipNonce, 'u'));
  assert.match(first.isolated.rehearsalId, new RegExp(first.isolated.ownershipNonce, 'u'));
  assert.notEqual(first.isolated.ownershipNonce, second.isolated.ownershipNonce);
  assert.throws(() => buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'not-a-nonce' }), /green_ownership_nonce_invalid/u);
  const commands = buildGreenPromotionCommands({ plan: first, configFile: config.envFile, config });
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  assert.equal(candidate.args[candidate.args.indexOf('--name') + 1], first.isolated.candidate);
  assert.ok(candidate.args.includes(`com.shareittoo.green.rehearsal_id=${first.isolated.rehearsalId}`));
});

test('every promotion command has an executable command and argv, including target inventory', () => {
  const plan = buildGreenPromotionPlan({
    targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`,
    opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json',
  });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const targetInventory = commands.filter(({ phase }) => phase.startsWith('target_inventory_'));
  assert.deepEqual(targetInventory.map(({ command, args }) => ({ command, args })), [
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.apiContainer] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.databaseContainer] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.network] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.providerNetwork] },
    { command: 'docker', args: ['inspect', '--format', '{{json .}}', greenTarget.uploadsVolume] },
  ]);
  assert.ok(targetInventory.length > 0);
  for (const entry of commands) {
    assert.equal(typeof entry.command, 'string', `${entry.phase} command must be a string`);
    assert.ok(entry.command.length > 0, `${entry.phase} command must not be empty`);
    assert.ok(Array.isArray(entry.args), `${entry.phase} args must be an array`);
  }
});

test('promotion plan resolves the exact sealed API before emitting mutation commands', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  assert.equal(plan.target.sealedApiContainer, greenTarget.sealedApiContainer);
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  for (const entry of commands) {
    assert.equal(entry.args.some((arg) => arg === undefined), false, `${entry.phase} must not contain undefined argv`);
  }
  const immutableImage = `${plan.runtime.image}@${plan.runtime.digest}`;
  for (const phase of ['isolated_migrate_92_to_95', 'synthetic_sandbox_provision_isolated', 'candidate_acceptance_create', 'canonical_forward_migration_92_to_95', 'synthetic_sandbox_provision_canonical', 'final_create_no_host_port']) {
    const entry = commands.find((candidate) => candidate.phase === phase);
    assert.ok(entry.args.includes(immutableImage), `${phase} must execute the verified digest-pinned image`);
    assert.equal(entry.args.includes(plan.runtime.image), false, `${phase} must not execute the mutable tag`);
  }
  const missing = Object.freeze({ ...plan, target: Object.freeze({ ...plan.target, sealedApiContainer: undefined }) });
  assert.throws(() => buildGreenPromotionCommands({ plan: missing, configFile: config.envFile, config }), /green_sealed_target_invalid/u);
});

test('isolated Postgres init-marker readback retries past an early readiness-only log', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const marker = buildGreenPromotionCommands({ plan, configFile: config.envFile, config }).find((entry) => entry.phase === 'isolated_postgres_init_complete_log_readback');
  assert.equal(marker.command, 'bash');
  assert.match(marker.args[1], /seq 1 60/u);
  assert.match(marker.args[1], /PostgreSQL init process complete; ready for start up\./u);
  const root = mkdtempSync(path.join(os.tmpdir(), 'green-init-marker-'));
  const fakeDocker = path.join(root, 'docker');
  const countFile = path.join(root, 'count');
  writeFileSync(fakeDocker, '#!/bin/sh\ncount=0\n[ -f "$MARKER_COUNT" ] && count=$(cat "$MARKER_COUNT")\ncount=$((count + 1))\nprintf "%s" "$count" > "$MARKER_COUNT"\nif [ "$count" -lt 2 ]; then echo "database system is ready to accept connections"; else echo "PostgreSQL init process complete; ready for start up."; fi\n', { mode: 0o700 });
  chmodSync(fakeDocker, 0o700);
  const output = execFileSync(marker.command, marker.args, { encoding: 'utf8', env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ''}`, MARKER_COUNT: countFile } });
  assert.match(output, /PostgreSQL init process complete; ready for start up\./u);
  assert.equal(readFileSync(countFile, 'utf8'), '2');
  rmSync(root, { recursive: true, force: true });
});

test('buffer restore input preserves exact bytes and fails closed on early stdin close', async () => {
  const exactBytes = Buffer.from([0, 1, 255]);
  const successfulRestore = await runGreenCommandWithBufferInput(
    process.execPath,
    ['-e', "const chunks=[]; process.stdin.on('data', (chunk) => chunks.push(chunk)); process.stdin.on('end', () => process.exit(Buffer.concat(chunks).equals(Buffer.from([0,1,255])) ? 0 : 9));"],
    exactBytes,
    { phase: 'green_buffer_exact_bytes' },
  );
  assert.equal(successfulRestore.code, 0);
  await assert.rejects(
    () => runGreenCommandWithBufferInput(process.execPath, ['-e', "process.stdin.once('data', () => { process.stdin.destroy(); setTimeout(() => process.exit(0), 10); });"], Buffer.alloc(16 * 1024 * 1024), { phase: 'green_buffer_early_close' }),
    (error) => error.code === 'green_buffer_early_close_stdin_closed_early',
  );
});

test('executor runs provisioners in the declared runtime image before quiesce', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-runner-'));
  const configFile = path.join(root, 'green.env');
  const evidenceFile = path.join(root, 'green-promotion.json');
  const runtimeConfig = { ...config, envFile: configFile };
  const envValues = {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test',
    DATABASE_URL: `postgres://shareittoo_green:fixture@${greenTarget.databaseContainer}:5432/shareittoo_green`,
    JWT_SECRET: 'synthetic-fixture-jwt', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory', SIT_LISTING_AI_PROVIDER: 'on_device',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
    SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919', SMTP_HOST: 'localhost',
    SMTP_PORT: '2525', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic', MAIL_FROM: 'synthetic@example.invalid',
    FIREBASE_PROJECT_ID: 'synthetic', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
    SIT_STAGING_COMPOSE_PROJECT: 'sit-green', SIT_LISTING_AI_BUDGET_CENTS: '0', ENABLE_STAGING_STRIPE: '0',
    ...greenTechnicalSandboxEnvironment, SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
    SYNTHETIC_SANDBOX_PASSWORD_FILE: syntheticSandboxCredentialFilePath,
  };
  writeFileSync(configFile, `${Object.entries(envValues).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
  chmodSync(configFile, 0o600);
  const plan = buildGreenPromotionPlan({
    targetManifest, config: runtimeConfig, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`,
    opsCommit, evidenceFile,
  });
  const imageReadback = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`${plan.runtime.image}@${plan.runtime.digest}`] };
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const prePromotionRecord = (image) => ({
    Id: originalApiIdentityRecord.Id, Name: `/${greenTarget.apiContainer}`, State: { Running: true },
    NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { Image: image, User: 'shareittoo', Labels: {}, Env: [`DATABASE_URL=${envValues.DATABASE_URL}`] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: sourceMounts.map((mount) => ({ Destination: mount.destination, Type: mount.type, Source: mount.source, Name: mount.volume, RW: !mount.readOnly })),
  });
  const databaseRecord = { Name: `/${greenTarget.databaseContainer}`, State: { Running: true }, Config: { Labels: { 'com.shareittoo.sit.green': 'true' } } };
  const isolatedNetworkId = '1'.repeat(64);
  const isolatedDatabaseId = '2'.repeat(64);
  const candidateId = '3'.repeat(64);
  const fakeRun = async (image, isolatedLedger = currentMigrationLedger, initLog = 'PostgreSQL init process complete; ready for start up.\n', stableSelect2 = '1\n', targetSet = targetContainerSet, foreignBefore = '[]\n', foreignAfter = foreignBefore, candidateFinding = emptyFindingFingerprint, stopAtPhase = 'quiesce_green_api', restoreCode) => {
    const calls = [];
    const candidateRecord = {
      Id: candidateId, Name: `/${plan.isolated.candidate}`, State: { Running: false },
      NetworkSettings: { Ports: {}, Networks: { [plan.isolated.network]: {}, [greenTarget.providerNetwork]: {} } },
      Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId, 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
      HostConfig: { GroupAdd: ['65532'], PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } }, Mounts: [...finalMounts.map((mount) => mount.Destination === '/data/uploads' ? { ...mount, Name: 'anonymous-uploads-id' } : mount), { Type: 'bind', Source: syntheticSandboxCredentialFilePath, Destination: '/run/secrets/synthetic-sandbox-user-password', RW: false }],
    };
    const fake = async (command, args, options = {}) => {
      calls.push({ command, args, phase: options.phase, env: options.env });
      const phase = options.phase;
      if (phase === 'target_container_set_readback') return { stdout: targetSet };
      if (phase === 'target_inventory_api') return { stdout: JSON.stringify([prePromotionRecord(image)]) };
      if (phase === 'target_inventory_database') return { stdout: JSON.stringify([databaseRecord]) };
      if (phase === 'target_inventory_network') return { stdout: JSON.stringify([{ Name: greenTarget.network, Internal: true }]) };
      if (phase === 'target_inventory_provider_network') return { stdout: JSON.stringify([{ Name: greenTarget.providerNetwork }]) };
      if (phase === 'target_inventory_uploads') return { stdout: JSON.stringify([{ Name: greenTarget.uploadsVolume }]) };
      if (phase === 'runtime_image_readback') return { stdout: JSON.stringify(imageReadback) };
      if (phase === 'isolated_network_create') return { stdout: `${isolatedNetworkId}\n` };
      if (phase === 'isolated_postgres_create') return { stdout: `${isolatedDatabaseId}\n` };
      if (phase === 'candidate_acceptance_create') return { stdout: `${candidateId}\n` };
      if (phase === 'candidate_mfa_identity_probes') {
        assert.equal(options.env.STAGING_ACCEPTANCE_CONTAINER, candidateId);
        const probe = await runMfaProbe({
          container: options.env.STAGING_ACCEPTANCE_CONTAINER,
          commandRunner: async (probeCommand, probeArgs, probeInput, probeOptions) => {
            assert.equal(probeCommand, 'docker');
            assert.deepEqual(probeArgs, ['exec', '-i', candidateId, 'node', '--input-type=module']);
            assert.equal(probeOptions.phase, 'mfa_probe');
            assert.match(probeInput, /\/auth\/mfa\/enroll/u);
            assert.match(probeInput, /\/identity-verification\/session/u);
            return JSON.stringify({ mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' });
          },
        });
        assert.deepEqual(probe, { mfa: 'enroll-pending-cancel-passed', identity: 'start-status-resume-revoke-passed' });
        return { stdout: JSON.stringify(probe) };
      }
      if (phase === 'candidate_prestart_identity_readback') return { stdout: JSON.stringify(candidateRecord) };
      if (phase === 'source_schema_readback') return { stdout: '092_listing_ai_mock_disclosure.up.sql\n' };
      if (phase === 'source_migration_ledger_readback') return { stdout: sourceMigrationLedger };
      if (phase === 'source_foreign_writer_readback_before_backup') return { stdout: foreignBefore };
      if (phase === 'source_foreign_writer_readback_after_backup') return { stdout: foreignAfter };
      if (phase === 'quiesce_green_api_verify') return { stdout: 'false\n' };
      if (phase === 'isolated_postgres_init_complete_log_readback') return { stdout: initLog };
      if (phase === 'isolated_postgres_stable_select_1') return { stdout: '1\n' };
      if (phase === 'isolated_postgres_stable_select_2') return { stdout: stableSelect2 };
      if (phase === 'isolated_migration_readback') return { stdout: '095_staging_google_registration_replays.up.sql\n' };
      if (phase === 'isolated_migration_ledger_readback') return { stdout: isolatedLedger };
      if (phase === 'isolated_finding_fingerprint_readback') return { stdout: emptyFindingFingerprint };
      if (phase === 'candidate_finding_fingerprint_readback') return { stdout: candidateFinding };
      if (phase === 'candidate_cleanup') assert.deepEqual(args, ['rm', '--force', '--volumes', candidateId]);
      if (phase === 'isolated_database_cleanup') assert.deepEqual(args, ['rm', '--force', '--volumes', isolatedDatabaseId]);
      if (phase === 'isolated_network_cleanup') assert.deepEqual(args, ['network', 'rm', isolatedNetworkId]);
      if (phase === 'candidate_cleanup_verify') assert.deepEqual(args, ['ps', '--all', '--filter', `id=${candidateId}`, '--format', '{{.ID}}']);
      if (phase === 'isolated_database_cleanup_verify') assert.deepEqual(args, ['ps', '--all', '--filter', `id=${isolatedDatabaseId}`, '--format', '{{.ID}}']);
      if (phase === 'isolated_network_cleanup_verify') assert.deepEqual(args, ['network', 'ls', '--filter', `id=${isolatedNetworkId}`, '--format', '{{.ID}}']);
      if (phase === 'failure_candidate_remove') assert.deepEqual(args, ['rm', '--force', '--volumes', candidateId]);
      if (phase === 'failure_isolated_database_remove') assert.deepEqual(args, ['rm', '--force', '--volumes', isolatedDatabaseId]);
      if (phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify({ ...prePromotionRecord(image), Name: `/${greenTarget.sealedApiContainer}` }) };
      if (phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
      if (phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
      if (phase === 'failure_restore_current_api_identity_after_rename' || phase === 'failure_restore_green_api_identity_verify') return { stdout: JSON.stringify(prePromotionRecord(image)) };
      if (phase === 'failure_candidate_identity_readback') return { stdout: JSON.stringify({ Id: candidateId, Name: `/${plan.isolated.candidate}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } }) };
      if (phase === 'failure_isolated_database_identity_readback') return { stdout: JSON.stringify({ Id: isolatedDatabaseId, Name: `/${plan.isolated.database}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } }) };
      if (phase === 'failure_isolated_network_identity_readback') return { stdout: JSON.stringify({ Id: isolatedNetworkId, Name: plan.isolated.network, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } }) };
      if (phase === 'candidate_runtime_flags_readback') return { stdout: JSON.stringify({ DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment, googleRegistrationAllowlistEmpty: true }) };
      if (phase === 'candidate_health_and_feature_probes' || phase === 'candidate_ready_probe') return { stdout: JSON.stringify(payload) };
      if (phase === 'candidate_version_probe') return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
      if (phase === 'fresh_protected_backup') return { stdout: 'synthetic protected backup' };
      if (phase === 'isolated_restore') {
        rmSync(options.inputFile, { force: true });
        assert.ok(Buffer.isBuffer(options.inputBytes));
        assert.equal(options.inputDigest, crypto.createHash('sha256').update(options.inputBytes).digest('hex'));
        return restoreCode === undefined ? { stdout: '' } : { stdout: '', code: restoreCode };
      }
      if (phase === stopAtPhase) throw Object.assign(new Error(`stop at ${stopAtPhase}`), { code: stopAtPhase === 'quiesce_green_api' ? 'test_stop_before_quiesce' : 'test_stop_at_phase' });
      if (phase === 'failure_restore_green_api_verify') return { stdout: 'true\n' };
      return { stdout: '' };
    };
    let result;
    try {
      await runGreenPromotion({
        plan, config: runtimeConfig, configFile, environment: {
          GREEN_STAGING_PROMOTION_EXECUTE: '1', GREEN_STAGING_PROMOTION_CONFIRM: runtimeCommit,
        }, execute: true, command: fake, assertRuntimeFiles: async () => {},
      });
      assert.fail('promotion should stop before quiesce');
    } catch (error) {
      result = error;
    }
    return { calls, result };
  };
  const expectedReversible = buildGreenPromotionCommands({ plan, configFile, config: runtimeConfig })
    .slice(0, buildGreenPromotionCommands({ plan, configFile, config: runtimeConfig }).findIndex((entry) => entry.phase === 'quiesce_green_api'))
    .map((entry) => entry.phase);
  const good = await fakeRun(targetManifest.prePromotionImage);
  assert.equal(good.result?.code, 'test_stop_before_quiesce', `${good.result?.message ?? 'no-error'} :: ${good.calls.map((entry) => entry.phase).join('|')}`);
  const quiesceIndex = good.calls.findIndex((entry) => entry.phase === 'quiesce_green_api');
  assert.ok(quiesceIndex > 0);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  for (const invalidTargetSet of [
    `${greenTarget.apiContainer}\t\t\ttrue\t${greenTarget.runId}\n`,
    `${targetContainerSet}${'sit-green-extra\t\t\ttrue\textra\n'}`,
    `${greenTarget.apiContainer}\t\t\t\t${greenTarget.runId}\n${greenTarget.databaseContainer}\t\t\ttrue\t\n`,
    `${greenTarget.apiContainer}\tsit-staging\t\ttrue\t${greenTarget.runId}\n${greenTarget.databaseContainer}\t\t\ttrue\t\n`,
    `${targetContainerSet}shareittoo-staging-api-lookalike\t\t\t\t\n`,
  ]) {
    const invalidTarget = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', invalidTargetSet);
    assert.equal(invalidTarget.result?.code, 'green_target_container_set_invalid');
    assert.equal(invalidTarget.calls.some((entry) => entry.phase === 'quiesce_green_api'), false);
  }
  const preservedExitedGreen = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', `${targetContainerSet}shareittoo-staging-postgres\t sit-staging\t\t\t\n`);
  assert.equal(preservedExitedGreen.result?.code, 'test_stop_before_quiesce');
  const foreignWriter = JSON.stringify([{ role: 'foreign', application: 'staging-api', client: '10.0.0.2', state: 'active' }]);
  const writerBefore = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', targetContainerSet, foreignWriter, '[]\n', emptyFindingFingerprint, 'source_foreign_writer_readback_before_backup');
  assert.equal(writerBefore.result?.code, 'green_foreign_writer_present');
  assert.equal(writerBefore.calls.some((entry) => entry.phase === 'fresh_protected_backup'), false);
  const writerAfter = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', foreignWriter, emptyFindingFingerprint, 'source_foreign_writer_readback_after_backup');
  assert.equal(writerAfter.result?.code, 'green_foreign_writer_present');
  assert.equal(writerAfter.calls.some((entry) => entry.phase === 'fresh_protected_backup'), true);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const invalidIsolatedLedger = await fakeRun(targetManifest.prePromotionImage, 'bad-ledger\n', undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_migration_ledger_readback');
  assert.equal(invalidIsolatedLedger.result?.code, 'green_isolated_migration_ledger_invalid');
  assert.equal(invalidIsolatedLedger.result?.cleanup?.clean, true);
  assert.deepEqual(invalidIsolatedLedger.calls.find((entry) => entry.phase === 'failure_isolated_network_remove')?.args, ['network', 'rm', isolatedNetworkId]);
  assert.equal(invalidIsolatedLedger.calls.some((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const missingInitMarker = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, '', '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_init_complete_log_readback');
  assert.equal(missingInitMarker.result?.code, 'green_isolated_init_complete_log_invalid');
  assert.equal(missingInitMarker.calls.some((entry) => entry.phase === 'isolated_restore'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const readinessOnlyMarker = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, 'database system is ready to accept connections\n', '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_init_complete_log_readback');
  assert.equal(readinessOnlyMarker.result?.code, 'green_isolated_init_complete_log_invalid');
  assert.equal(readinessOnlyMarker.calls.some((entry) => entry.phase === 'isolated_restore'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const missingSecondStableSelect = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_postgres_stable_select_2');
  assert.equal(missingSecondStableSelect.result?.code, 'green_isolated_stable_select_2_invalid');
  assert.equal(missingSecondStableSelect.calls.some((entry) => entry.phase === 'isolated_restore'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const findingDrift = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', JSON.stringify({ paymentRecoveryNeedsReview: [{ source: 'payout', id_hash: 'a'.repeat(64), cause: 'payout_failed', status: 'failed', time_class: '>24h' }], supportNextUpdateOverdue: [] }), 'candidate_finding_fingerprint_readback');
  assert.equal(findingDrift.result?.code, 'green_finding_fingerprint_drift');
  assert.equal(findingDrift.calls.some((entry) => entry.phase === 'candidate_health_and_feature_probes'), false);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'candidate_provider_network_attach')?.args, ['network', 'connect', greenTarget.providerNetwork, candidateId]);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'candidate_start')?.args, ['start', candidateId]);
  const isolatedPostgresCreate = findingDrift.calls.find((entry) => entry.phase === 'isolated_postgres_create');
  assert.equal(isolatedPostgresCreate?.args[isolatedPostgresCreate.args.indexOf('--network') + 1], isolatedNetworkId);
  assert.equal(isolatedPostgresCreate?.args.includes(plan.isolated.network), false);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'failure_candidate_remove')?.args, ['rm', '--force', '--volumes', candidateId]);
  assert.deepEqual(findingDrift.calls.find((entry) => entry.phase === 'failure_isolated_database_remove')?.args, ['rm', '--force', '--volumes', isolatedDatabaseId]);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const restoreZero = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_integrity_and_functional_probes', 0);
  assert.equal(restoreZero.result?.code, 'test_stop_at_phase');
  assert.ok(restoreZero.calls.findIndex((entry) => entry.phase === 'isolated_restore') < restoreZero.calls.findIndex((entry) => entry.phase === 'isolated_integrity_and_functional_probes'));
  assert.equal(restoreZero.calls.some((entry) => entry.phase === 'candidate_cleanup'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const restoreNonzero = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'isolated_integrity_and_functional_probes', 7);
  assert.equal(restoreNonzero.result?.code, 'green_isolated_restore_failed');
  assert.equal(restoreNonzero.calls.some((entry) => entry.phase === 'isolated_integrity_and_functional_probes'), false);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const cleanupBindings = await fakeRun(targetManifest.prePromotionImage, currentMigrationLedger, undefined, '1\n', targetContainerSet, '[]\n', '[]\n', emptyFindingFingerprint, 'canonical_forward_migration_92_to_95');
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'candidate_cleanup')?.args[3], candidateId);
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'candidate_cleanup_verify')?.args[3], `id=${candidateId}`);
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'isolated_database_cleanup_verify')?.args[3], `id=${isolatedDatabaseId}`);
  assert.equal(cleanupBindings.calls.find((entry) => entry.phase === 'isolated_network_cleanup_verify')?.args[3], `id=${isolatedNetworkId}`);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  assert.deepEqual(good.calls.slice(0, quiesceIndex).map((entry) => entry.phase), expectedReversible);
  const provisionEntries = buildGreenPromotionCommands({ plan, configFile, config: runtimeConfig })
    .filter((entry) => entry.phase.startsWith('synthetic_sandbox_provision_'));
  assert.equal(provisionEntries.length, 2);
  for (const entry of provisionEntries) {
    assert.equal(entry.command, 'docker');
    assert.ok(entry.args.includes('--user') && entry.args.includes('100:101'));
    assert.ok(entry.args.includes('--group-add') && entry.args.includes('65532'));
    assert.ok(entry.args.includes('--entrypoint') && entry.args.includes('node'));
    assert.ok(entry.args.includes(`${plan.runtime.image}@${plan.runtime.digest}`));
    assert.ok(entry.args.includes('/app/ops/provision_synthetic_sandbox_user.mjs'));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/app/ops/provision_synthetic_sandbox_user.mjs,readonly')));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/app/ops/stable_private_file.mjs,readonly')));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/run/secrets/mfa-encryption-key,readonly')));
    assert.ok(entry.args.some((arg) => arg.endsWith('dst=/run/secrets/firebase-service-account.json,readonly')));
    assert.ok(entry.args.includes(`type=bind,src=${syntheticSandboxCredentialFilePath},dst=/run/secrets/synthetic-sandbox-user-password,readonly`));
    assert.ok(entry.args.includes('--env') && entry.args.includes('SYNTHETIC_SANDBOX_PASSWORD_FILE=/run/secrets/synthetic-sandbox-user-password'));
    assert.ok(entry.args.includes('--network'));
  }
  const isolatedProvision = provisionEntries.find((entry) => entry.phase === 'synthetic_sandbox_provision_isolated');
  const canonicalProvision = provisionEntries.find((entry) => entry.phase === 'synthetic_sandbox_provision_canonical');
  assert.ok(isolatedProvision.args.includes(plan.isolated.network));
  assert.ok(isolatedProvision.args.includes(configFile) && isolatedProvision.args.includes(plan.isolated.envFile));
  assert.ok(isolatedProvision.args.includes('SIT_GREEN_REHEARSAL=1'));
  assert.ok(canonicalProvision.args.includes(plan.target.network));
  assert.ok(canonicalProvision.args.includes(configFile));
  assert.equal(canonicalProvision.args.includes(plan.isolated.envFile), false);
  assert.equal(good.calls.find((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'), undefined);
  assert.equal(good.calls.find((entry) => entry.phase === 'synthetic_sandbox_provision_canonical'), undefined);
  rmSync(`${evidenceFile}.pgdump`, { force: true });
  const badImage = await fakeRun('shareittoo-api-wrong:old');
  assert.equal(badImage.result.code, 'green_prepromotion_tuple_mismatch');
  assert.equal(badImage.calls.some((entry) => entry.phase === 'quiesce_green_api'), false);
  rmSync(root, { recursive: true, force: true });
});

test('command executor bindings keep isolated probes and canonical runtime distinct', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
  const isolated = commands.find((entry) => entry.phase === 'isolated_integrity_and_functional_probes');
  assert.equal(isolated.runtimeEnv.DATABASE_CONTAINER, plan.isolated.database);
  assert.equal(isolated.runtimeEnv.DATABASE_NAME, plan.isolated.databaseName);
  assert.notEqual(isolated.runtimeEnv.DATABASE_NAME, greenTarget.databaseName);
  const canonical = commands.find((entry) => entry.phase === 'canonical_forward_migration_92_to_95');
  assert.equal(canonical.envFile, config.envFile);
  assert.ok(canonical.args.includes(config.envFile));
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  assert.ok(candidate.args.indexOf(config.envFile) < candidate.args.indexOf(plan.isolated.envFile));
  assert.equal(plan.candidateMounts.length, 4);
  assert.deepEqual(plan.candidateMounts.map((mount) => mount.destination).sort(), [
    '/data/uploads', '/run/secrets/firebase-service-account.json',
    '/run/secrets/mfa-encryption-key', '/run/secrets/synthetic-sandbox-user-password',
  ]);
  assert.equal(plan.finalMounts.length, 3);
  for (const entry of commands.filter(({ phase }) => ['candidate_acceptance_create', 'final_create_no_host_port'].includes(phase))) {
    assert.equal(entry.args.some((arg) => /STRIPE_(?:SECRET|WEBHOOK)|stripe-(?:key|webhook)/iu.test(arg)), false, `${entry.phase} must not mount Stripe credentials`);
  }
  assert.ok(commands.find((entry) => entry.phase === 'isolated_postgres_wait').args.join(' ').includes('pg_isready'));
  assert.ok(commands.find((entry) => entry.phase === 'candidate_health_and_feature_probes').args.includes('--retry'));
  assert.ok(commands.find((entry) => entry.phase === 'final_live_wait').args.includes('--retry'));
  const candidateHealthProbe = commands.find((entry) => entry.phase === 'candidate_health_and_feature_probes');
  const finalHealthProbe = commands.find((entry) => entry.phase === 'final_health_probe');
  assert.equal(new URL(candidateHealthProbe.args.at(-1)).pathname, '/health/ready');
  assert.equal(new URL(finalHealthProbe.args.at(-1)).pathname, '/api/health/ready');
  const accessConfiguration = readStagingAccessConfiguration({
    DEPLOYMENT_ENVIRONMENT: 'staging',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919',
  });
  for (const path of [
    new URL(candidateHealthProbe.args.at(-1)).pathname,
    new URL(finalHealthProbe.args.at(-1)).pathname.replace(/^\/api(?=\/)/u, ''),
  ]) {
    assert.equal(stagingAnonymousPathAllowed(accessConfiguration, { method: 'GET', path }), true, `${path} must be access-gate allowlisted`);
    assert.equal(stagingAnonymousPathAllowed(accessConfiguration, { method: 'HEAD', path }), true, `${path} HEAD must be access-gate allowlisted`);
  }
  assert.equal(stagingAnonymousPathAllowed(accessConfiguration, { method: 'GET', path: '/health' }), false);
  for (const entry of commands.filter(({ command, args }) => command === 'curl' && args.includes('--retry'))) {
    assert.ok(entry.args.includes('--retry-all-errors'), `${entry.phase} must retry transient read errors`);
    assert.equal(entry.args[entry.args.indexOf('--retry') + 1], '30');
    assert.equal(entry.args[entry.args.indexOf('--retry-delay') + 1], '1');
  }
});

test('pre-promotion inventory requires the exact Green DB host and protected mount cohort', () => {
  const base = {
    api: { name: greenTarget.apiContainer, greenLabel: false, prePromotionTuple: true, hostPorts: 0, running: true, networks: [greenTarget.network, greenTarget.providerNetwork], image: greenTarget.prePromotionImage, user: 'shareittoo', databaseHost: greenTarget.databaseContainer, databaseName: greenTarget.databaseName, databaseUser: greenTarget.databaseUser, uploadsVolume: greenTarget.uploadsVolume, groupAdd: true, mounts: sourceMounts },
    database: { name: greenTarget.databaseContainer, greenLabel: true, running: true }, network: { name: greenTarget.network, internal: true }, providerNetwork: { name: greenTarget.providerNetwork }, uploadsVolume: { name: greenTarget.uploadsVolume }, schema: 92,
  };
  assert.equal(assertGreenContainerInventory(base, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), true);
  assert.equal(assertGreenContainerInventory({ ...base, api: { ...base.api, greenLabel: true, prePromotionTuple: false } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), true);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, greenLabel: false, prePromotionTuple: false } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_inventory_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, databaseHost: 'legacy-db' } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.slice(0, -1) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.map((mount) => { const copy = { ...mount }; delete copy.readOnly; return copy; }) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_mount_rw_readback_invalid/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.map((mount) => mount.destination === '/run/secrets/mfa-encryption-key' ? { ...mount, source: '/wrong/path' } : mount) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mounts: base.api.mounts.map((mount) => mount.destination === '/run/secrets/mfa-encryption-key' ? { ...mount, type: 'volume', volume: greenTarget.uploadsVolume, source: null } : mount) } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
  assert.equal(assertGreenRuntimeConfig(config).mounts.length, 5);
  assert.equal(buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' }).finalMounts.length, 3);
  assert.throws(() => assertGreenRuntimeConfig({ ...config, mounts: [...config.mounts, { source: '/foreign/provider-key', destination: '/run/secrets/extra', readOnly: true }] }), /green_mount_inventory_invalid/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, prePromotionTuple: true, greenLabel: true, image: 'ghcr.io/shareittoo/shareittoo-api:wrong' } }, greenTarget.sourceSchema, targetManifest.prePromotionImage, config), /green_prepromotion_tuple_mismatch/u);
});

test('final readback is authoritative for no-port Green routing, mounts, image and protected cohort', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const record = {
    Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: finalMounts,
  };
  assert.equal(assertGreenFinalContainerReadback({ record, plan }), true);
  assert.equal(summarizeGreenFinalContainerReadback(record, plan).hostPorts, 0);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, Env: record.Config.Env.map((entry) => entry === 'MAIL_TRANSPORT=memory' ? 'MAIL_TRANSPORT=smtp' : entry) } }, plan }), /green_broad_promotion_provider_off_invalid/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, User: 'nobody' } }, plan }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Config: { ...record.Config, Image: plan.runtime.image } }, plan }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: record.Mounts.map((mount, index) => index === 1 ? { Destination: mount.Destination, RW: undefined } : mount) }, plan }), /green_mount_rw_readback_invalid/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, NetworkSettings: { ...record.NetworkSettings, Ports: { '8080/tcp': [{ HostPort: '18082' }] } } }, plan }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, HostConfig: { ...record.HostConfig, PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } } }, plan }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: [...record.Mounts, { Type: 'bind', Source: '/wrong/extra', Destination: '/extra', RW: false }] }, plan }), /green_final_(?:inventory_mismatch|mount_inventory_mismatch)/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: record.Mounts.map((mount) => mount.Destination === '/run/secrets/mfa-encryption-key' ? { ...mount, Source: '/wrong/source' } : mount) }, plan }), /green_final_mount_inventory_mismatch/u);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, Mounts: record.Mounts.map((mount) => mount.Destination === '/run/secrets/mfa-encryption-key' ? { ...mount, Type: 'volume', Name: 'foreign-secret-volume', Source: undefined } : mount) }, plan }), /green_final_mount_inventory_mismatch/u);
});

test('emergency cleanup is bounded and never restores sealed Green after schema mutation', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return { stdout: '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api', 'seal_green_api'], schemaMutationStarted: true });
  assert.equal(result.clean, true);
  assert.equal(result.restored, false);
  assert.equal(calls.some((call) => call.args.includes('start') && call.args.includes(greenTarget.apiContainer)), false);
});

test('emergency cleanup with no completed creation phases issues zero deletion commands', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return { stdout: '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: [] });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.args.includes('rm')), false);
  assert.equal(calls.some((call) => call.args.includes('volume') || call.args.includes('network')), false);
});

test('emergency cleanup rejects same-name foreign resources without deleting them', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const foreign = { Config: { Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': 'different-run', 'com.shareittoo.sit.green': 'true' } }, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': 'different-run' } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase.endsWith('identity_readback')) return { stdout: JSON.stringify({ Name: `/${args.at(-1)}`, ...foreign }) };
    if (options.phase.endsWith('_verify')) return { stdout: 'foreign-resource\n' };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({
    plan,
    command: fake,
    completed: ['candidate_acceptance_create', 'isolated_postgres_create', 'isolated_network_create'],
    resourceIds: { candidateId: 'a'.repeat(64), isolatedDatabaseId: 'b'.repeat(64), isolatedNetworkId: 'c'.repeat(64) },
  });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.args.includes('rm')), false);
});

test('emergency cleanup never deletes a prior same-name resource when create response is unknown', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_isolated_network_identity_readback') return { stdout: JSON.stringify({ Id: 'prior-network-id', Name: plan.isolated.network, Labels: { 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } }) };
    if (options.phase === 'failure_isolated_network_verify') return { stdout: `${plan.isolated.network}\n` };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, phaseStarted: 'isolated_network_create' });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_isolated_network_remove'), false);
});

test('emergency cleanup removes anonymous volumes only with the owned container ID', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const databaseId = 'd'.repeat(64);
  const identity = { Id: databaseId, Name: `/${plan.isolated.database}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_isolated_database_identity_readback') return { stdout: JSON.stringify(identity) };
    if (options.phase === 'failure_isolated_database_remove') assert.deepEqual(args, ['rm', '--force', '--volumes', databaseId]);
    const restore = restoreFixture(options);
    if (restore) return restore;
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['isolated_postgres_create'], resourceIds: { isolatedDatabaseId: databaseId }, originalApiIdentity });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.command === 'docker' && call.args[0] === 'volume'), false);
});

test('emergency cleanup removes a container by the inspected immutable ID', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'c'.repeat(32) });
  const calls = [];
  const identity = { Id: 'c'.repeat(64), Name: `/${plan.isolated.candidate}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_candidate_identity_readback') return { stdout: JSON.stringify(identity) };
    if (options.phase === 'failure_candidate_remove') {
      assert.deepEqual(args, ['rm', '--force', '--volumes', identity.Id]);
      return { stdout: '' };
    }
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['candidate_acceptance_create'], resourceIds: { candidateId: identity.Id }, schemaMutationStarted: true });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.options.phase === 'failure_candidate_remove'), true);
});

test('emergency cleanup refuses a container ID rebind before deletion', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'e'.repeat(32) });
  const calls = [];
  let inspectCount = 0;
  const owned = { Id: '1'.repeat(64), Name: `/${plan.isolated.candidate}`, Config: { Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } } };
  const foreign = { ...owned, Id: '2'.repeat(64) };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_candidate_identity_readback') return { stdout: JSON.stringify(++inspectCount === 1 ? owned : foreign) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['candidate_acceptance_create'], resourceIds: { candidateId: owned.Id }, schemaMutationStarted: true });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_candidate_remove'), false);
});

test('pre-schema failure restores and verifies the sealed API', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return restoreFixture(options) ?? { stdout: '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api', 'seal_green_api'], phaseStarted: 'seal_green_api', schemaMutationStarted: false, originalApiIdentity });
  assert.equal(result.clean, true);
  assert.equal(result.restored, true);
  assert.equal(calls.some((call) => call.args.includes('start') && call.args.includes(originalApiIdentity.id)), true);
});

test('quiesce response loss with failed restore is not reported clean', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const fake = async (command, args, options) => restoreFixture(options, false) ?? { stdout: '' };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, phaseStarted: 'quiesce_green_api', schemaMutationStarted: false, originalApiIdentity });
  assert.equal(result.restored, false);
  assert.equal(result.clean, false);
  assert.equal(result.restoreError, 'failure_restore_green_api_not_running_or_identity_mismatch');
});

test('restore refuses a same-name rebound container after rename', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const rebound = { ...restoredApiIdentityRecord, Id: 'foreign-rebound-id' };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify({ ...originalApiIdentityRecord, Name: `/${greenTarget.sealedApiContainer}` }) };
    if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
    if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
    if (options.phase === 'failure_restore_current_api_identity_after_rename') return { stdout: JSON.stringify(rebound) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_restore_green_api'), false);
});

test('restore refuses a foreign sealed-name collision even when current name is exact', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const foreignSealed = { ...originalApiIdentityRecord, Id: 'foreign-sealed-id', Name: `/${greenTarget.sealedApiContainer}` };
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify(foreignSealed) };
    if (options.phase === 'failure_restore_current_api_identity_readback') return { stdout: JSON.stringify({ ...restoredApiIdentityRecord, State: { Running: false } }) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
  assert.equal(result.clean, false);
  assert.equal(calls.some((call) => call.options.phase === 'failure_restore_green_api'), false);
});

test('restore reconciles a lost rename response before starting the exact original', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'failure_restore_sealed_api_identity_readback') return { stdout: JSON.stringify({ ...originalApiIdentityRecord, Name: `/${greenTarget.sealedApiContainer}` }) };
    if (options.phase === 'failure_restore_current_api_identity_readback') return { code: 'not_found', stdout: '' };
    if (options.phase === 'failure_restore_current_api_absence_readback') return { stdout: '' };
    if (options.phase === 'failure_restore_sealed_api') {
      assert.equal(args[1], originalApiIdentity.id);
      return { code: 'response_lost', stdout: '' };
    }
    if (options.phase === 'failure_restore_current_api_identity_after_rename') return { stdout: JSON.stringify(restoredApiIdentityRecord) };
    if (options.phase === 'failure_restore_sealed_api_identity_after_rename') return { code: 'not_found', stdout: '' };
    if (options.phase === 'failure_restore_green_api') {
      assert.equal(args[1], originalApiIdentity.id);
      return { stdout: '' };
    }
    if (options.phase === 'failure_restore_green_api_identity_verify') return { stdout: JSON.stringify(restoredApiIdentityRecord) };
    return { stdout: '' };
  };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api'], phaseStarted: 'seal_green_api', originalApiIdentity });
  assert.equal(result.clean, true);
  assert.equal(calls.some((call) => call.options.phase === 'failure_restore_green_api'), true);
});

test('post-schema forward recovery creates only the successor and verifies its public contract', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const record = {
    Id: 'a'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: finalMounts,
  };
  const preStartRecord = { ...record, State: { Running: false }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {} } } };
  const attachedPreStartRecord = { ...record, State: { Running: false } };
  const image = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@sha256:${'e'.repeat(64)}`] };
  const calls = [];
  let failProviderAttach = false;
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase.startsWith('recovery_')) {
      const phase = options.phase.slice('recovery_'.length);
      const expected = commands.find((entry) => entry.phase === phase);
      if (phase === 'successor_identity_readback') {
        assert.equal(command, 'docker');
        assert.ok([record.Id, greenTarget.apiContainer].includes(args.at(-1)));
      } else if (phase === 'final_provider_network_attach') {
        assert.deepEqual(args, ['network', 'connect', greenTarget.providerNetwork, record.Id]);
      } else if (phase === 'final_start') {
        assert.deepEqual(args, ['start', record.Id]);
      } else {
        assert.ok(expected, `unexpected recovery phase: ${phase}`);
        assert.equal(command, expected.command);
        assert.deepEqual(args, expected.args);
      }
    }
    if (options.phase === 'recovery_final_provider_network_attach' && failProviderAttach) return { code: 1, stdout: '' };
    if (options.phase === 'recovery_canonical_schema_readback') return { stdout: '095_staging_google_registration_replays.up.sql\n' };
    if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
    if (options.phase === 'recovery_final_create_no_host_port') return { stdout: `${record.Id}\n` };
    if (options.phase === 'recovery_successor_identity_readback') return { stdout: JSON.stringify(args.at(-1) === record.Id ? preStartRecord : attachedPreStartRecord) };
    if (options.phase.endsWith('final_image_readback')) return { stdout: JSON.stringify(image) };
    if (options.phase.endsWith('final_inventory_readback')) return { stdout: JSON.stringify(record) };
    if (options.phase.endsWith('final_health_probe') || options.phase.endsWith('final_ready_wait')) return { stdout: JSON.stringify(payload) };
    if (options.phase.endsWith('final_version_readback')) return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
    return { stdout: '' };
  };
  const result = await runGreenForwardRecovery({ plan, commands, command: fake, completed: [] });
  assert.equal(result.status, 'verified');
  assert.equal(calls.some((call) => call.args.includes('shareittoo-staging-api-alt-sealed-green')), false);
  for (const phase of ['recovery_final_provider_network_attach', 'recovery_final_start']) {
    const call = calls.find((entry) => entry.options.phase === phase);
    assert.equal(call.args.at(-1), record.Id);
  }
  const retained = await runGreenForwardRecovery({ plan, commands, command: fake, completed: ['final_create_no_host_port', 'final_provider_network_attach', 'final_start'] });
  assert.equal(retained.status, 'verified');
  const resumed = await runGreenForwardRecovery({ plan, commands, command: fake, completed: ['final_create_no_host_port', 'final_provider_network_attach'] });
  assert.equal(resumed.status, 'verified');
  const resumedStart = calls.findLast((entry) => entry.options.phase === 'recovery_final_start');
  assert.deepEqual(resumedStart.args, ['start', record.Id]);
  const startsBeforeAttachFailure = calls.filter((entry) => entry.options.phase === 'recovery_final_start').length;
  failProviderAttach = true;
  await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [] }), /green_forward_recovery_final_provider_network_attach_failed/u);
  assert.equal(calls.filter((entry) => entry.options.phase === 'recovery_final_start').length, startsBeforeAttachFailure);
});

test('forward recovery stops on a foreign final-name conflict before network attach or start', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'd'.repeat(32) });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const calls = [];
  const foreign = { Id: 'f'.repeat(64), Name: `/${greenTarget.apiContainer}`, Config: { Image: 'ghcr.io/foreign/api:foreign', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': 'foreign-run' } } };
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase === 'recovery_canonical_schema_readback') return { stdout: '095_staging_google_registration_replays.up.sql\n' };
    if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: currentMigrationLedger };
    if (options.phase === 'recovery_final_create_no_host_port') return { code: 17, stdout: '' };
    if (options.phase === 'recovery_existing_final_inspect') return { stdout: JSON.stringify(foreign) };
    return { stdout: '' };
  };
  await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [] }), /green_forward_recovery_create_conflict/u);
  assert.equal(calls.some((call) => call.options.phase === 'recovery_final_provider_network_attach'), false);
  assert.equal(calls.some((call) => call.options.phase === 'recovery_final_start'), false);
});

test('successor pre-start validation rejects wrong User, Env and mounts', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json', ownershipNonce: 'f'.repeat(32) });
  const record = {
    Id: '9'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: false }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {} } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: finalMounts,
  };
  assert.equal(assertGreenSuccessorPreStartReadback({ record, plan, expectedId: record.Id }), true);
  const candidateRecord = {
    ...record,
    Id: '8'.repeat(64), Name: `/${plan.isolated.candidate}`,
    NetworkSettings: { Ports: { '8080/tcp': null }, Networks: { [plan.isolated.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { ...record.Config, Labels: { ...record.Config.Labels, 'com.shareittoo.green.candidate': plan.target.runId, 'com.shareittoo.green.rehearsal': 'true', 'com.shareittoo.green.rehearsal_id': plan.isolated.rehearsalId } },
    Mounts: [...finalMounts.map((mount) => mount.Destination === '/data/uploads' ? { ...mount, Name: 'anonymous-uploads-id' } : mount), { Type: 'bind', Source: syntheticSandboxCredentialFilePath, Destination: '/run/secrets/synthetic-sandbox-user-password', RW: false }],
  };
  candidateRecord.HostConfig = { ...record.HostConfig, PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }] } };
  assert.equal(assertGreenSuccessorPreStartReadback({ record: candidateRecord, plan, expectedId: candidateRecord.Id, expectedNetworks: [plan.isolated.network, greenTarget.providerNetwork], expectedName: plan.isolated.candidate, expectedMounts: plan.candidateMounts, expectedCandidate: true, allowAnonymousUploadsVolume: true }), true);
  for (const invalidBinding of [
    { '8080/tcp': [{ HostIp: '0.0.0.0', HostPort: '18082' }] },
    { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18081' }] },
    { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18082' }], '9090/tcp': [{ HostIp: '127.0.0.1', HostPort: '19090' }] },
  ]) {
    assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...candidateRecord, HostConfig: { ...candidateRecord.HostConfig, PortBindings: invalidBinding } }, plan, expectedId: candidateRecord.Id, expectedNetworks: [plan.isolated.network, greenTarget.providerNetwork], expectedName: plan.isolated.candidate, expectedMounts: plan.candidateMounts, expectedCandidate: true, allowAnonymousUploadsVolume: true }), /green_successor_prestart_network_invalid/u);
  }
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Config: { ...record.Config, User: 'nobody' } }, plan, expectedId: record.Id }), /green_final_inventory_mismatch/u);
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Config: { ...record.Config, Env: record.Config.Env.map((entry) => entry === 'PAYMENT_TRANSPORT=memory' ? 'PAYMENT_TRANSPORT=stripe' : entry) } }, plan, expectedId: record.Id }), /green_prestart|green_final|green_runtime/u);
  assert.throws(() => assertGreenSuccessorPreStartReadback({ record: { ...record, Mounts: record.Mounts.map((mount) => mount.Destination === '/run/secrets/mfa-encryption-key' ? { ...mount, Source: '/foreign/secret' } : mount) }, plan, expectedId: record.Id }), /green_final_mount_inventory_mismatch/u);
});

test('forward recovery fails closed before candidate continuation on migration readback gaps', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const payload = { checks: { technicalSandbox: greenTechnicalSandboxHealth, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const record = {
    Id: 'b'.repeat(64), Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['DEPLOYMENT_ENVIRONMENT=test', 'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false', 'SIT_STAGING_ACCESS_GATE_ENABLED=true', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=false', 'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919', ...greenRuntimeEnvEntries] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: finalMounts,
  };
  const image = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@sha256:${'e'.repeat(64)}`] };
  for (const invalid of [
    { migration: '', ledger: currentMigrationLedger, code: 'green_forward_recovery_schema_readback_invalid' },
    { migration: '094_apple_refresh_material_only.up.sql', ledger: currentMigrationLedger, code: 'green_forward_recovery_schema_readback_invalid' },
    { migration: '095_staging_google_registration_replays.up.sql', ledger: 'bad-ledger\n', code: 'green_forward_recovery_migration_ledger_invalid' },
  ]) {
    const calls = [];
    const fake = async (command, args, options) => {
      calls.push({ command, args, options });
      if (options.phase === 'recovery_canonical_schema_readback') return { stdout: `${invalid.migration}\n` };
      if (options.phase === 'recovery_canonical_migration_ledger_readback') return { stdout: `${invalid.ledger}\n` };
      if (options.phase.endsWith('final_image_readback')) return { stdout: JSON.stringify(image) };
      if (options.phase.endsWith('final_inventory_readback')) return { stdout: JSON.stringify(record) };
      if (options.phase.endsWith('final_health_probe') || options.phase.endsWith('final_ready_wait')) return { stdout: JSON.stringify(payload) };
      if (options.phase.endsWith('final_version_readback')) return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
      return { stdout: '' };
    };
    await assert.rejects(runGreenForwardRecovery({ plan, commands, command: fake, completed: [] }), new RegExp(invalid.code, 'u'));
    assert.equal(calls.some((call) => call.options.phase === 'recovery_final_create_no_host_port'), false);
  }
});

test('sanitized evidence accepts approved secret mount paths but rejects secret-bearing fields', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  assert.doesNotThrow(() => sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { finalInventory: { mountDestinations: [{ destination: '/run/secrets/mfa-encryption-key', readOnly: true }] } }, imageReadback: { commit: runtimeCommit } }));
  const forbidden = 'pass' + 'word';
  assert.throws(() => sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { [forbidden]: 'synthetic-value' }, imageReadback: { commit: runtimeCommit } }), /green_evidence_secret_leak/u);
});

test('sanitized evidence and cleanup never turn Green promotion into legacy/prod mutation', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const evidence = sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { schema: 95 }, imageReadback: { live: 200, ready: 200 } });
  assert.equal(evidence.redaction, 'sensitive values omitted');
  assert.deepEqual({ mail: evidence.safety.mailTransport, push: evidence.safety.pushTransport, identity: evidence.safety.identityTransport, listingProvider: evidence.safety.listingAiProvider, listingExternal: evidence.safety.listingAiExternalExecutionApproved, listingBudgetCents: evidence.safety.listingAiBudgetCents }, { mail: 'memory', push: 'memory', identity: 'memory', listingProvider: 'on_device', listingExternal: false, listingBudgetCents: 0 });
  assert.doesNotMatch(JSON.stringify(evidence), /DATABASE_URL|JWT_SECRET|password|token|whsec_|sk_live_|sk_test_/iu);
  assert.equal(assertGreenCleanup({ removed: ['sit-green-rehearsal-network-x'], verifiedAbsent: ['sit-green-rehearsal-network-x'], oldApiSealed: true, oldApiRunning: false }), true);
  assert.throws(() => assertGreenCleanup({ removed: ['shareittoo-staging-api'], verifiedAbsent: ['shareittoo-staging-api'], oldApiSealed: true, oldApiRunning: false }));
  assert.throws(() => assertGreenCleanup({ removed: ['shareittoo-staging-api-lookalike'], verifiedAbsent: ['shareittoo-staging-api-lookalike'], oldApiSealed: true, oldApiRunning: false }));
});

test('evidence writer is external, exclusive and mode 0600', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sit-green-promotion-evidence-'));
  const file = path.join(root, 'evidence.json');
  try {
    const result = await writeGreenEvidence(file, { kind: 'sit-green-promotion', redaction: 'sensitive values omitted' });
    assert.equal(result.path, file);
    assert.equal(lstatSync(file).mode & 0o777, 0o600);
    await assert.rejects(() => writeGreenEvidence(file, { kind: 'sit-green-promotion' }), /green_evidence_path_exists/u);
    const forbidden = 'pass' + 'word';
    await assert.rejects(() => writeGreenEvidence(path.join(root, 'secret.json'), { [forbidden]: 'not allowed' }), /green_evidence_secret_leak/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
