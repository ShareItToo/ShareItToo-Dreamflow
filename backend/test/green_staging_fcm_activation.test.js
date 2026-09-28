import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertGreenFcmCommandSafety,
  assertGreenFcmEnvironmentParity,
  assertGreenFcmRuntimeEnvironment,
  buildGreenFcmActivationPlan,
  runGreenFcmActivation,
} from '../ops/green_staging_fcm_activation.mjs';
import {
  greenBroadPromotionEnvironment,
  greenTarget,
  greenTechnicalSandboxEnvironment,
  normalizedGreenTargetDigest,
} from '../ops/green_staging_promotion.mjs';

const runtimeCommit = '01f81655a8dfcb59a6f15c6ff7b817dd5dcef75d';
const opsCommit = '928861bd4cfd080f90463d0445d59810c3280ad2';
const runtimeDigest = `sha256:${'e'.repeat(64)}`;
const targetNetworkId = '4'.repeat(64);
const providerNetworkId = '5'.repeat(64);
const sourceId = 'a'.repeat(64);
const successorId = 'b'.repeat(64);

const targetManifest = {
  kind: 'sit-green-staging-target', schemaVersion: 3, composeProject: 'sit-green',
  greenLabel: 'com.shareittoo.sit.green=true', runId: greenTarget.runId,
  apiContainer: greenTarget.apiContainer, databaseContainer: greenTarget.databaseContainer,
  databaseVolume: greenTarget.databaseVolume, network: greenTarget.network,
  providerNetwork: greenTarget.providerNetwork, uploadsVolume: greenTarget.uploadsVolume,
  networkInternal: true, sourceSchema: 98, currentSchema: 98,
  sourceLedgerDigest: greenTarget.sourceLedgerDigest, currentLedgerDigest: greenTarget.currentLedgerDigest,
  prePromotionImage: greenTarget.prePromotionImage, prePromotionImageDigest: greenTarget.prePromotionImageDigest,
  sealedApiContainer: greenTarget.sealedApiContainer,
  retainedSealed: greenTarget.retainedSealed.map((descriptor) => ({ ...descriptor })),
};
targetManifest.targetDigest = normalizedGreenTargetDigest(targetManifest);

