import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertGoogleAuthRuntimeManifest,
  buildGoogleAuthPreflightCommands,
  buildReplacementCreateArgs,
  readGoogleAuthRuntimeManifest,
  runGoogleAuthActivation,
  runGoogleAuthIsolatedRehearsal,
  runBoundedStartupProbe,
  runCommand,
  sanitizeActivationError,
  setActivationFlags,
} from '../ops/activate_staging_google_auth.mjs';
import { listingAiOpenAiModel, readListingAiGatewayConfiguration } from '../src/listing_ai_gateway_config.js';

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
    'DATABASE_URL=postgres://shareittoo_green:pw@canonical-db:5432/shareittoo_green',
    'PAYMENT_TRANSPORT=memory', 'STRIPE_LIVEMODE=false',
    'SIT_LISTING_AI_PROVIDER=openai', `SIT_LISTING_AI_MODEL=${listingAiOpenAiModel}`,
    'SIT_LISTING_AI_BUDGET_CENTS=0', 'SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED=0',
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
    }, HostConfig: { GroupAdd: ['65532'], RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, PortBindings: {}, NetworkMode: manifest.network },
    Mounts: mounts.map((m) => ({ Type: m.type, Name: m.type === 'volume' ? m.name : null, Source: m.source, Destination: m.destination, RW: !m.readOnly })),
    NetworkSettings: { Ports: {}, Networks: { [manifest.network]: {}, [manifest.providerNetwork]: {} } },
  };
  return { root, envFile, env, manifest, api, image, network: manifest.network, providerNetwork: manifest.providerNetwork };
}

function fakeCommand(fx) {
  const calls = [];
  const db = { Name: `/${fx.manifest.databaseContainer}`, State: { Running: true }, Config: { Image: 'postgres:16-alpine@sha256:' + 'b'.repeat(64), Env: ['POSTGRES_DB=shareittoo_green', 'POSTGRES_USER=shareittoo_green', 'POSTGRES_PASSWORD=pw'] } };
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
      if (phase === 'current_schema_migration_readback') return { stdout: '095_staging_google_registration_replays.up.sql\n' };
      if (phase === 'current_config_import_probe') return { stdout: JSON.stringify({ auth: true, mfa: true, project: true, environment: 'staging' }) };
      if (phase === 'current_live_probe' || phase === 'current_ready_probe') return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }) };
      if (phase === 'current_version_probe') return { stdout: JSON.stringify({ commit: revision, environment: 'test' }) };
      if (phase === 'current_runtime_flags') return { stdout: JSON.stringify(fx.manifest.safetyEnv) };
      throw new Error(`unexpected phase ${phase}`);
    },
  };
}

function statefulExecutor(fx, { failPhase, failRollbackPhase, driftReplacement = false, startupTimeout = false, startupDelayed = false, startupWrongVersion = false, startupWrongFlags = false, invalidTokenField = 'error' } = {}) {
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
    if (phase === 'replacement_invalid_social_token_probe') return { stdout: JSON.stringify(invalidTokenField === 'error' ? { status: 401, error: 'invalid_social_token' } : { status: 401, code: 'invalid_social_token' }) };
    if (phase === 'replacement_startup_probe') {
      if (startupTimeout) return { stdout: JSON.stringify({ ok: false, reason: 'startup_timeout', attempts: { live: 60, ready: 60 }, last: { live: { status: 503 }, ready: { status: 503 } } }), code: 1 };
      const version = { status: 200, commit: startupWrongVersion ? 'wrong' : revision, environment: 'staging' };
      const flags = { ...fx.manifest.safetyEnv, FIREBASE_AUTH_ENABLED: startupWrongFlags ? 'false' : 'true', DEPLOYMENT_ENVIRONMENT: 'staging' };
      return { stdout: JSON.stringify({ ok: true, attempts: { live: startupDelayed ? 3 : 1, ready: startupDelayed ? 4 : 1 }, last: { live: { status: 200 }, ready: { status: 200 } }, version, flags }), code: 0 };
    }
    if (phase === 'replacement_database_probe') return { stdout: '1' };
    if (phase === 'rollback_replacement_remove') { replacementExists = false; return { stdout: '', code: 0 }; }
    if (phase === 'rollback_replacement_verify') return { stdout: replacementExists ? `${fx.manifest.apiContainer}\n` : '', code: 0 };
    if (phase === 'rollback_restore_rename') { if (!sealed) return { stdout: '', code: 1 }; sealed = false; return { stdout: '', code: 0 }; }
    if (phase === 'rollback_api_readback') return { stdout: JSON.stringify(fx.api), code: 0 };
    if (phase === 'rollback_startup_probe') return { stdout: JSON.stringify({ ok: true, attempts: { live: 1, ready: 1 }, last: { live: { status: 200 }, ready: { status: 200 } }, version: { status: 200, commit: revision, environment: 'test' }, flags: fx.manifest.safetyEnv }), code: 0 };
    if (phase === 'rollback_live_probe' || phase === 'rollback_ready_probe') return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }), code: 0 };
    if (phase === 'rollback_database_probe') return { stdout: '1', code: 0 };
    if (phase.startsWith('rollback_') || ['stop_current_api', 'seal_current_api', 'attach_provider_network', 'start_replacement_api'].includes(phase)) return { stdout: '', code: 0 };
    return base.command(_cmd, args, options);
  };
  return { command, calls };
}

