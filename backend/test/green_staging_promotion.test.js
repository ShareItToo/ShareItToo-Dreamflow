import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertGreenCleanup,
  assertGreenContainerInventory,
  assertGreenProtectedEnvironment,
  assertGreenRuntimeConfig,
  assertGreenRuntimeImage,
  assertGreenRuntimeReadbacks,
  assertGreenFinalContainerReadback,
  summarizeGreenFinalContainerReadback,
  assertGreenTargetManifest,
  buildGreenPromotionCommands,
  buildGreenPromotionPlan,
  greenTarget,
  sanitizeGreenEvidence,
  normalizedGreenTargetDigest,
  assertGreenCommandBindings,
  writeGreenEvidence,
  runGreenEmergencyCleanup,
  runGreenForwardRecovery,
} from '../ops/green_staging_promotion.mjs';

const runtimeCommit = '266f69c21dd61bfcdb212c24a0c8788b172bed9e';
const opsCommit = '8fecd57018ab10a0c6733531539472e6179a02db';
const targetManifest = {
  kind: 'sit-green-staging-target', schemaVersion: 1, composeProject: 'sit-green',
  greenLabel: 'com.shareittoo.sit.green=true', runId: greenTarget.runId,
  apiContainer: greenTarget.apiContainer, databaseContainer: greenTarget.databaseContainer,
  databaseVolume: greenTarget.databaseVolume, network: greenTarget.network,
  providerNetwork: greenTarget.providerNetwork, uploadsVolume: greenTarget.uploadsVolume,
  networkInternal: true, sourceSchema: 87, currentSchema: 92, prePromotionImage: 'shareittoo-api-wp260b:4d61611a',
};
targetManifest.targetDigest = normalizedGreenTargetDigest(targetManifest);
const config = {
  environment: 'staging', envFile: '/docker/shareittoo/staging-secrets/green.env',
  envNames: ['NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'JWT_SECRET', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER', 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', 'SIT_STAGING_ACCESS_GATE_ENABLED', 'SIT_STAGING_ALLOWED_USER_IDS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_VERIFICATION_ENABLED', 'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_BUDGET_CENTS', 'ENABLE_STAGING_STRIPE', 'TECHNICAL_SANDBOX_ENABLED', 'TECHNICAL_SANDBOX_KILL_SWITCH', 'TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT', 'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT', 'SIT_STAGING_PILOT_ID', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE', 'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE', 'SYNTHETIC_SANDBOX_PASSWORD_FILE'],
  mfaFile: '/docker/shareittoo/staging-secrets/mfa-encryption-key',
  firebaseFile: '/docker/shareittoo/staging-secrets/firebase.json',
  technicalSandboxKeyFile: '/docker/shareittoo/staging-secrets/technical-sandbox-key',
  technicalSandboxWebhookFile: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook',
  syntheticUserId: 'synthetic_sandbox_user_pilot_20260919', paymentTransport: 'memory',
  stripeLiveMode: false, identityTransport: 'memory', listingAiProvider: 'on_device',
  listingAiExternalAllowed: false, accessGateDigest: 'b'.repeat(64), providerConfigDigest: 'c'.repeat(64),
  mounts: [
    { source: '/docker/shareittoo/staging-secrets/mfa-encryption-key', destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/firebase.json', destination: '/run/secrets/firebase-service-account.json', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-key', destination: '/run/secrets/technical-sandbox-key', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/technical-sandbox-webhook', destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/synthetic-sandbox-user-password', destination: '/run/secrets/synthetic-sandbox-user-password', readOnly: true },
    { source: '/docker/shareittoo/staging-secrets/uploads', destination: '/data/uploads', readOnly: false },
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

test('protected Green runtime environment binds memory payment, pilot, paths and no provider secrets', () => {
  const values = {
    ENABLE_STAGING_STRIPE: '0', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
    TECHNICAL_SANDBOX_ENABLED: '1', TECHNICAL_SANDBOX_KILL_SWITCH: '0',
    SIT_STAGING_PILOT_ID: 'heilbronn_wave0', SIT_STAGING_COMPOSE_PROJECT: 'sit-green', SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919',
    TECHNICAL_SANDBOX_SECRET_KEY_FILE: '/run/secrets/technical-sandbox-key',
    TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: '/run/secrets/technical-sandbox-webhook',
  };
  assert.equal(assertGreenProtectedEnvironment(values, config), true);
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, PAYMENT_TRANSPORT: 'stripe' }, config));
  assert.throws(() => assertGreenProtectedEnvironment({ ...values, OPENAI_API_KEY: 'present' }, config));
});