function config(envFile, root) {
  return {
    environment: 'test', envFile,
    envNames: ['NODE_ENV', 'DEPLOYMENT_ENVIRONMENT', 'DATABASE_URL', 'JWT_SECRET', 'PAYMENT_TRANSPORT', 'STRIPE_LIVEMODE', 'MAIL_TRANSPORT', 'PUSH_TRANSPORT', 'IDENTITY_VERIFICATION_TRANSPORT', 'SIT_LISTING_AI_PROVIDER', 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED', 'SIT_STAGING_ACCESS_GATE_ENABLED', 'SIT_STAGING_ALLOWED_USER_IDS', 'SIT_STAGING_GOOGLE_REGISTRATION_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_ENABLED', 'FIREBASE_PHONE_VERIFICATION_ENABLED', 'SIT_STAGING_COMPOSE_PROJECT', 'SIT_LISTING_AI_BUDGET_CENTS', 'ENABLE_STAGING_STRIPE', 'TECHNICAL_SANDBOX_ENABLED', 'TECHNICAL_SANDBOX_KILL_SWITCH', 'TECHNICAL_SANDBOX_ACCOUNT_ID', 'TECHNICAL_SANDBOX_USER_IDS', 'TECHNICAL_SANDBOX_AUTHORIZATION_ID', 'TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT', 'TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT', 'TECHNICAL_SANDBOX_SECRET_KEY_FILE', 'TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE', 'SIT_STAGING_PILOT_ID', 'SYNTHETIC_SANDBOX_PASSWORD_FILE'],
    mfaFile: join(root, 'mfa'), firebaseFile: join(root, 'firebase'),
    technicalSandboxKeyFile: join(root, 'sandbox-key'), technicalSandboxWebhookFile: join(root, 'sandbox-webhook'),
    syntheticUserId: 'synthetic_sandbox_user_pilot_20260919', paymentTransport: 'memory', stripeLiveMode: false,
    mailTransport: 'memory', pushTransport: 'memory', identityTransport: 'memory', listingAiProvider: 'on_device',
    listingAiExternalAllowed: false, listingAiBudgetCents: 0, accessGateDigest: 'b'.repeat(64), providerConfigDigest: 'c'.repeat(64),
    mounts: [
      { source: join(root, 'mfa'), destination: '/run/secrets/mfa-encryption-key', readOnly: true },
      { source: join(root, 'firebase'), destination: '/run/secrets/firebase-service-account.json', readOnly: true },
      { source: join(root, 'sandbox-key'), destination: '/run/secrets/technical-sandbox-key', readOnly: true },
      { source: join(root, 'sandbox-webhook'), destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
      { source: join(root, 'uploads'), destination: '/data/uploads', readOnly: false },
    ],
  };
}

function baselineEnv() {
  return {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test', DATABASE_URL: `postgres://green@${greenTarget.databaseContainer}:5432/${greenTarget.databaseName}`,
    JWT_SECRET: 'redacted-fixture', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', MAIL_TRANSPORT: 'memory', PUSH_TRANSPORT: 'memory',
    IDENTITY_VERIFICATION_TRANSPORT: 'memory', SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0', SIT_LISTING_AI_BUDGET_CENTS: '0',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_ALLOWED_USER_IDS: 'synthetic_sandbox_user_pilot_20260919', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '',
    SMTP_HOST: '', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASSWORD: '', MAIL_FROM: 'ShareItToo Staging <contact@shareittoo.com>', FIREBASE_PROJECT_ID: 'shareittoo-staging',
    FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', FIREBASE_SERVICE_ACCOUNT_FILE: '/run/secrets/firebase-service-account.json', SIT_STAGING_COMPOSE_PROJECT: 'sit-green', ENABLE_STAGING_STRIPE: '0',
    TECHNICAL_SANDBOX_ENABLED: '0', TECHNICAL_SANDBOX_KILL_SWITCH: '1', TECHNICAL_SANDBOX_ACCOUNT_ID: '', TECHNICAL_SANDBOX_USER_IDS: '', TECHNICAL_SANDBOX_AUTHORIZATION_ID: '',
    TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT: '', TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT: '', TECHNICAL_SANDBOX_SECRET_KEY_FILE: '', TECHNICAL_SANDBOX_WEBHOOK_SECRET_FILE: '',
    SIT_STAGING_PILOT_ID: 'heilbronn_wave0', SYNTHETIC_SANDBOX_PASSWORD_FILE: '/docker/shareittoo/staging-secrets/synthetic-sandbox-user-password',
    ...greenBroadPromotionEnvironment, ...greenTechnicalSandboxEnvironment,
  };
}

function envLines(values) { return `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n')}\n`; }

function mountRecords(plan) {
  return [
    { Destination: '/data/uploads', Type: 'volume', Name: plan.target.uploadsVolume, RW: true },
    { Destination: '/run/secrets/firebase-service-account.json', Type: 'bind', Source: plan.config.firebaseFile, RW: false },
    { Destination: '/run/secrets/mfa-encryption-key', Type: 'bind', Source: plan.config.mfaFile, RW: false },
  ];
}

function fakeDocker(plan, options = {}) {
  const sourceEnv = baselineEnv();
  if (options.sourcePushTransport) sourceEnv.PUSH_TRANSPORT = options.sourcePushTransport;
  let sourceName = plan.target.apiContainer;
  let sourceRunning = true;
  let successor = null;
  const calls = [];
  const imageReadback = { Config: { User: 'shareittoo', Labels: { 'org.opencontainers.image.revision': runtimeCommit } }, RepoDigests: [`${plan.runtime.image}@${plan.runtime.digest}`] };
  const sourceRecord = () => ({ Id: sourceId, Name: `/${sourceName}`, State: { Running: sourceRunning }, HostConfig: { GroupAdd: ['65532'], PortBindings: {} }, Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId, ...(options.missingSourceExecutionLabel ? {} : { 'com.shareittoo.green.execution_id': 'green-exec-1' }), }, Env: Object.entries(sourceEnv).map(([name, value]) => `${name}=${value}`) }, NetworkSettings: { Ports: {}, Networks: { [plan.target.network]: { NetworkID: targetNetworkId }, [plan.target.providerNetwork]: { NetworkID: providerNetworkId } } }, Mounts: mountRecords(plan) });
  const successorRecord = () => successor ? ({ Id: successorId, Name: `/${plan.target.apiContainer}`, State: { Running: successor.running }, HostConfig: { GroupAdd: ['65532'], PortBindings: {} }, Config: { Image: `${plan.runtime.image}@${plan.runtime.digest}`, User: 'shareittoo', Labels: { 'com.shareittoo.sit.green': 'true', 'com.shareittoo.sit.green.run_id': plan.target.runId, 'com.shareittoo.green.fcm.execution_id': plan.executionId }, Env: Object.entries({ ...sourceEnv, PUSH_TRANSPORT: 'fcm' }).map(([name, value]) => `${name}=${value}`) }, NetworkSettings: { Ports: {}, Networks: { [plan.target.network]: { NetworkID: targetNetworkId }, ...(successor.provider ? { [plan.target.providerNetwork]: { NetworkID: providerNetworkId } } : {}) } }, Mounts: mountRecords(plan) }) : null;
  const command = async (_command, args, callOptions = {}) => {
    const phase = callOptions.phase ?? 'unknown';
    calls.push({ phase, args });
    if (args[0] === 'inspect') {
      const value = args[1];
      if (value === plan.target.network) return { stdout: JSON.stringify({ Id: targetNetworkId, Name: plan.target.network, Internal: true }) };
      if (value === plan.target.providerNetwork) return { stdout: JSON.stringify({ Id: providerNetworkId, Name: plan.target.providerNetwork, Internal: false }) };
      if (value === plan.target.apiContainer) return { stdout: JSON.stringify(sourceRecord()) };
      if (value === sourceId) return { stdout: JSON.stringify(sourceName === plan.target.apiContainer ? sourceRecord() : { ...sourceRecord(), Name: `/${plan.retainedMemoryName}`, State: { Running: sourceRunning } }) };
      if (value === successorId && successor) return { stdout: JSON.stringify(successorRecord()) };
      if (String(value).includes('@')) return { stdout: JSON.stringify(imageReadback) };
      if (callOptions.allowFailure) return { stdout: '', code: 1 };
      throw new Error(`${phase}_missing`);
    }
    if (args[0] === 'image' && args[1] === 'inspect') return { stdout: JSON.stringify(imageReadback) };
    if (args[0] === 'ps') {
      const name = String(args[3] ?? '').replace(/^name=\^\//u, '').replace(/\$$/u, '');
      if (name === plan.target.apiContainer && sourceName === name) return { stdout: `${sourceId}\n` };
      if (name === plan.target.apiContainer && successor) return { stdout: `${successorId}\n` };
      if (name === plan.retainedMemoryName && sourceName === plan.retainedMemoryName) return { stdout: `${sourceId}\n` };
      return { stdout: '' };
    }
    if (args[0] === 'stop') { sourceRunning = false; return options.lostStop ? { code: 1, stdout: '' } : { stdout: '' }; }
    if (args[0] === 'rename') {
      if (args[1] === sourceId) sourceName = args[2];
      if (args[1] === sourceId && args[2] === plan.target.apiContainer) sourceName = plan.target.apiContainer;
      return options.lostRename ? { code: 1, stdout: '' } : { stdout: '' };
    }
    if (args[0] === 'create') {
      successor = { running: false, provider: false };
      return options.lostCreate ? { code: 1, stdout: '' } : { stdout: `${successorId}\n` };
    }
    if (args[0] === 'network' && args[1] === 'connect') { successor.provider = true; return { stdout: '' }; }
    if (args[0] === 'start') { successor ? successor.running = true : sourceRunning = true; return options.lostStart ? { code: 1, stdout: '' } : { stdout: '' }; }
    if (args[0] === 'rm') { successor = null; return { stdout: '' }; }
    if (args[0] === 'curl' || _command === 'curl') {
      const suffix = String(args.at(-1));
      if (suffix.endsWith('/version')) return { stdout: JSON.stringify({ commit: runtimeCommit, environment: 'test' }) };
      return { stdout: JSON.stringify({ checks: { technicalSandbox: { available: false, reason: 'disabled', provider: 'stripe', mode: 'disabled', amountMinor: 100, currency: 'EUR', maxRunsPerUser24h: 3, professionalReview: false, syntheticOnly: true }, identityVerification: { provider: 'memory' }, listingAi: { provider: 'on_device' } } }) };
    }
    throw new Error(`unexpected:${args.join(' ')}`);
  };
  return { command, calls, state: () => ({ sourceName, sourceRunning, successor }) };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-green-fcm-activation-'));
  const envFile = join(root, 'green.env');
  const values = baselineEnv();
  await writeFile(envFile, envLines(values), { mode: 0o600 });
  await chmod(envFile, 0o600);
  const cfg = config(envFile, root);
  const plan = buildGreenFcmActivationPlan({ targetManifest, config: cfg, runtimeCommit, runtimeImageDigest: runtimeDigest, opsCommit, executionId: '0123456789abcdef0123456789abcdef' });
  return { root, cfg, plan };
}

function activationOptions(data, overrides = {}) {
  return { execute: true, environment: { GREEN_STAGING_FCM_ACTIVATION_EXECUTE: '1', GREEN_STAGING_FCM_ACTIVATION_CONFIRM: runtimeCommit, GREEN_STAGING_PUBLIC_BASE_URL: 'https://staging.invalid/api' }, assertRuntimeFiles: async () => {}, validateSecret: () => {}, evidenceFile: join(data.root, 'evidence.json'), writeEvidence: async () => ({ persisted: true }), ...overrides };
}

test('FCM activation passes with exact Green topology and readbacks', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan); const result = await runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: docker.command, ...activationOptions(data) });
  assert.equal(result.status, 'executed'); assert.equal(result.evidence.persisted, true); assert.equal(result.retained, true); assert.equal(docker.state().sourceName, data.plan.retainedMemoryName); assert.equal(docker.state().successor.running, true);
  assertGreenFcmRuntimeEnvironment({ ...baselineEnv(), PUSH_TRANSPORT: 'fcm' });
});

