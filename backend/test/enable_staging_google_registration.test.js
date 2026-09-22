import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readRegistrationMapping,
  runStagingGoogleRegistrationEnable,
  sanitizeGoogleRegistrationEnableError,
} from '../ops/enable_staging_google_registration.mjs';

const revision = '0123456789abcdef0123456789abcdef01234567';
const imageDigest = `sha256:${'a'.repeat(64)}`;
const mappingDigest = 'b'.repeat(64);
const userId = 'synthetic_google_registration_user';
const migrationLedgerDigest = 'b31bd8054569f851a4fed0798fb0d8b971282256461e764529564cd14d2e802f';

function envContent({ unrelated = 'preserve-me', registration = false, allowlist = null } = {}) {
  return [
    'NODE_ENV=production', 'DEPLOYMENT_ENVIRONMENT=staging',
    'FIREBASE_AUTH_ENABLED=true', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false',
    'DATABASE_URL=postgres://shareittoo_green:pw@canonical-db:5432/shareittoo_green',
    'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false',
    'SIT_STAGING_ACCESS_GATE_ENABLED=true', `SIT_STAGING_ALLOWED_USER_IDS=${userId}`,
    'SIT_STAGING_COMPOSE_PROJECT=sit-green', `APP_COMMIT=${revision}`, `UNRELATED=${unrelated}`,
    ...(registration ? [`SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=true`] : []),
    ...(allowlist ? [`SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST=${allowlist}`] : []),
    '',
  ].join('\n');
}

function mappingLine() {
  return `${mappingDigest}=${userId}\n`;
}

