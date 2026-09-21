import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertGoogleAuthRuntimeManifest,
  buildGoogleAuthPreflightCommands,
  buildReplacementCreateArgs,
  readGoogleAuthRuntimeManifest,
  runGoogleAuthActivation,
  setActivationFlags,
} from '../ops/activate_staging_google_auth.mjs';

const revision = '0123456789abcdef0123456789abcdef01234567';
const digest = 'sha256:' + 'a'.repeat(64);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'sit-google-auth-'));
  const envFile = join(root, 'green.env');
  const firebase = join(root, 'firebase.json');
  const mfa = join(root, 'mfa.key');
  const technicalKey = join(root, 'technical.key');
  const technicalWebhook = join(root, 'technical.webhook');
  await writeFile(firebase, '{}');
  await writeFile(mfa, 'm'.repeat(32));
  await writeFile(technicalKey, 'k'.repeat(32));
  await writeFile(technicalWebhook, 'w'.repeat(32));
  const env = [
    'NODE_ENV=production', 'DEPLOYMENT_ENVIRONMENT=test',
    'FIREBASE_AUTH_ENABLED=false', 'FIREBASE_PHONE_VERIFICATION_ENABLED=false',
    'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false',
    'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED=0',
    `APP_COMMIT=${revision}`, 'UNRELATED=preserve-me', '',
  ].join('\n');
  await writeFile(envFile, env, { mode: 0o600 });
  await chmod(envFile, 0o600);
  const uid = process.getuid?.() ?? 0;
  const gid = process.getgid?.() ?? 0;
  const image = `registry.example/shareittoo-api:${revision}`;
  const network = 'sit-green-internal';
  const providerNetwork = 'sit-green-provider';
  const mounts = [
    { type: 'bind', name: 'mfa', source: mfa, destination: '/run/secrets/mfa-encryption-key', readOnly: true },
    { type: 'bind', name: 'firebase', source: firebase, destination: '/run/secrets/firebase-service-account.json', readOnly: true },
    { type: 'bind', name: 'technical-key', source: technicalKey, destination: '/run/secrets/technical-sandbox-key', readOnly: true },
    { type: 'bind', name: 'technical-webhook', source: technicalWebhook, destination: '/run/secrets/technical-sandbox-webhook', readOnly: true },
    { type: 'volume', name: 'sit-green-uploads-20260918011528-wp254', source: join(root, 'uploads'), destination: '/data/uploads', readOnly: false },
  ];
  const safetyEnv = {
    DEPLOYMENT_ENVIRONMENT: 'test', FIREBASE_AUTH_ENABLED: 'false',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
  };
  const manifest = {
    kind: 'sit-staging-google-auth-runtime-manifest', schemaVersion: 1,
    environment: 'staging', composeProject: 'sit-green', apiContainer: 'shareittoo-staging-api',
    databaseContainer: 'sit-green-postgres-20260918011528-wp254',
    databaseVolume: 'sit-green-volume-20260918011528-wp254',
    databaseName: 'shareittoo_green', databaseUser: 'shareittoo_green',
    network: 'sit-green-network-20260918011528-wp254', providerNetwork: 'sit-staging-provider-egress',
    uploadsVolume: 'sit-green-uploads-20260918011528-wp254', image, runtimeRevision: revision,
    imageDigest: digest, envFile, envUid: uid, envGid: gid, mounts, safetyEnv,
    label: { key: 'com.shareittoo.sit.green', value: 'true' },
  };
  const apiEnv = env.trim().split('\n');
  const api = {
    Name: '/shareittoo-staging-api', State: { Running: true }, Config: {
      Image: image, Env: apiEnv, Cmd: ['node', 'src/server.js'], Entrypoint: null,
      WorkingDir: '/app', User: 'shareittoo', Tty: false, OpenStdin: false,
      Labels: { 'com.shareittoo.sit.green': 'true' },
    }, HostConfig: { GroupAdd: ['65532'], RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, PortBindings: {} },
    Mounts: mounts.map((m) => ({ Type: m.type, Name: m.type === 'volume' ? m.name : null, Source: m.source, Destination: m.destination, RW: !m.readOnly })),
    NetworkSettings: { Ports: {}, Networks: { [manifest.network]: {}, [manifest.providerNetwork]: {} } },
  };
  return { root, envFile, env, manifest, api, image, network: manifest.network, providerNetwork: manifest.providerNetwork };
}