test('runtime image must be immutable GHCR commit plus digest', () => {
  assert.equal(assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }).runtimeCommit, runtimeCommit);
  assert.throws(() => assertGreenRuntimeImage({ image: 'shareittoo-api:latest', digest: `sha256:${'d'.repeat(64)}`, runtimeCommit }), /runtime_image_tag_mismatch/u);
  assert.throws(() => assertGreenRuntimeImage({ image: `ghcr.io/shareittoo/shareittoo-api:${runtimeCommit}`, digest: 'sha256:short', runtimeCommit }), /runtime_image_digest_required/u);
});

test('runtime readback binds version and capability safety surface', () => {
  const payload = { checks: { technicalSandbox: { available: true, amountMinor: 100, currency: 'EUR' }, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  assert.equal(assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: payload, ready: payload, runtimeCommit }), true);
  assert.throws(() => assertGreenRuntimeReadbacks({ version: { commit: '0'.repeat(40), environment: 'test' }, health: payload, ready: payload, runtimeCommit }));
  assert.throws(() => assertGreenRuntimeReadbacks({ version: { commit: runtimeCommit, environment: 'test' }, health: { ...payload, checks: { ...payload.checks, technicalSandbox: { ...payload.checks.technicalSandbox, amountMinor: 200 } } }, ready: payload, runtimeCommit }));
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
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  const final = commands.find((entry) => entry.phase === 'final_create_no_host_port');
  assert.ok(candidate.args.includes('--publish') && candidate.args.includes('127.0.0.1:18082:8080'));
  assert.ok(!final.args.includes('--publish') && !final.args.includes('-p'));
  assert.ok(final.args.includes(`type=volume,src=${greenTarget.uploadsVolume},dst=/data/uploads,readonly=false`));
  assert.ok(final.args.includes('--group-add') && final.args.includes('65532'));
  assert.ok(final.args.some((arg) => arg.includes('com.shareittoo.sit.green=true')));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_migrate_87_to_92'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_restore' && entry.inputFile));
  assert.ok(commands.find((entry) => entry.phase === 'candidate_mfa_identity_probes'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_network_cleanup_verify'));
  assert.ok(commands.find((entry) => entry.phase === 'canonical_forward_migration_87_to_92'));
  assert.ok(commands.find((entry) => entry.phase === 'canonical_schema_readback'));
  assert.ok(commands.find((entry) => entry.phase === 'sealed_name_conflict_check'));
  assert.ok(commands.find((entry) => entry.phase === 'final_inventory_readback'));
  assert.ok(commands.find((entry) => entry.phase === 'final_image_readback'));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision_isolated'));
  assert.ok(commands.some((entry) => entry.phase === 'synthetic_sandbox_provision_canonical'));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_uploads_volume_cleanup_verify'));
  const phaseIndex = (phase) => commands.findIndex((entry) => entry.phase === phase);
  assert.ok(phaseIndex('candidate_cleanup_verify') < phaseIndex('quiesce_green_api'));
  assert.ok(phaseIndex('quiesce_green_api') < phaseIndex('canonical_forward_migration_87_to_92'));
  assert.ok(phaseIndex('canonical_schema_readback') < phaseIndex('final_create_no_host_port'));
  assert.equal(commands.some((entry) => entry.args?.some((arg) => /shareittoo-staging-postgres|shareittoo_staging_backend|shareittoo_staging_postgres_data|prod|production/iu.test(arg))), false);
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

test('runtime inventory binds the pre-promotion image through the promotion plan', () => {
  const source = readFileSync(new URL('../ops/green_staging_promotion.mjs', import.meta.url), 'utf8');
  assert.match(source, /expectedPrePromotionImage:\s*plan\.target\.prePromotionImage/u);
  assert.doesNotMatch(source, /expectedPrePromotionImage:\s*target\.prePromotionImage/u);
});

test('command executor bindings keep isolated probes and canonical runtime distinct', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  assert.equal(assertGreenCommandBindings(commands, plan, config.envFile), true);
  const isolated = commands.find((entry) => entry.phase === 'isolated_integrity_and_functional_probes');
  assert.equal(isolated.runtimeEnv.DATABASE_CONTAINER, plan.isolated.database);
  assert.equal(isolated.runtimeEnv.DATABASE_NAME, plan.isolated.databaseName);
  assert.notEqual(isolated.runtimeEnv.DATABASE_NAME, greenTarget.databaseName);
  const canonical = commands.find((entry) => entry.phase === 'canonical_forward_migration_87_to_92');
  assert.equal(canonical.envFile, config.envFile);
  assert.ok(canonical.args.includes(config.envFile));
  const candidate = commands.find((entry) => entry.phase === 'candidate_acceptance_create');
  assert.ok(candidate.args.indexOf(config.envFile) < candidate.args.indexOf(plan.isolated.envFile));
  assert.ok(commands.find((entry) => entry.phase === 'isolated_postgres_wait').args.join(' ').includes('pg_isready'));
  assert.ok(commands.find((entry) => entry.phase === 'candidate_health_and_feature_probes').args.includes('--retry'));
  assert.ok(commands.find((entry) => entry.phase === 'final_live_wait').args.includes('--retry'));
});

test('pre-promotion inventory requires the exact Green DB host and protected mount cohort', () => {
  const base = {
    api: { name: greenTarget.apiContainer, greenLabel: false, prePromotionTuple: true, hostPorts: 0, running: true, networks: [greenTarget.network, greenTarget.providerNetwork], image: 'shareittoo-api-wp260b:4d61611a', expectedPrePromotionImage: targetManifest.prePromotionImage, databaseHost: greenTarget.databaseContainer, databaseName: greenTarget.databaseName, databaseUser: greenTarget.databaseUser, uploadsVolume: greenTarget.uploadsVolume, groupAdd: true, mountDestinations: ['/run/secrets/mfa-encryption-key', '/run/secrets/firebase-service-account.json', '/data/uploads'] },
    database: { name: greenTarget.databaseContainer, greenLabel: true, running: true }, network: { name: greenTarget.network, internal: true }, providerNetwork: { name: greenTarget.providerNetwork }, uploadsVolume: { name: greenTarget.uploadsVolume }, schema: 87,
  };
  assert.equal(assertGreenContainerInventory(base), true);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, databaseHost: 'legacy-db' } }), /green_prepromotion_tuple_mismatch/u);
  assert.throws(() => assertGreenContainerInventory({ ...base, api: { ...base.api, mountDestinations: base.api.mountDestinations.slice(0, -1) } }), /green_prepromotion_tuple_mismatch/u);
});