async function fixture({ apiContainer = 'shareittoo-staging-api', image = `registry.example/shareittoo-api:${revision}`, mapping = mappingLine() } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sit-google-registration-enable-'));
  const envFile = join(root, 'green.env');
  const mappingFile = join(root, 'mapping.txt');
  const evidenceFile = join(root, 'evidence.json');
  const firebase = join(root, 'firebase.json');
  const mfa = join(root, 'mfa.key');
  const technicalKey = join(root, 'technical.key');
  const technicalWebhook = join(root, 'technical.webhook');
  await writeFile(firebase, '{}');
  await writeFile(mfa, 'm'.repeat(32));
  await writeFile(technicalKey, 'k'.repeat(32));
  await writeFile(technicalWebhook, 'w'.repeat(32));
  await writeFile(envFile, envContent(), { mode: 0o600 });
  await chmod(envFile, 0o600);
  await writeFile(mappingFile, mapping, { mode: 0o600 });
  await chmod(mappingFile, 0o600);
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  const manifest = {
    kind: 'sit-staging-google-auth-runtime-manifest', schemaVersion: 1,
    environment: 'staging', composeProject: 'sit-green', apiContainer,
    databaseContainer: 'sit-green-postgres-20260918011528-wp254',
    databaseVolume: 'sit-green-volume-20260918011528-wp254', databaseName: 'shareittoo_green', databaseUser: 'shareittoo_green',
    network: 'sit-green-network-20260918011528-wp254', providerNetwork: 'sit-staging-provider-egress',
    uploadsVolume: 'sit-green-uploads-20260918011528-wp254', image, runtimeRevision: revision, imageDigest,
    envFile, envUid: uid, envGid: gid,
    mounts: [
      { type: 'bind', name: 'mfa', source: mfa, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
      { type: 'bind', name: 'firebase', source: firebase, destination: '/run/secrets/firebase-service-account.json', readOnly: true },
      { type: 'bind', name: 'technical-key', source: technicalKey, destination: '/run/secrets/technical-sandbox-key', readOnly: true },
      { type: 'bind', name: 'technical-webhook', source: technicalWebhook, destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
      { type: 'volume', name: 'sit-green-uploads-20260918011528-wp254', source: join(root, 'uploads'), destination: '/data/uploads', readOnly: false },
    ],
    safetyEnv: {
      DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
      PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    },
    label: { key: 'com.shareittoo.sit.green', value: 'true' },
  };
  const api = {
    Name: `/${apiContainer}`, State: { Running: true }, Config: {
      Image: image, Env: envContent().trim().split('\n'), Cmd: ['node', 'src/server.js'], Entrypoint: null,
      WorkingDir: '/app', User: 'shareittoo', Tty: false, OpenStdin: false,
      Labels: { 'com.shareittoo.sit.green': 'true' },
    },
    HostConfig: { GroupAdd: ['65532'], RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, PortBindings: {}, NetworkMode: manifest.network },
    Mounts: manifest.mounts.map((mount) => ({ Type: mount.type, Name: mount.type === 'volume' ? mount.name : null, Source: mount.source, Destination: mount.destination, RW: !mount.readOnly })),
    NetworkSettings: { Ports: {}, Networks: { [manifest.network]: {}, [manifest.providerNetwork]: {} } },
  };
  return { root, envFile, mappingFile, evidenceFile, manifest, api, image, state: { api, stopped: false, sealed: false, created: false, failurePhase: null } };
}

function startupPayload(fx, enabled) {
  return JSON.stringify({
    ok: true, attempts: { live: 1, ready: 1 }, last: { live: { status: 200 }, ready: { status: 200 } },
    version: { status: 200, commit: revision, environment: 'staging' },
    flags: {
      DEPLOYMENT_ENVIRONMENT: 'staging', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false',
      PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    },
  });
}

function fakeCommand(fx, { mutateUnrelated = false, falsePass = false, failAt = null, wrongSchema = false, wrongImage = false, driftHealth = false, driftMemory = false, driftMaskedPaths = false, stopAfterSideEffect = false } = {}) {
  const db = { Name: `/${fx.manifest.databaseContainer}`, State: { Running: true }, Config: { Image: `postgres:16-alpine@sha256:${'c'.repeat(64)}`, Env: ['POSTGRES_DB=shareittoo_green', 'POSTGRES_USER=shareittoo_green'] } };
  const volume = { Name: fx.manifest.databaseVolume };
  const network = { Name: fx.manifest.network, Internal: true };
  const providerNetwork = { Name: fx.manifest.providerNetwork };
  const uploads = { Name: fx.manifest.uploadsVolume };
  const image = { RepoTags: [fx.image], Config: { User: 'shareittoo', Labels: { 'org.opencontainers.image.revision': revision } }, RepoDigests: [`${fx.image}@${imageDigest}`] };
  const calls = [];
  const command = async (_cmd, args, options = {}) => {
    const phase = options.phase;
    calls.push({ phase, args });
    if (failAt === phase) throw Object.assign(new Error(`${phase}_failed`), { code: `${phase}_failed`, failurePhase: phase });
    const json = (value) => ({ stdout: JSON.stringify(value), code: 0 });
    if (phase === 'current_api_inspect' || phase === 'replacement_config_readback' || phase === 'rollback_api_readback' || phase === 'rollback_original_readback') {
      if (phase === 'replacement_config_readback') {
        const cloned = structuredClone(fx.state.api);
        cloned.Config.Image = `${fx.image}@${imageDigest}`;
        cloned.Config.Env = envContent({ registration: true, allowlist: `${mappingDigest}=${userId}` }).trim().split('\n');
        if (driftHealth) cloned.Config.Healthcheck = { Test: ['CMD-SHELL', 'false'], Interval: 1, Timeout: 1, Retries: 1, StartPeriod: 1, StartInterval: 1 };
        if (driftMemory) cloned.HostConfig.Memory = 99;
        if (driftMaskedPaths) cloned.HostConfig.MaskedPaths = ['/proc/drifted'];
        return json(cloned);
      }
      return json(fx.state.api);
    }
    if (phase === 'current_database_inspect') return json(db);
    if (phase === 'current_database_volume_inspect') return json(volume);
    if (phase === 'current_network_inspect') return json(network);
    if (phase === 'current_provider_network_inspect') return json(providerNetwork);
    if (phase === 'current_uploads_volume_inspect') return json(uploads);
    if (phase === 'current_image_inspect') return json(wrongImage ? { ...image, RepoTags: [`${fx.image}-drift`] } : image);
    if (phase === 'sealed_name_conflict_check') return { stdout: '', code: 0 };
    if (phase === 'current_database_probe') return { stdout: '1\n', code: 0 };
    if (phase === 'current_schema_migration_readback' || phase === 'replacement_schema_readback') return { stdout: `${wrongSchema ? '094_apple_refresh_material_only.up.sql' : '095_staging_google_registration_replays.up.sql'}\n`, code: 0 };
    if (phase === 'current_migration_ledger_readback' || phase === 'replacement_migration_ledger_readback') return { stdout: `${migrationLedgerDigest}\n`, code: 0 };
    if (phase === 'current_live_probe' || phase === 'current_ready_probe') return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }), code: 0 };
    if (phase === 'current_version_probe') return { stdout: JSON.stringify({ commit: revision, environment: 'staging' }), code: 0 };
    if (phase === 'current_runtime_flags') return { stdout: JSON.stringify({ DEPLOYMENT_ENVIRONMENT: 'staging', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_STAGING_ACCESS_GATE_ENABLED: 'true', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: false, SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: 'absent' }), code: 0 };
    if (phase === 'current_registration_config_probe') {
      if (mutateUnrelated) await writeFile(fx.envFile, envContent({ unrelated: 'changed-after-preflight' }), { mode: 0o600 });
      return { stdout: JSON.stringify({ enabled: false, allowlist: 'absent', allowlistDigest: crypto.createHash('sha256').update('').digest('hex'), allowlistEntryCount: 0, accessGateEnabled: true }), code: 0 };
    }
    if (phase === 'replacement_public_runtime_probe' || phase === 'rollback_public_runtime_probe') return { stdout: startupPayload(fx, phase === 'replacement_public_runtime_probe' && !falsePass), code: 0 };
    if (phase === 'replacement_registration_config_readback') {
      const enabled = !falsePass;
      const raw = enabled ? `${mappingDigest}=${userId}` : '';
      return { stdout: JSON.stringify({ enabled, allowlist: enabled ? 'present' : 'absent', allowlistDigest: crypto.createHash('sha256').update(raw).digest('hex'), allowlistEntryCount: enabled ? 1 : 0, accessGateEnabled: true }), code: 0 };
    }
    if (phase === 'rollback_replacement_verify') return { stdout: '', code: 0 };
    if (phase === 'rollback_replacement_remove' || phase === 'rollback_restore_rename') return { stdout: '', code: 0 };
    if (phase === 'rollback_restore_start' || phase === 'rollback_original_start') { fx.state.api.State.Running = true; return { stdout: '', code: 0 }; }
    if (phase === 'rollback_public_runtime_probe') return { stdout: startupPayload(fx, false), code: 0 };
    if (phase === 'stop_current_api') {
      if (stopAfterSideEffect) { fx.state.api.State.Running = false; throw Object.assign(new Error('stop_response_lost'), { code: 'stop_response_lost', failurePhase: phase }); }
      if (failAt === phase) throw Object.assign(new Error(`${phase}_failed`), { code: `${phase}_failed`, failurePhase: phase });
      fx.state.stopped = true; return { stdout: '', code: 0 };
    }
    if (phase === 'stop_state_readback') return json(fx.state.api);
    if (phase === 'seal_current_api') { fx.state.sealed = true; return { stdout: '', code: 0 }; }
    if (phase === 'create_replacement_api') { fx.state.created = true; return { stdout: '', code: 0 }; }
    if (phase === 'attach_provider_network' || phase === 'replacement_registration_config_readback') return { stdout: '', code: 0 };
    if (phase === 'start_replacement_api') return { stdout: '', code: 0 };
    return { stdout: '', code: 0 };
  };
  return { command, calls };
}