test('preflight rejection happens before any mutation', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan); docker.command = async (...args) => { const result = await fakeDocker(data.plan).command(...args); return result; };
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: async () => ({ stdout: JSON.stringify({ Id: targetNetworkId, Name: data.plan.target.network, Internal: false }) }), ...activationOptions(data) }), { code: 'green_fcm_target_network_invalid' });
  assert.equal(docker.calls.length, 0);
});

for (const [name, option] of [['lost rename response', 'lostRename'], ['lost create response', 'lostCreate'], ['lost start response', 'lostStart']]) {
  test(`reconciles ${name}`, async (t) => {
    const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
    const docker = fakeDocker(data.plan, { [option]: true });
    const result = await runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: docker.command, ...activationOptions(data) });
    assert.equal(result.status, 'executed'); assert.equal(docker.state().successor.running, true);
  });
}

test('foreign retained-name collision fails before mutation', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan); const original = docker.command;
  const command = async (binary, args, options) => {
    if (args[0] === 'ps' && String(args[3]).includes(data.plan.retainedMemoryName)) return { stdout: `${'f'.repeat(64)}\n` };
    return original(binary, args, options);
  };
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command, ...activationOptions(data) }), { code: 'green_fcm_foreign_name_collision' });
  assert.equal(docker.calls.some((entry) => entry.phase === 'green_fcm_stop_memory'), false);
});