test('final readback is authoritative for no-port Green routing, mounts, image and protected cohort', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const record = {
    Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { Image: plan.runtime.image, Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919'] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: [
      { Destination: '/data/uploads', Name: greenTarget.uploadsVolume, RW: true },
      ...['/run/secrets/firebase-service-account.json', '/run/secrets/mfa-encryption-key', '/run/secrets/technical-sandbox-key', '/run/secrets/technical-sandbox-webhook'].map((Destination) => ({ Destination, RW: false })),
    ],
  };
  assert.equal(assertGreenFinalContainerReadback({ record, plan }), true);
  assert.equal(summarizeGreenFinalContainerReadback(record, plan).hostPorts, 0);
  assert.throws(() => assertGreenFinalContainerReadback({ record: { ...record, NetworkSettings: { ...record.NetworkSettings, Ports: { '8080/tcp': [{ HostPort: '18082' }] } } }, plan }), /green_final_inventory_mismatch/u);
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

test('pre-schema failure restores and verifies the sealed API', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const calls = [];
  const fake = async (command, args, options) => { calls.push({ command, args, options }); return { stdout: options.phase === 'failure_restore_green_api_verify' ? 'true\n' : '' }; };
  const result = await runGreenEmergencyCleanup({ plan, command: fake, completed: ['quiesce_green_api', 'seal_green_api'], phaseStarted: 'seal_green_api', schemaMutationStarted: false });
  assert.equal(result.clean, true);
  assert.equal(result.restored, true);
  assert.equal(calls.some((call) => call.args.includes('start') && call.args.includes(greenTarget.apiContainer)), true);
});