function fakeCommand(fx) {
  const calls = [];
  const db = { Name: `/${fx.manifest.databaseContainer}`, State: { Running: true } };
  const databaseVolume = { Name: fx.manifest.databaseVolume };
  const network = { Name: fx.network, Internal: true };
  const providerNetwork = { Name: fx.providerNetwork };
  const uploads = { Name: fx.manifest.uploadsVolume };
  const image = { Config: { User: 'shareittoo', Labels: { 'org.opencontainers.image.revision': revision } }, RepoDigests: [`${fx.image}@${digest}`] };
  return {
    calls,
    command: async (_cmd, args, { phase }) => {
      calls.push({ phase, args });
      const json = (value) => ({ stdout: JSON.stringify(value) });
      if (phase === 'current_api_inspect') return json(fx.api);
      if (phase === 'current_database_inspect') return json(db);
      if (phase === 'current_database_volume_inspect') return json(databaseVolume);
      if (phase === 'current_network_inspect') return json(network);
      if (phase === 'current_provider_network_inspect') return json(providerNetwork);
      if (phase === 'current_uploads_volume_inspect') return json(uploads);
      if (phase === 'current_image_inspect') return json(image);
      if (phase === 'current_database_probe') return { stdout: '1' };
      if (phase === 'current_config_import_probe') return { stdout: JSON.stringify({ auth: true, mfa: true, project: true, environment: 'staging' }) };
      if (phase === 'current_live_probe' || phase === 'current_ready_probe') return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }) };
      if (phase === 'current_version_probe') return { stdout: JSON.stringify({ commit: revision, environment: 'test' }) };
      if (phase === 'current_runtime_flags') return { stdout: JSON.stringify(fx.manifest.safetyEnv) };
      throw new Error(`unexpected phase ${phase}`);
    },
  };
}

function statefulExecutor(fx, { failPhase, failRollbackPhase, driftReplacement = false } = {}) {
  const base = fakeCommand(fx);
  const calls = base.calls;
  let replacement;
  let replacementExists = false;
  let sealed = false;
  const command = async (_cmd, args, options) => {
    const { phase } = options;
    calls.push({ phase, args });
    if (phase === failPhase) throw new Error(`synthetic_${phase}`);
    if (phase === failRollbackPhase) return { stdout: '', code: 1 };
    if (phase === 'stop_current_api') return { stdout: '', code: 0 };
    if (phase === 'seal_current_api') { sealed = true; return { stdout: '', code: 0 }; }
    if (phase === 'create_replacement_api') {
      replacement = structuredClone(fx.api);
      if (driftReplacement) replacement.Config.WorkingDir = '/drifted';
      replacement.Config.Env = replacement.Config.Env.map((entry) => entry.startsWith('FIREBASE_AUTH_ENABLED=') ? 'FIREBASE_AUTH_ENABLED=true' : entry.startsWith('DEPLOYMENT_ENVIRONMENT=') ? 'DEPLOYMENT_ENVIRONMENT=staging' : entry);
      replacementExists = true;
      return { stdout: 'replacement-created' };
    }
    if (phase === 'replacement_config_readback') return { stdout: JSON.stringify(replacement) };
    if (phase === 'replacement_runtime_flags') return { stdout: JSON.stringify({ ...fx.manifest.safetyEnv, FIREBASE_AUTH_ENABLED: 'true', DEPLOYMENT_ENVIRONMENT: 'staging' }) };
    if (phase === 'replacement_version_probe') return { stdout: JSON.stringify({ commit: revision, environment: 'staging' }) };
    if (phase === 'replacement_invalid_social_token_probe') return { stdout: JSON.stringify({ status: 401, code: 'invalid_social_token' }) };
    if (phase === 'replacement_live_probe' || phase === 'replacement_ready_probe') return { stdout: '' };
    if (phase === 'replacement_database_probe') return { stdout: '1' };
    if (phase === 'rollback_replacement_remove') { replacementExists = false; return { stdout: '', code: 0 }; }
    if (phase === 'rollback_replacement_verify') return { stdout: replacementExists ? `${fx.manifest.apiContainer}\n` : '', code: 0 };
    if (phase === 'rollback_restore_rename') { if (!sealed) return { stdout: '', code: 1 }; sealed = false; return { stdout: '', code: 0 }; }
    if (phase === 'rollback_api_readback') return { stdout: JSON.stringify(fx.api), code: 0 };
    if (phase === 'rollback_live_probe' || phase === 'rollback_ready_probe') return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }), code: 0 };
    if (phase === 'rollback_version_probe') return { stdout: JSON.stringify({ commit: revision, environment: 'test' }), code: 0 };
    if (phase === 'rollback_runtime_flags') return { stdout: JSON.stringify(fx.manifest.safetyEnv), code: 0 };
    if (phase === 'rollback_database_probe') return { stdout: '1', code: 0 };
    if (phase.startsWith('rollback_') || ['stop_current_api', 'seal_current_api', 'attach_provider_network', 'start_replacement_api'].includes(phase)) return { stdout: '', code: 0 };
    return base.command(_cmd, args, options);
  };
  return { command, calls };
}