test('already-FCM source is rejected before memory stop', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan, { sourcePushTransport: 'fcm' });
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: docker.command, ...activationOptions(data) }), { code: 'green_fcm_source_push_transport_invalid' });
  assert.equal(docker.calls.some((entry) => entry.phase === 'green_fcm_stop_memory'), false);
});

test('missing original Green execution label is rejected before memory stop', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan, { missingSourceExecutionLabel: true });
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: docker.command, ...activationOptions(data) }), { code: 'green_fcm_source_execution_label_invalid' });
  assert.equal(docker.calls.some((entry) => entry.phase === 'green_fcm_stop_memory'), false);
});

test('failure cleans successor and restores memory runtime by immutable IDs', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan); const original = docker.command;
  const command = async (binary, args, options) => {
    if (options?.phase === 'green_fcm_ready_readback') return { code: 1, stdout: '' };
    return original(binary, args, options);
  };
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command, ...activationOptions(data) }), (error) => error.rollback?.status === 'restored-memory' && error.cleanup === 'verified');
  assert.equal(docker.state().sourceName, data.plan.target.apiContainer); assert.equal(docker.state().sourceRunning, true); assert.equal(docker.state().successor, null);
});

test('environment parity allows only memory to fcm push delta', () => {
  const source = baselineEnv();
  const successor = { ...source, PUSH_TRANSPORT: 'fcm' };
  assert.equal(assertGreenFcmEnvironmentParity(source, successor), true);
  assert.throws(() => assertGreenFcmEnvironmentParity(source, { ...successor, MAIL_TRANSPORT: 'smtp' }), { code: 'green_fcm_environment_value_drift' });
  const { PUSH_TRANSPORT: _push, ...missingPush } = successor;
  assert.throws(() => assertGreenFcmEnvironmentParity(source, missingPush), { code: 'green_fcm_environment_key_drift' });
});