test('post-schema forward recovery creates only the successor and verifies its public contract', async () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const commands = buildGreenPromotionCommands({ plan, configFile: config.envFile, config });
  const payload = { checks: { technicalSandbox: { available: true, amountMinor: 100, currency: 'EUR' }, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } };
  const record = {
    Name: `/${greenTarget.apiContainer}`, State: { Running: true }, NetworkSettings: { Ports: {}, Networks: { [greenTarget.network]: {}, [greenTarget.providerNetwork]: {} } },
    Config: { Image: plan.runtime.image, Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': greenTarget.runId }, Env: ['PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false', 'SIT_STAGING_COMPOSE_PROJECT=sit-green', 'SIT_STAGING_ALLOWED_USER_IDS=synthetic_sandbox_user_pilot_20260919'] },
    HostConfig: { GroupAdd: ['65532'] }, Mounts: [{ Destination: '/data/uploads', Name: greenTarget.uploadsVolume, RW: true }, ...['/run/secrets/firebase-service-account.json', '/run/secrets/mfa-encryption-key', '/run/secrets/technical-sandbox-key', '/run/secrets/technical-sandbox-webhook'].map((Destination) => ({ Destination, RW: false }))],
  };
  const image = { Config: { Labels: { 'org.opencontainers.image.revision': runtimeCommit }, User: 'shareittoo' }, RepoDigests: [`ghcr.io/shareittoo/shareittoo-api@sha256:${'e'.repeat(64)}`] };
  const calls = [];
  const fake = async (command, args, options) => {
    calls.push({ command, args, options });
    if (options.phase.endsWith('final_image_readback')) return { stdout: JSON.stringify(image) };
    if (options.phase.endsWith('final_inventory_readback')) return { stdout: JSON.stringify(record) };
    if (options.phase.endsWith('final_health_probe') || options.phase.endsWith('final_ready_wait')) return { stdout: JSON.stringify(payload) };
    if (options.phase.endsWith('final_version_readback')) return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'staging' }) };
    return { stdout: '' };
  };
  const result = await runGreenForwardRecovery({ plan, commands, command: fake, completed: [] });
  assert.equal(result.status, 'verified');
  assert.equal(calls.some((call) => call.args.includes('shareittoo-staging-api-alt-sealed-green')), false);
  const retained = await runGreenForwardRecovery({ plan, commands, command: fake, completed: ['final_create_no_host_port', 'final_provider_network_attach', 'final_start'] });
  assert.equal(retained.status, 'verified');
});

test('sanitized evidence accepts approved secret mount paths but rejects secret-bearing fields', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  assert.doesNotThrow(() => sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { finalInventory: { mountDestinations: [{ destination: '/run/secrets/mfa-encryption-key', readOnly: true }] } }, imageReadback: { commit: runtimeCommit } }));
  const forbidden = 'pass' + 'word';
  assert.throws(() => sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { [forbidden]: 'synthetic-value' }, imageReadback: { commit: runtimeCommit } }), /green_evidence_secret_leak/u);
});

test('sanitized evidence and cleanup never turn Green promotion into legacy/prod mutation', () => {
  const plan = buildGreenPromotionPlan({ targetManifest, config, runtimeCommit, runtimeImageDigest: `sha256:${'e'.repeat(64)}`, opsCommit, evidenceFile: '/docker/shareittoo/evidence/green-promotion.json' });
  const evidence = sanitizeGreenEvidence({ plan, backupDigest: 'f'.repeat(64), configDigest: '1'.repeat(64), targetReadback: { schema: 92 }, imageReadback: { live: 200, ready: 200 } });
  assert.equal(evidence.redaction, 'sensitive values omitted');
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