test('production-shaped preflight reaches the irreversible boundary without mutation', async () => {
  const fx = await fixture();
  try {
    const fake = fakeCommand(fx);
    const result = await runGoogleAuthActivation({ manifest: fx.manifest, command: fake.command, execute: false });
    assert.equal(result.status, 'preflight-passed-no-mutation');
    assert.equal(result.firstIrreversiblePhase, 'atomic_env_enable');
    assert.deepEqual(await readFile(fx.envFile, 'utf8'), fx.env);
    assert.deepEqual(fake.calls.map((call) => call.phase), buildGoogleAuthPreflightCommands(fx.manifest).map((entry) => entry.phase));
    assert.equal(fake.calls.at(-1).phase, 'current_config_import_probe');
    const dbProbe = fake.calls.find((call) => call.phase === 'current_database_probe');
    assert.ok(dbProbe.args.includes('-U') && dbProbe.args.includes(fx.manifest.databaseUser));
    assert.ok(dbProbe.args.includes('-d') && dbProbe.args.includes(fx.manifest.databaseName));
    assert.equal(fake.calls.some((call) => ['stop_current_api', 'seal_current_api', 'create_replacement_api', 'start_replacement_api'].includes(call.phase)), false);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('manifest reader enforces external private file, mode and JSON shape', async () => {
  const fx = await fixture();
  const manifestPath = join(fx.root, 'runtime-manifest.json');
  const symlinkPath = join(fx.root, 'runtime-manifest-link.json');
  try {
    await writeFile(manifestPath, JSON.stringify(fx.manifest), { mode: 0o600 });
    await chmod(manifestPath, 0o600);
    assert.equal((await readGoogleAuthRuntimeManifest(manifestPath)).kind, fx.manifest.kind);
    await writeFile(manifestPath, '{bad', { mode: 0o600 });
    await assert.rejects(readGoogleAuthRuntimeManifest(manifestPath), SyntaxError);
    await writeFile(manifestPath, JSON.stringify(fx.manifest), { mode: 0o600 });
    await symlink(manifestPath, symlinkPath);
    await assert.rejects(readGoogleAuthRuntimeManifest(symlinkPath), /manifest_symlink_forbidden/);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('replacement command is immutable, exact-network, exact-mount and host-port free', async () => {
  const fx = await fixture();
  try {
    const args = buildReplacementCreateArgs({ manifest: fx.manifest, envFile: fx.envFile, currentApi: fx.api });
    assert.ok(args.includes('--env-file') && args.includes(fx.envFile));
    assert.ok(args.includes('--network') && args.includes(fx.network));
    assert.ok(args.includes(fx.image));
    assert.equal(args.includes('--publish') || args.includes('-p'), false);
    assert.ok(args.some((arg) => arg.includes('/run/secrets/firebase-service-account.json')));
    assert.ok(args.some((arg) => arg.includes('/data/uploads')));
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('atomic auth transition preserves unrelated bytes and private-file metadata', async () => {
  const fx = await fixture();
  try {
    await setActivationFlags(fx.manifest, fx.env);
    const enabled = await readFile(fx.envFile, 'utf8');
    assert.equal(enabled.replace('FIREBASE_AUTH_ENABLED=true', 'FIREBASE_AUTH_ENABLED=false').replace('DEPLOYMENT_ENVIRONMENT=staging', 'DEPLOYMENT_ENVIRONMENT=test'), fx.env);
    assert.equal((await lstat(fx.envFile)).mode & 0o777, 0o600);
    await setActivationFlags(fx.manifest, enabled, { auth: 'false', environment: 'test' });
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.env);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('full executor success keeps rollback container for final device smoke', async () => {
  const fx = await fixture();
  try {
    const executor = statefulExecutor(fx);
    const result = await runGoogleAuthActivation({
      manifest: fx.manifest,
      command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
      execute: true,
    });
    assert.equal(result.status, 'activated-awaiting-device-smoke');
    assert.equal(result.requiresFinalDeviceSmoke, true);
    assert.equal(executor.calls.some((call) => call.phase === 'remove_rollback_container'), false);
    assert.match(await readFile(fx.envFile, 'utf8'), /FIREBASE_AUTH_ENABLED=true/);
    assert.ok(executor.calls.some((call) => call.phase === 'replacement_invalid_social_token_probe'));
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('executor failure restores env and sealed container', async () => {
  const fx = await fixture();
  try {
    const executor = statefulExecutor(fx, { failPhase: 'replacement_ready_probe' });
    await assert.rejects(
      runGoogleAuthActivation({
        manifest: fx.manifest,
        command: executor.command,
        commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
        execute: true,
      }),
      (error) => error.rollback?.restored === true,
    );
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.env);
    assert.ok(executor.calls.some((call) => call.phase === 'rollback_restore_rename'));
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('all irreversible-phase failures are surfaced and never falsely restored', async () => {
  for (const failPhase of ['stop_current_api', 'seal_current_api', 'create_replacement_api', 'start_replacement_api', 'replacement_ready_probe']) {
    const fx = await fixture();
    try {
      const executor = statefulExecutor(fx, { failPhase });
      await assert.rejects(runGoogleAuthActivation({
        manifest: fx.manifest, command: executor.command,
        commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true,
      }), (error) => error.rollback?.restored === (failPhase === 'create_replacement_api' || failPhase === 'start_replacement_api' || failPhase === 'replacement_ready_probe'));
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const fx = await fixture();
  try {
    const executor = statefulExecutor(fx, { failPhase: 'replacement_ready_probe', failRollbackPhase: 'rollback_restore_rename' });
    await assert.rejects(runGoogleAuthActivation({
      manifest: fx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true,
    }), (error) => error.rollback?.restored === false && error.rollback.results.some((entry) => entry.phase === 'rollback_restore_rename' && entry.ok === false));
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('manifest and safety gates reject production or enabled-phone drift', async () => {
  const fx = await fixture();
  try {
    assert.throws(() => assertGoogleAuthRuntimeManifest({ ...fx.manifest, network: 'production-network' }), /exact_green_network_invalid/);
    const bad = { ...fx.manifest, safetyEnv: { ...fx.manifest.safetyEnv, FIREBASE_PHONE_VERIFICATION_ENABLED: 'true' } };
    assert.throws(() => assertGoogleAuthRuntimeManifest(bad), /safety_env_firebase_phone_verification_enabled_invalid/);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('negative inventory and replacement-config complements fail closed', async () => {
  for (const mutate of [
    (api) => { api.NetworkSettings.Networks.extra = {}; },
    (api) => { api.Mounts.push({ Type: 'bind', Name: null, Source: '/tmp/extra', Destination: '/extra', RW: false }); },
    (api) => { api.NetworkSettings.Ports = { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18080' }] }; },
  ]) {
    const fx = await fixture();
    try {
      mutate(fx.api);
      await assert.rejects(runGoogleAuthActivation({ manifest: fx.manifest, command: fakeCommand(fx).command, execute: false }), /api_(network|mount|runtime)_inventory_invalid/);
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const fx = await fixture();
  try {
    const executor = statefulExecutor(fx, { driftReplacement: true });
    await assert.rejects(runGoogleAuthActivation({
      manifest: fx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true,
    }), (error) => error.code === 'replacement_config_drift' && error.rollback?.restored === true);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});