function isolatedExecutor(fx, { startupTimeout = false, driftNetwork = null, driftSecurity = false, probeFailureStage = null, invalidTokenField = 'error' } = {}) {
  const base = fakeCommand(fx);
  const calls = base.calls;
  const state = { probeEnv: null };
  let candidate;
  let isolatedNetwork;
  const command = async (_cmd, args, options) => {
    const { phase } = options;
    calls.push({ phase, args });
    if (phase === 'rehearsal_probe_create') {
      const envPath = args[args.indexOf('--env-file') + 1];
      state.probeEnv = await readFile(envPath, 'utf8');
      return { stdout: '', code: 0 };
    }
    if (phase === 'rehearsal_candidate_create') { candidate = args[args.indexOf('--name') + 1]; isolatedNetwork = args[args.indexOf('--network') + 1]; return { stdout: '', code: 0 }; }
    if (phase === 'rehearsal_network_create' || phase === 'rehearsal_database_volume_create' || phase === 'rehearsal_uploads_volume_create' || phase === 'rehearsal_database_dump' || phase === 'rehearsal_database_create' || phase === 'rehearsal_database_start' || phase === 'rehearsal_database_ready' || phase === 'rehearsal_database_restore') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_config_readback') {
      const record = structuredClone(fx.api);
      record.Name = `/${candidate}`;
      record.NetworkSettings.Networks = { [isolatedNetwork]: {} };
      record.HostConfig.NetworkMode = isolatedNetwork;
      if (driftNetwork === 'extra') record.NetworkSettings.Networks.extra = {};
      if (driftNetwork === 'different') record.NetworkSettings.Networks = { 'wrong-network': {} };
      if (driftSecurity) record.HostConfig.Privileged = true;
      const mountArg = args.find((arg) => arg.includes('dst=/data/uploads'));
      if (mountArg) record.Mounts = record.Mounts.map((mount) => mount.Destination === '/data/uploads' ? { ...mount, Name: mountArg.match(/src=([^,]+)/)?.[1], Source: mountArg.match(/src=([^,]+)/)?.[1] } : mount);
      record.Config.Env = record.Config.Env.map((entry) => entry.startsWith('FIREBASE_AUTH_ENABLED=') ? 'FIREBASE_AUTH_ENABLED=true' : entry.startsWith('DEPLOYMENT_ENVIRONMENT=') ? 'DEPLOYMENT_ENVIRONMENT=staging' : entry);
      return { stdout: JSON.stringify(record), code: 0 };
    }
    if (phase === 'rehearsal_probe_start') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_probe_wait') return { stdout: probeFailureStage ? '1' : '0', code: 0 };
    if (phase === 'rehearsal_probe_logs') return { stdout: JSON.stringify(probeFailureStage ? { stage: probeFailureStage, ok: false, code: `${probeFailureStage}_probe_failed`, errorType: 'operational' } : { stage: 'complete', ok: true, code: 'ok', errorType: 'none' }), code: 0 };
    if (phase === 'rehearsal_probe_remove' || phase === 'rehearsal_probe_absence') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_candidate_start') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_startup_probe') return startupTimeout
      ? { stdout: JSON.stringify({ ok: false, reason: 'startup_timeout', attempts: { live: 60, ready: 60 }, last: { live: { status: 503 }, ready: { status: 503 } } }), code: 1 }
      : { stdout: JSON.stringify({ ok: true, attempts: { live: 3, ready: 4 }, last: { live: { status: 200 }, ready: { status: 200 } }, version: { status: 200, commit: revision, environment: 'staging' }, flags: { ...fx.manifest.safetyEnv, DEPLOYMENT_ENVIRONMENT: 'staging', FIREBASE_AUTH_ENABLED: 'true' } }), code: 0 };
    if (phase === 'rehearsal_database_probe') return { stdout: '1', code: 0 };
    if (phase === 'rehearsal_invalid_social_token_probe') return { stdout: JSON.stringify(invalidTokenField === 'error' ? { status: 401, error: 'invalid_social_token' } : { status: 401, code: 'invalid_social_token' }), code: 0 };
    if (phase === 'rehearsal_candidate_remove') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_candidate_absence') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_database_remove' || phase === 'rehearsal_database_volume_remove' || phase === 'rehearsal_uploads_volume_remove' || phase === 'rehearsal_network_remove') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_database_absence' || phase === 'rehearsal_database_volume_absence' || phase === 'rehearsal_uploads_volume_absence' || phase === 'rehearsal_network_absence') return { stdout: '', code: 0 };
    if (phase === 'rehearsal_canonical_api_after') return { stdout: JSON.stringify(fx.api), code: 0 };
    return base.command(_cmd, args, options);
  };
  return { command, calls, state };
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
    const migrationReadback = fake.calls.find((call) => call.phase === 'current_schema_migration_readback');
    assert.ok(migrationReadback.args.includes('SELECT name FROM schema_migrations ORDER BY applied_at DESC LIMIT 1'));
    assert.equal(fake.calls.some((call) => ['stop_current_api', 'seal_current_api', 'create_replacement_api', 'start_replacement_api'].includes(call.phase)), false);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('activation preflight rejects a non-terminal Green migration readback', async () => {
  const fx = await fixture();
  try {
    const base = fakeCommand(fx);
    await assert.rejects(
      runGoogleAuthActivation({
        manifest: fx.manifest,
        command: async (cmd, args, options) => options.phase === 'current_schema_migration_readback'
          ? { stdout: '094_apple_refresh_material_only.up.sql\n' }
          : base.command(cmd, args, options),
        execute: false,
      }),
      /current_schema_migration_readback_invalid/u,
    );
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

test('CLI failure sanitizer emits only bounded non-secret diagnostics', () => {
  const output = sanitizeActivationError({
    code: 'replacement_startup_probe_failed',
    message: 'secret should not appear',
    probeDiagnostic: { ok: false, reason: 'startup_timeout', attempts: { live: 60, ready: 60 }, last: { live: { status: 503 }, ready: { status: 503 } } },
    rollback: { restored: false, results: [{ phase: 'rollback_restore_rename', ok: false, code: 'rename_failed', secret: 'never-output' }] },
  });
  assert.deepEqual(output, {
    status: 'failed', code: 'replacement_startup_probe_failed',
    probeDiagnostic: { ok: false, reason: 'startup_timeout', attempts: { live: 60, ready: 60 }, last: { live: { status: 503 }, ready: { status: 503 } } },
    rollback: { restored: false, results: [{ phase: 'rollback_restore_rename', ok: false, code: 'rename_failed' }] },
  });
  assert.equal(JSON.stringify(output).includes('secret'), false);
  const candidate = sanitizeActivationError({
    code: 'rehearsal_startup_probe_failed',
    candidateState: { status: 'exited', running: false, exitCode: 137, oomKilled: true, restartCount: 4, error: 'present' },
  });
  assert.deepEqual(candidate.candidateState, { status: 'exited', running: false, exitCode: 137, oomKilled: true, restartCount: 4, error: 'present' });
  assert.deepEqual(sanitizeActivationError({ code: 'rehearsal_prestart_probe_failed', probeDiagnostic: { stage: 'database', ok: false, code: 'database_probe_failed', errorType: 'operational' } }).probeDiagnostic, {
    stage: 'database', ok: false, code: 'database_probe_failed', errorType: 'operational',
  });
});

test('host startup probe retries unavailable exec and succeeds only on both 200 health checks', async () => {
  let attempts = 0;
  const result = await runBoundedStartupProbe(async () => {
    attempts += 1;
    if (attempts < 3) return { stdout: '', code: 1 };
    return { stdout: JSON.stringify({ ok: true, attempts: { live: 1, ready: 1 }, last: { live: { status: 200 }, ready: { status: 200 } }, version: { status: 200, commit: revision, environment: 'staging' }, flags: { DEPLOYMENT_ENVIRONMENT: 'staging', FIREBASE_AUTH_ENABLED: 'true', FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0' } }), code: 0 };
  }, 'candidate', {}, 'test_startup_probe', { deadlineMs: 100, retryDelayMs: 1 });
  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
  assert.equal(result.version.environment, 'staging');
  assert.equal(result.flags.FIREBASE_AUTH_ENABLED, 'true');
});

test('host startup probe bounds all unavailable exec attempts', async () => {
  let attempts = 0;
  await assert.rejects(runBoundedStartupProbe(async () => {
    attempts += 1;
    return { stdout: '', code: 1 };
  }, 'candidate', {}, 'test_startup_probe', { deadlineMs: 10, retryDelayMs: 1 }), (error) => {
    assert.equal(error.code, 'test_startup_probe_failed');
    assert.equal(error.probeDiagnostic.reason, 'startup_timeout');
    assert.equal(error.probeDiagnostic.attempts.exec, attempts);
    return true;
  });
  assert.ok(attempts > 1);
});

test('stdout-file runner waits for both output finish and child close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sit-google-auth-stream-'));
  const outputPath = join(root, 'dump.bin');
  try {
    const fakeSpawn = () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      child.kill = () => {};
      setImmediate(() => {
        child.stdout.end('isolated-dump');
        setTimeout(() => child.emit('close', 0), 10);
      });
      return child;
    };
    const result = await runCommand('fake-docker', ['inspect'], { phase: 'stream_regression', stdoutFile: outputPath, spawnProcess: fakeSpawn });
    assert.equal(result.code, 0);
    assert.equal(await readFile(outputPath, 'utf8'), 'isolated-dump');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('command rejection preserves numeric exit code without stderr', async () => {
  const fakeSpawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    setImmediate(() => {
      child.stdout.end();
      child.stderr.end('sensitive stderr');
      child.emit('close', 17);
    });
    return child;
  };
  await assert.rejects(runCommand('fake-docker', ['inspect'], { phase: 'nonzero_exit', spawnProcess: fakeSpawn }), (error) => {
    assert.equal(error.failureExitCode, 17);
    assert.equal(Object.hasOwn(error, 'stderr'), false);
    return true;
  });
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

test('bounded startup polling accepts delayed readiness and diagnoses timeout', async () => {
  const delayed = await fixture();
  try {
    const executor = statefulExecutor(delayed, { startupDelayed: true });
    const result = await runGoogleAuthActivation({ manifest: delayed.manifest, command: executor.command, commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true });
    assert.equal(result.status, 'activated-awaiting-device-smoke');
    assert.ok(executor.calls.some((call) => call.phase === 'replacement_startup_probe'));
  } finally { await rm(delayed.root, { recursive: true, force: true }); }
  const timedOut = await fixture();
  try {
    const executor = statefulExecutor(timedOut, { startupTimeout: true });
    await assert.rejects(runGoogleAuthActivation({ manifest: timedOut.manifest, command: executor.command, commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true }), (error) => error.code === 'replacement_startup_probe_failed' && error.probeDiagnostic?.reason === 'startup_timeout' && error.rollback?.restored === true);
  } finally { await rm(timedOut.root, { recursive: true, force: true }); }
});

test('combined startup readback rejects wrong version or runtime flags', async () => {
  for (const [option, code] of [['startupWrongVersion', 'version_readback_invalid'], ['startupWrongFlags', 'runtime_flag_readback_invalid']]) {
    const fx = await fixture();
    try {
      const executor = statefulExecutor(fx, { [option]: true });
      await assert.rejects(runGoogleAuthActivation({
        manifest: fx.manifest, command: executor.command,
        commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true,
      }), (error) => error.code === code && error.rollback?.restored === true);
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
});

test('isolated rehearsal never stops canonical and proves candidate cleanup', async () => {
  const fx = await fixture();
  try {
    const executor = isolatedExecutor(fx);
    const result = await runGoogleAuthIsolatedRehearsal({
      manifest: fx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
    });
    assert.equal(result.status, 'isolated-rehearsal-passed');
    assert.equal(result.canonicalUntouched, true);
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.env);
    assert.ok(executor.calls.some((call) => call.phase === 'rehearsal_candidate_absence'));
    assert.equal(executor.calls.some((call) => call.phase === 'stop_current_api' || call.phase === 'seal_current_api'), false);
    const create = executor.calls.find((call) => call.phase === 'rehearsal_candidate_create');
    assert.ok(create.args.includes('--network') && !create.args.includes(fx.manifest.network));
    assert.ok(create.args.some((arg) => arg.includes('src=sit-google-auth-rehearsal-uploads-')));
    const probeCreate = executor.calls.find((call) => call.phase === 'rehearsal_probe_create');
    assert.ok(probeCreate.args.includes('--network') && !probeCreate.args.includes(fx.manifest.network));
    assert.equal(probeCreate.args.includes('--publish') || probeCreate.args.includes('-p'), false);
    assert.ok(probeCreate.args.some((arg) => arg.includes('initializeDatabase')));
    assert.ok(probeCreate.args.some((arg) => arg.includes('verifyMailer')));
    assert.equal(executor.calls.some((call) => call.phase === 'rehearsal_provider_network_attach'), false);
    assert.ok(executor.calls.some((call) => call.phase === 'rehearsal_probe_remove'));
    assert.match(executor.state.probeEnv, /SIT_LISTING_AI_PROVIDER=disabled/);
    assert.match(executor.state.probeEnv, new RegExp(`SIT_LISTING_AI_MODEL=${listingAiOpenAiModel}`));
    assert.match(executor.state.probeEnv, /SIT_LISTING_AI_BUDGET_CENTS=0/);
    assert.match(executor.state.probeEnv, /SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED=0/);
    assert.match(executor.state.probeEnv, /TECHNICAL_SANDBOX_ENABLED=0/);
    assert.match(executor.state.probeEnv, /TECHNICAL_SANDBOX_KILL_SWITCH=1/);
    assert.doesNotMatch(executor.state.probeEnv, /SIT_LISTING_AI_BUDGET_MINOR=/);
    assert.doesNotMatch(executor.state.probeEnv, /TECHNICAL_SANDBOX_AVAILABLE=/);
    const isolatedEnv = Object.fromEntries(executor.state.probeEnv.trim().split('\n').map((line) => line.split('=')));
    const isolatedListingAi = readListingAiGatewayConfiguration(isolatedEnv, { deploymentEnvironment: 'staging' });
    assert.equal(isolatedListingAi.provider, 'disabled');
    assert.equal(isolatedListingAi.model, listingAiOpenAiModel);
    assert.equal(isolatedListingAi.budgetCents, 0);
    assert.equal(isolatedListingAi.externalProviderExecutionAllowed, false);
    assert.equal(isolatedListingAi.providerExecutionAllowed, false);
    const dbProbe = executor.calls.find((call) => call.phase === 'rehearsal_database_probe');
    assert.ok(dbProbe.args.some((arg) => arg.includes('sit-google-auth-rehearsal-db-')));
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

// Provider discriminator overrides must preserve each dependent model/budget/approval invariant.
test('isolated listing AI override is disabled, zero-cost and non-external with OpenAI model preserved', () => {
  const original = {
    SIT_LISTING_AI_PROVIDER: 'openai',
    SIT_LISTING_AI_MODEL: listingAiOpenAiModel,
    SIT_LISTING_AI_BUDGET_CENTS: '0',
    SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
  };
  const isolated = { ...original, SIT_LISTING_AI_PROVIDER: 'disabled' };
  const config = readListingAiGatewayConfiguration(isolated, { deploymentEnvironment: 'staging' });
  assert.equal(config.provider, 'disabled');
  assert.equal(config.model, listingAiOpenAiModel);
  assert.equal(config.budgetCents, 0);
  assert.equal(config.externalProviderExecutionAllowed, false);
  assert.equal(config.providerExecutionAllowed, false);
});

test('invalid social probe follows production error serializer and rejects invented code field', async () => {
  const canonicalFx = await fixture();
  try {
    const executor = statefulExecutor(canonicalFx, { invalidTokenField: 'code' });
    await assert.rejects(runGoogleAuthActivation({
      manifest: canonicalFx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true,
    }), (error) => error.code === 'replacement_invalid_social_token_probe_invalid' && error.rollback?.restored === true);
  } finally { await rm(canonicalFx.root, { recursive: true, force: true }); }
  const fx = await fixture();
  try {
    const executor = isolatedExecutor(fx, { invalidTokenField: 'code' });
    await assert.rejects(runGoogleAuthIsolatedRehearsal({
      manifest: fx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
    }), (error) => error.code === 'rehearsal_invalid_social_token_probe_invalid' && error.rehearsalCleanup?.cleaned === true);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('isolated prestart probe classifies config, database and mailer failures before API start', async () => {
  for (const probeFailureStage of ['config', 'database', 'mailer']) {
    const fx = await fixture();
    try {
      const executor = isolatedExecutor(fx, { probeFailureStage });
      await assert.rejects(runGoogleAuthIsolatedRehearsal({
        manifest: fx.manifest, command: executor.command,
        commandEnv: { STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
      }), (error) => error.code === 'rehearsal_prestart_probe_failed'
        && error.probeDiagnostic?.stage === probeFailureStage
        && error.probeDiagnostic?.ok === false
        && error.rehearsalCleanup?.cleaned === true);
      assert.equal(executor.calls.some((call) => call.phase === 'rehearsal_candidate_create'), false);
      assert.ok(executor.calls.some((call) => call.phase === 'rehearsal_probe_absence'));
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
});

test('isolated rehearsal timeout returns diagnostic and cleans candidate/temp env', async () => {
  const fx = await fixture();
  try {
    const executor = isolatedExecutor(fx, { startupTimeout: true });
    await assert.rejects(runGoogleAuthIsolatedRehearsal({
      manifest: fx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
    }), (error) => error.code === 'rehearsal_startup_probe_failed' && error.probeDiagnostic?.reason === 'startup_timeout' && error.rehearsalCleanup?.cleaned === true);
    assert.equal(await readFile(fx.envFile, 'utf8'), fx.env);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('isolated rehearsal rejects extra or different networks and security drift', async () => {
  for (const driftNetwork of ['extra', 'different']) {
    const fx = await fixture();
    try {
      const executor = isolatedExecutor(fx, { driftNetwork });
      await assert.rejects(runGoogleAuthIsolatedRehearsal({
        manifest: fx.manifest, command: executor.command,
        commandEnv: { STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
      }), (error) => error.code === 'rehearsal_network_inventory_invalid' && error.rehearsalCleanup?.cleaned === true);
      assert.ok(executor.calls.some((call) => call.phase === 'rehearsal_candidate_absence'));
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const fx = await fixture();
  try {
    const executor = isolatedExecutor(fx, { driftSecurity: true });
    await assert.rejects(runGoogleAuthIsolatedRehearsal({
      manifest: fx.manifest, command: executor.command,
      commandEnv: { STAGING_GOOGLE_AUTH_ISOLATED_REHEARSAL: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision },
    }), (error) => error.code === 'rehearsal_config_drift' && error.rehearsalCleanup?.cleaned === true);
    assert.ok(executor.calls.some((call) => call.phase === 'rehearsal_candidate_absence'));
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('executor failure restores env and sealed container', async () => {
  const fx = await fixture();
  try {
    const executor = statefulExecutor(fx, { failPhase: 'replacement_startup_probe' });
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
  for (const failPhase of ['stop_current_api', 'seal_current_api', 'create_replacement_api', 'start_replacement_api', 'replacement_startup_probe']) {
    const fx = await fixture();
    try {
      const executor = statefulExecutor(fx, { failPhase });
      await assert.rejects(runGoogleAuthActivation({
        manifest: fx.manifest, command: executor.command,
        commandEnv: { STAGING_GOOGLE_AUTH_EXECUTE: '1', STAGING_GOOGLE_AUTH_CONFIRM: revision }, execute: true,
      }), (error) => error.rollback?.restored === (failPhase === 'create_replacement_api' || failPhase === 'start_replacement_api' || failPhase === 'replacement_startup_probe'));
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const fx = await fixture();
  try {
    const executor = statefulExecutor(fx, { failPhase: 'replacement_startup_probe', failRollbackPhase: 'rollback_restore_rename' });
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