test('default-off preflight validates schema 95 and does not mutate or expose mapping', async () => {
  const fx = await fixture();
  try {
    const fake = fakeCommand(fx);
    const result = await runStagingGoogleRegistrationEnable({ manifest: fx.manifest, mappingFile: fx.mappingFile, command: fake.command });
    assert.equal(result.status, 'preflight-passed-no-mutation');
    assert.equal(await readFile(fx.envFile, 'utf8'), envContent());
    assert.equal(JSON.stringify(result).includes(mappingLine()), false);
    assert.ok(fake.calls.some((call) => call.phase === 'current_migration_ledger_readback'));
    assert.equal(fake.calls.some((call) => call.phase === 'stop_current_api'), false);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('successful execution changes only registration flags and writes digest-only evidence', async () => {
  const fx = await fixture();
  try {
    const fake = fakeCommand(fx);
    const result = await runStagingGoogleRegistrationEnable({
      manifest: fx.manifest, mappingFile: fx.mappingFile, evidenceFile: fx.evidenceFile,
      command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true,
    });
    assert.equal(result.status, 'enabled-awaiting-live-google-token-gate');
    const env = await readFile(fx.envFile, 'utf8');
    assert.match(env, /SIT_STAGING_GOOGLE_REGISTRATION_ENABLED=true/u);
    assert.match(env, new RegExp(`SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST=${mappingDigest}=${userId}`));
    assert.match(env, /UNRELATED=preserve-me/u);
    const evidence = JSON.parse(await readFile(fx.evidenceFile, 'utf8'));
    assert.equal(evidence.mappingDigest, crypto.createHash('sha256').update(mappingLine().trimEnd()).digest('hex'));
    assert.equal(evidence.targetUserIdDigest, crypto.createHash('sha256').update(userId).digest('hex'));
    assert.equal(JSON.stringify(evidence).includes(userId), false);
    assert.equal(JSON.stringify(evidence).includes(mappingLine()), false);
    assert.equal(fake.calls.some((call) => call.args?.includes('--publish') || call.args?.includes('-p')), false);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('failure after recreate restores the prior env and container deterministically', async () => {
  const fx = await fixture();
  try {
    const fake = fakeCommand(fx, { failAt: 'replacement_public_runtime_probe' });
    await assert.rejects(runStagingGoogleRegistrationEnable({
      manifest: fx.manifest, mappingFile: fx.mappingFile, evidenceFile: fx.evidenceFile,
      command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true,
    }), (error) => {
      assert.equal(error.code, 'replacement_public_runtime_probe_failed');
      assert.equal(error.rollback.restored, true);
      return true;
    });
    assert.equal(await readFile(fx.envFile, 'utf8'), envContent());
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('negative private mapping and target checks fail closed', async () => {
  const cases = [
    { name: 'multiple mappings', mapping: `${mappingLine()}${'c'.repeat(64)}=second-user\n`, code: 'mapping_plaintext_or_shape_invalid' },
    { name: 'plaintext-shaped', mapping: `email@example.invalid=${userId}\n`, code: 'mapping_plaintext_or_shape_invalid' },
    { name: 'uid-shaped', mapping: `${mappingDigest}=uid_123\n`, code: 'mapping_plaintext_or_shape_invalid' },
  ];
  for (const entry of cases) {
    const fx = await fixture({ mapping: entry.mapping });
    try { assert.throws(() => readRegistrationMapping(fx.mappingFile), new RegExp(entry.code)); }
    finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const fx = await fixture();
  try {
    const content = await readFile(fx.envFile, 'utf8');
    await writeFile(fx.envFile, content.replace(`SIT_STAGING_ALLOWED_USER_IDS=${userId}`, 'SIT_STAGING_ALLOWED_USER_IDS=other-user'), { mode: 0o600 });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: fx.manifest, mappingFile: fx.mappingFile, command: fakeCommand(fx).command }), /mapping_target_not_access_allowed/u);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('wrong target, mode, symlink, changed unrelated byte, and false PASS all fail closed', async () => {
  const badManifest = await fixture({ apiContainer: 'wrong-api' });
  try { await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: badManifest.manifest, mappingFile: badManifest.mappingFile, command: fakeCommand(badManifest).command }), /target_not_staging_green/u); }
  finally { await rm(badManifest.root, { recursive: true, force: true }); }

  const mode = await fixture();
  try { await chmod(mode.mappingFile, 0o640); assert.throws(() => readRegistrationMapping(mode.mappingFile), /mapping_metadata_invalid/u); }
  finally { await rm(mode.root, { recursive: true, force: true }); }

  const link = await fixture();
  try { const linkPath = join(link.root, 'mapping-link'); await symlink(link.mappingFile, linkPath); assert.throws(() => readRegistrationMapping(linkPath), /mapping_symlink_forbidden/u); }
  finally { await rm(link.root, { recursive: true, force: true }); }

  const changed = await fixture();
  try {
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: changed.manifest, mappingFile: changed.mappingFile, evidenceFile: changed.evidenceFile, command: fakeCommand(changed, { mutateUnrelated: true }).command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /env_changed_since_preflight/u);
    assert.equal(await readFile(changed.envFile, 'utf8'), envContent({ unrelated: 'changed-after-preflight' }));
  }
  finally { await rm(changed.root, { recursive: true, force: true }); }

  const falsePass = await fixture();
  try {
    const fake = fakeCommand(falsePass, { falsePass: true });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: falsePass.manifest, mappingFile: falsePass.mappingFile, evidenceFile: falsePass.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /registration_config_readback_invalid/u);
    assert.equal(await readFile(falsePass.envFile, 'utf8'), envContent());
  } finally { await rm(falsePass.root, { recursive: true, force: true }); }
});

test('wrong schema or image and stop/rename interruption never produce a false PASS', async () => {
  const schema = await fixture();
  try { await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: schema.manifest, mappingFile: schema.mappingFile, command: fakeCommand(schema, { wrongSchema: true }).command }), /current_schema_migration_readback_invalid/u); }
  finally { await rm(schema.root, { recursive: true, force: true }); }

  const image = await fixture();
  try { await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: image.manifest, mappingFile: image.mappingFile, command: fakeCommand(image, { wrongImage: true }).command }), /image_readback_invalid/u); }
  finally { await rm(image.root, { recursive: true, force: true }); }

  const rename = await fixture();
  try {
    const fake = fakeCommand(rename, { failAt: 'seal_current_api' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: rename.manifest, mappingFile: rename.mappingFile, evidenceFile: rename.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'seal_current_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(error.rollback.results.some((entry) => entry.phase === 'rollback_original_start' && entry.ok));
      return true;
    });
  } finally { await rm(rename.root, { recursive: true, force: true }); }

  const create = await fixture();
  try {
    const fake = fakeCommand(create, { failAt: 'create_replacement_api' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: create.manifest, mappingFile: create.mappingFile, evidenceFile: create.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'create_replacement_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(error.rollback.results.some((entry) => entry.phase === 'rollback_api_readback' && entry.ok));
      return true;
    });
  } finally { await rm(create.root, { recursive: true, force: true }); }

  const evidence = await fixture();
  try {
    await writeFile(evidence.evidenceFile, '{"existing":true}\n', { mode: 0o600 });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: evidence.manifest, mappingFile: evidence.mappingFile, evidenceFile: evidence.evidenceFile, command: fakeCommand(evidence).command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /evidence_already_exists/u);
    assert.equal(await readFile(evidence.envFile, 'utf8'), envContent());
  } finally { await rm(evidence.root, { recursive: true, force: true }); }

  const unsafeParent = await fixture();
  try {
    const directory = join(unsafeParent.root, 'unsafe-evidence-parent');
    await mkdir(directory, { mode: 0o755 });
    unsafeParent.evidenceFile = join(directory, 'evidence.json');
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: unsafeParent.manifest, mappingFile: unsafeParent.mappingFile, evidenceFile: unsafeParent.evidenceFile, command: fakeCommand(unsafeParent).command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /evidence_parent_unsafe/u);
    assert.equal(await readFile(unsafeParent.envFile, 'utf8'), envContent());
  } finally { await rm(unsafeParent.root, { recursive: true, force: true }); }
});