test('evidence destination is preflighted before Docker mutation', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const evidenceFile = join(data.root, 'occupied.json'); await writeFile(evidenceFile, '{}', { mode: 0o600 });
  const docker = fakeDocker(data.plan);
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: docker.command, ...activationOptions(data, { evidenceFile }) }), { code: 'green_fcm_evidence_path_exists' });
  assert.equal(docker.calls.some((entry) => entry.phase === 'green_fcm_stop_memory'), false);
});

test('evidence persistence failure rolls back the active successor', async (t) => {
  const data = await fixture(); t.after(() => rm(data.root, { recursive: true, force: true }));
  const docker = fakeDocker(data.plan);
  await assert.rejects(runGreenFcmActivation({ plan: data.plan, configFile: data.cfg.envFile, command: docker.command, ...activationOptions(data, { writeEvidence: async () => { throw Object.assign(new Error('evidence-write-failed'), { code: 'evidence_write_failed' }); } }) }), (error) => error.code === 'evidence_write_failed' && error.rollback?.status === 'restored-memory' && error.cleanup === 'verified');
  assert.equal(docker.state().sourceName, data.plan.target.apiContainer); assert.equal(docker.state().sourceRunning, true); assert.equal(docker.state().successor, null);
});

test('command safety rejects name-based deletion and protected sealed target', () => {
  const plan = { target: { sealedApiContainer: 'sealed' } };
  assert.throws(() => assertGreenFcmCommandSafety([{ command: 'docker', args: ['rm', '--force', 'shareittoo-staging-api'] }], plan), { code: 'green_fcm_command_safety_invalid' });
  assert.throws(() => assertGreenFcmCommandSafety([{ command: 'docker', args: ['rename', 'id', 'sealed'] }], plan), { code: 'green_fcm_command_safety_invalid' });
});