test('stop fail-before and response-loss-after-stop are recovered from real state readback', async () => {
  const failBefore = await fixture();
  try {
    const fake = fakeCommand(failBefore, { failAt: 'stop_current_api' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: failBefore.manifest, mappingFile: failBefore.mappingFile, evidenceFile: failBefore.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'stop_current_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(fake.calls.some((call) => call.phase === 'stop_state_readback'));
      return true;
    });
    assert.equal(failBefore.state.api.State.Running, true);
  } finally { await rm(failBefore.root, { recursive: true, force: true }); }

  const responseLoss = await fixture();
  try {
    const fake = fakeCommand(responseLoss, { stopAfterSideEffect: true, failAt: 'create_replacement_api' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: responseLoss.manifest, mappingFile: responseLoss.mappingFile, evidenceFile: responseLoss.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'create_replacement_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(error.rollback.results.some((entry) => entry.phase === 'rollback_api_readback' && entry.ok));
      return true;
    });
    assert.equal(responseLoss.state.api.State.Running, true);
    assert.ok(fake.calls.some((call) => call.phase === 'stop_state_readback'));
  } finally { await rm(responseLoss.root, { recursive: true, force: true }); }
});

test('resource and env ownership drift fail closed without overwriting concurrent bytes', async () => {
  for (const option of [{ driftHealth: true }, { driftMemory: true }, { driftMaskedPaths: true }]) {
    const fx = await fixture();
    try {
      const fake = fakeCommand(fx, option);
      await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: fx.manifest, mappingFile: fx.mappingFile, evidenceFile: fx.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /replacement_config_drift/u);
      assert.equal(await readFile(fx.envFile, 'utf8'), envContent());
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const owner = await fixture();
  try {
    owner.manifest.envUid = (process.getuid?.() ?? 0) + 1;
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: owner.manifest, mappingFile: owner.mappingFile, command: fakeCommand(owner).command }), /env_file_metadata_invalid/u);
  } finally { await rm(owner.root, { recursive: true, force: true }); }
});

test('sanitized failure output contains no mapping material', () => {
  const output = sanitizeGoogleRegistrationEnableError({ code: 'registration_config_readback_invalid', rollback: { restored: false, results: [{ phase: 'rollback_env_restore', ok: false, code: 'env_restore_failed', secret: mappingLine() }] } });
  assert.deepEqual(output, { status: 'failed', code: 'registration_config_readback_invalid', rollback: { restored: false, results: [{ phase: 'rollback_env_restore', ok: false, code: 'env_restore_failed' }] } });
  assert.equal(JSON.stringify(output).includes(mappingLine()), false);
});
