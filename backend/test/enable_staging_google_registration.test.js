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
const registrationAllowlistKey = 'SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST';
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

async function fixture({ apiContainer = 'shareittoo-staging-api', image = `registry.example/shareittoo-api:${revision}`, mapping = mappingLine(), hostname = null } = {}) {
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
    Id: 'a'.repeat(64), Name: `/${apiContainer}`, State: { Running: true }, Config: {
      Image: image, Env: envContent().trim().split('\n'), Cmd: ['node', 'src/server.js'], Entrypoint: null,
      WorkingDir: '/app', User: 'shareittoo', Hostname: hostname ?? 'a'.repeat(12), Tty: false, OpenStdin: false,
      Labels: { 'com.shareittoo.sit.green': 'true' },
    },
    HostConfig: {
      GroupAdd: ['65532'], RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, PortBindings: {}, NetworkMode: manifest.network,
      SecurityOpt: ['no-new-privileges'], NoNewPrivileges: true, Memory: 64,
    },
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

function envMap(entries) {
  return Object.fromEntries((entries ?? []).map((entry) => {
    const index = String(entry).indexOf('=');
    return index < 0 ? [String(entry), ''] : [String(entry).slice(0, index), String(entry).slice(index + 1)];
  }));
}

function statefulDockerExecutor(fx, {
  mutateUnrelated = false,
  falsePass = false,
  failOperation = null,
  wrongSchema = false,
  wrongImage = false,
  driftHealth = false,
  driftMemory = false,
  driftMaskedPaths = false,
  stopMode = null,
  createMode = null,
  renameMode = null,
  createMutation = null,
} = {}) {
  const db = { Name: `/${fx.manifest.databaseContainer}`, State: { Running: true }, Config: { Image: `postgres:16-alpine@sha256:${'c'.repeat(64)}`, Env: ['POSTGRES_DB=shareittoo_green', 'POSTGRES_USER=shareittoo_green'] } };
  const volume = { Name: fx.manifest.databaseVolume };
  const network = { Name: fx.manifest.network, Internal: true };
  const providerNetwork = { Name: fx.manifest.providerNetwork };
  const uploads = { Name: fx.manifest.uploadsVolume };
  const image = { RepoTags: [fx.image], Config: { User: 'shareittoo', Labels: { 'org.opencontainers.image.revision': revision } }, RepoDigests: [`${fx.image}@${imageDigest}`] };
  const containers = new Map([[fx.manifest.apiContainer, fx.api]]);
  const calls = [];
  const state = { stopReadbackConsumed: false };
  const json = (value) => ({ stdout: JSON.stringify(value), code: 0 });
  const fail = (code, phase) => { throw Object.assign(new Error(`${code}_failed`), { code: `${code}_failed`, failurePhase: phase }); };
  const inspectContainer = (name) => {
    const value = containers.get(name);
    if (!value) fail('container_not_found', 'inspect');
    return value;
  };
  const optionValue = (args, name) => {
    const index = args.indexOf(name);
    return index < 0 ? null : args[index + 1];
  };
  const parseExec = (args) => {
    let index = 1;
    while (args[index] === '-e') index += 2;
    const container = args[index];
    return { container, script: args.slice(index + 1).join(' ') };
  };
  const command = async (cmd, args, options = {}) => {
    assert.equal(cmd, 'docker');
    calls.push({ phase: options.phase, args: [...args] });
    let operation = args[0];
    if (args[0] === 'image') {
      if (args[1] !== 'inspect' || args.length !== 5 || args[2] !== '--format' || args[3] !== '{{json .}}') throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      operation = 'image_inspect';
    } else if (args[0] === 'network') {
      if (args[1] !== 'connect' || args.length !== 4) throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      operation = 'network_connect';
    }
    const failFor = (name) => failOperation === name;
    if (operation === 'inspect') {
      if (args.length !== 4 || args[1] !== '--format' || args[2] !== '{{json .}}') throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      const target = args.at(-1);
      if (target === fx.manifest.apiContainer && state.stopAttempted && (stopMode === 'unknown-inspect-no-recovery' || stopMode === 'unknown-inspect' && !state.stopReadbackConsumed)) {
        state.stopReadbackConsumed = true;
        fail('stop_state_readback', options.phase);
      }
      if (!containers.has(target) && options.allowFailure) return { stdout: '', stderr: 'Error: No such container', code: 1 };
      if (target === fx.manifest.apiContainer && containers.get(target)?.Id === 'b'.repeat(64)) {
        const replacement = structuredClone(containers.get(target));
        if (driftHealth) replacement.Config.Healthcheck = { Test: ['CMD-SHELL', 'false'], Interval: 1, Timeout: 1, Retries: 1, StartPeriod: 1, StartInterval: 1 };
        if (driftMemory) replacement.HostConfig.Memory = 99;
        if (driftMaskedPaths) replacement.HostConfig.MaskedPaths = ['/proc/drifted'];
        return json(replacement);
      }
      return json(target === fx.manifest.databaseContainer ? db
        : target === fx.manifest.databaseVolume ? volume
          : target === fx.manifest.network ? network
            : target === fx.manifest.providerNetwork ? providerNetwork
              : target === fx.manifest.uploadsVolume ? uploads
                : inspectContainer(target));
    }
    if (operation === 'image_inspect') return json(wrongImage ? { ...image, RepoTags: [`${fx.image}-drift`] } : image);
    if (operation === 'ps') {
      if (args.length !== 6 || args[1] !== '--all' || args[2] !== '--filter' || args[4] !== '--format' || args[5] !== '{{.Names}}') throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      const filter = args.find((arg) => arg.startsWith('name=')) ?? '';
      const match = /^name=\^\/(.+)\$$/u.exec(filter)?.[1];
      return { stdout: match && containers.has(match) ? `${match}\n` : '', code: 0 };
    }
    if (operation === 'exec') {
      const { container, script } = parseExec(args);
      if (!containers.has(container) && container !== fx.manifest.databaseContainer) fail('exec_target', options.phase);
      if (container === fx.manifest.databaseContainer) {
        const directPsql = args[2] === 'psql' && !args.includes('-e');
        const ledgerShell = args[2] === 'sh' && args[3] === '-c' && !args.includes('-e');
        if ((!directPsql && !ledgerShell) || args.length < 3) throw new Error(`unexpected_docker_command:${args.join(' ')}`);
        if (script.includes('SELECT 1')) return { stdout: '1\n', code: 0 };
        if (script.includes('ORDER BY applied_at')) return { stdout: `${wrongSchema ? '094_apple_refresh_material_only.up.sql' : '095_staging_google_registration_replays.up.sql'}\n`, code: 0 };
        if (script.includes('string_agg')) return { stdout: `${migrationLedgerDigest}\n`, code: 0 };
        fail('unknown_database_exec', options.phase);
      }
      if (args.filter((arg) => arg === '-e').length !== 1 || !args.includes('--input-type=module') || args.at(-2) !== '-e') throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      if (script.includes('runtimeNames')) {
        if (failOperation === 'replacement-startup' && inspectContainer(container).Id === 'b'.repeat(64)) fail('replacement_public_runtime_probe', options.phase);
        return { stdout: startupPayload(fx, true), code: 0 };
      }
      if (script.includes('/health/live')) return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }), code: 0 };
      if (script.includes('/health/ready')) return { stdout: JSON.stringify({ status: 200, payload: { status: 'ok' } }), code: 0 };
      if (script.includes('/version')) return { stdout: JSON.stringify({ commit: revision, environment: 'staging' }), code: 0 };
      if (script.includes('allowlistEntryCount')) {
        const inspected = inspectContainer(container);
        if (mutateUnrelated && inspected.Config.Image === fx.image) await writeFile(fx.envFile, envContent({ unrelated: 'changed-after-preflight' }), { mode: 0o600 });
        const values = envMap(inspected.Config.Env);
        const replacement = inspected.Config.Image === `${fx.image}@${imageDigest}`;
        const raw = falsePass && replacement ? '' : values.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ?? '';
        const enabled = falsePass && replacement ? false : values.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED === 'true';
        return { stdout: JSON.stringify({ enabled, allowlist: raw ? 'present' : 'absent', allowlistDigest: crypto.createHash('sha256').update(raw).digest('hex'), allowlistEntryCount: raw ? raw.split(',').length : 0, accessGateEnabled: values.SIT_STAGING_ACCESS_GATE_ENABLED === 'true' }), code: 0 };
      }
      if (script.includes('SIT_STAGING_ACCESS_GATE_ENABLED')) {
        const values = envMap(inspectContainer(container).Config.Env);
        return { stdout: JSON.stringify({ DEPLOYMENT_ENVIRONMENT: values.DEPLOYMENT_ENVIRONMENT, FIREBASE_AUTH_ENABLED: values.FIREBASE_AUTH_ENABLED, FIREBASE_PHONE_VERIFICATION_ENABLED: values.FIREBASE_PHONE_VERIFICATION_ENABLED, PAYMENT_TRANSPORT: values.PAYMENT_TRANSPORT, STRIPE_LIVEMODE: values.STRIPE_LIVEMODE, SIT_STAGING_ACCESS_GATE_ENABLED: values.SIT_STAGING_ACCESS_GATE_ENABLED, SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: values.SIT_STAGING_GOOGLE_REGISTRATION_ENABLED === 'true', SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: values.SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST ? 'present' : 'absent' }), code: 0 };
      }
      fail('unknown_api_exec', options.phase);
    }
    if (operation === 'stop') {
      if (args.length !== 2) throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      if (failFor('stop-before') || stopMode === 'fail-before') fail('stop_current_api', options.phase);
      state.stopAttempted = true;
      const container = inspectContainer(args[1]);
      container.State.Running = false;
      fx.state.stopped = true;
      if (stopMode === 'foreign-inspect') {
        const foreign = structuredClone(container);
        foreign.Id = 'f'.repeat(64);
        foreign.State = { Running: false };
        containers.set(args[1], foreign);
        fail('stop_response_lost', options.phase);
      }
      if (stopMode === 'response-loss' || stopMode === 'unknown-inspect' || stopMode === 'unknown-inspect-no-recovery') fail('stop_response_lost', options.phase);
      return { stdout: '', code: 0 };
    }
    if (operation === 'rename') {
      if (args.length !== 3) throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      if (failFor('rename')) fail('seal_current_api', options.phase);
      const [oldName, newName] = args.slice(1);
      const container = inspectContainer(oldName);
      containers.delete(oldName);
      container.Name = `/${newName}`;
      containers.set(newName, container);
      fx.state.sealed = newName !== fx.manifest.apiContainer;
      if ((renameMode === 'response-loss' || renameMode === 'foreign-response-loss') && !state.renameResponseConsumed) {
        state.renameResponseConsumed = true;
        if (renameMode === 'foreign-response-loss') {
          const foreign = structuredClone(fx.api);
          foreign.Id = 'f'.repeat(64);
          foreign.Name = `/${fx.manifest.apiContainer}`;
          foreign.State = { Running: false };
          foreign.Config.Image = `${fx.image}@sha256:${'f'.repeat(64)}`;
          containers.set(fx.manifest.apiContainer, foreign);
        }
        fail('rename_response_lost', options.phase);
      }
      return { stdout: '', code: 0 };
    }
    if (operation === 'create') {
      if (failFor('create')) fail('create_replacement_api', options.phase);
      if (createMode === 'foreign-preexisting') {
        const foreign = structuredClone(fx.api);
        foreign.Id = 'f'.repeat(64);
        foreign.Name = `/${fx.manifest.apiContainer}`;
        foreign.State = { Running: true };
        foreign.Config.Image = `${fx.image}@sha256:${'f'.repeat(64)}`;
        containers.set(fx.manifest.apiContainer, foreign);
        fail('create_name_conflict', options.phase);
      }
      let effectiveArgs = [...args];
      const removeOption = (option) => {
        const index = effectiveArgs.indexOf(option);
        if (index >= 0) effectiveArgs.splice(index, 2);
      };
      const replaceOption = (option, value) => {
        const index = effectiveArgs.indexOf(option);
        if (index >= 0) effectiveArgs[index + 1] = value;
      };
      if (createMutation === 'user-root') replaceOption('--user', 'root');
      if (createMutation === 'remove-group') removeOption('--group-add');
      if (createMutation === 'remove-mount') removeOption('--mount');
      if (createMutation === 'wrong-mount') {
        const index = effectiveArgs.findIndex((entry, position) => entry === '--mount' && effectiveArgs[position + 1]?.includes('dst=/data/uploads'));
        if (index >= 0) effectiveArgs[index + 1] = effectiveArgs[index + 1].replace('dst=/data/uploads', 'dst=/data/wrong');
      }
      if (createMutation === 'security-drift') replaceOption('--security-opt', 'seccomp=unconfined');
      if (createMutation === 'memory-drift') replaceOption('--memory', '99');
      const valueOptions = new Set(['--name', '--env-file', '--restart', '--restart-max-retries', '--user', '--workdir', '--entrypoint', '--security-opt', '--cap-add', '--cap-drop', '--stop-timeout', '--stop-signal', '--shm-size', '--dns', '--dns-search', '--add-host', '--ipc', '--pid', '--userns', '--log-driver', '--log-opt', '--memory', '--memory-swap', '--cpu-shares', '--cpu-quota', '--cpu-period', '--cpus', '--cpuset-cpus', '--cpuset-mems', '--pids-limit', '--device', '--ulimit', '--tmpfs', '--cgroupns', '--runtime', '--isolation', '--health-cmd', '--health-interval', '--health-timeout', '--health-retries', '--health-start-period', '--health-start-interval', '--group-add', '--label', '--mount', '--hostname', '--network']);
      const booleanOptions = new Set(['--privileged', '--read-only', '--no-new-privileges', '--init', '--oom-kill-disable', '--rm']);
      let cursor = 1;
      while (cursor < effectiveArgs.length) {
        const arg = effectiveArgs[cursor];
        if (arg === '--network') { if (!effectiveArgs[cursor + 1] || !effectiveArgs[cursor + 2]) throw new Error(`unexpected_docker_command:${effectiveArgs.join(' ')}`); break; }
        if (booleanOptions.has(arg)) { cursor += 1; continue; }
        if (!valueOptions.has(arg) || !effectiveArgs[cursor + 1]) throw new Error(`unexpected_docker_command:${effectiveArgs.join(' ')}`);
        cursor += 2;
      }
      const optionValues = (option) => effectiveArgs.flatMap((entry, index) => entry === option ? [effectiveArgs[index + 1]] : []);
      const optionFirst = (option) => optionValues(option)[0] ?? null;
      const name = optionFirst('--name');
      const envFile = optionFirst('--env-file');
      const networkIndex = effectiveArgs.indexOf('--network');
      const networkName = optionFirst('--network');
      const imageArg = effectiveArgs[networkIndex + 2];
      if (!name || envFile !== fx.envFile || networkIndex < 0 || networkName !== fx.manifest.network || imageArg !== `${fx.image}@${imageDigest}`
          || JSON.stringify(effectiveArgs.slice(networkIndex + 3)) !== JSON.stringify(fx.api.Config.Cmd)) fail('unexpected_create_args', options.phase);
      const env = (await readFile(envFile, 'utf8')).trim().split('\n');
      const labels = Object.fromEntries(optionValues('--label').map((entry) => {
        const index = entry.indexOf('=');
        return [entry.slice(0, index), entry.slice(index + 1)];
      }));
      const parsedMounts = optionValues('--mount').map((spec) => {
        const fields = Object.fromEntries(spec.split(',').map((part) => part.split('=')));
        const type = fields.type;
        const destination = fields.dst;
        const readOnly = fields.readonly === 'true';
        if (!type || !destination || !['bind', 'volume'].includes(type)) fail('unexpected_create_mount', options.phase);
        if (type === 'volume') {
          const original = fx.api.Mounts.find((mount) => mount.Type === 'volume' && mount.Name === fields.src);
          if (!original) fail('unexpected_create_mount', options.phase);
          return { Type: 'volume', Name: fields.src, Source: original.Source, Destination: destination, RW: !readOnly };
        }
        return { Type: 'bind', Name: null, Source: fields.src, Destination: destination, RW: !readOnly };
      });
      const securityOpt = optionValues('--security-opt');
      const source = {
        Id: 'b'.repeat(64), Name: `/${name}`, State: { Running: false },
        Config: {
          Image: imageArg, Env: env, Cmd: effectiveArgs.slice(networkIndex + 3), Entrypoint: optionFirst('--entrypoint') ? [optionFirst('--entrypoint')] : null,
          WorkingDir: optionFirst('--workdir') ?? '', User: optionFirst('--user') ?? '', Hostname: optionFirst('--hostname') ?? 'b'.repeat(12),
          Tty: false, OpenStdin: false, Labels: labels,
        },
        HostConfig: {
          GroupAdd: optionValues('--group-add'), RestartPolicy: { Name: optionFirst('--restart') ?? '', MaximumRetryCount: Number(optionFirst('--restart-max-retries') ?? 0) },
          PortBindings: {}, NetworkMode: networkName, SecurityOpt: securityOpt, NoNewPrivileges: securityOpt.includes('no-new-privileges'),
          Privileged: effectiveArgs.includes('--privileged'), ReadonlyRootfs: effectiveArgs.includes('--read-only'), Init: effectiveArgs.includes('--init'),
          Memory: Number(optionFirst('--memory') ?? 0),
        },
        Mounts: parsedMounts, NetworkSettings: { Ports: {}, Networks: { [networkName]: {} } },
      };
      if (createMode === 'mismatched-registration') {
        source.Config.Env = source.Config.Env.map((entry) => entry.startsWith(`${registrationAllowlistKey}=`) ? `${registrationAllowlistKey}=${'c'.repeat(64)}=other-user` : entry);
      }
      containers.set(name, source);
      fx.state.created = true;
      if (createMode === 'response-loss' || createMode === 'foreign-response-loss' || createMode === 'mismatched-registration') {
        if (createMode === 'foreign-response-loss') {
          const foreign = structuredClone(source);
          foreign.Id = 'f'.repeat(64);
          foreign.Config.Image = `${fx.image}@sha256:${'f'.repeat(64)}`;
          containers.set(name, foreign);
        }
        fail('create_response_lost', options.phase);
      }
      return { stdout: '', code: 0 };
    }
    if (operation === 'network_connect') {
      const networkName = args[2];
      if (networkName !== fx.manifest.providerNetwork || args[3] !== fx.manifest.apiContainer) fail('unexpected_network_connect', options.phase);
      const container = inspectContainer(args[3]);
      container.NetworkSettings.Networks[networkName] = {};
      return { stdout: '', code: 0 };
    }
    if (operation === 'start') {
      if (args.length !== 2) throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      const container = inspectContainer(args[1]);
      container.State.Running = true;
      fx.state.stopped = false;
      return { stdout: '', code: 0 };
    }
    if (operation === 'rm') {
      if (args.length !== 3 || args[1] !== '--force') throw new Error(`unexpected_docker_command:${args.join(' ')}`);
      const name = args.at(-1);
      containers.delete(name);
      fx.state.created = false;
      return { stdout: '', code: 0 };
    }
    throw new Error(`unexpected_docker_command:${args.join(' ')}`);
  };
  return { command, calls, state: { containers } };
}

test('default-off preflight validates schema 95 and does not mutate or expose mapping', async () => {
  const fx = await fixture();
  try {
    const fake = statefulDockerExecutor(fx);
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
    const fake = statefulDockerExecutor(fx);
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
    const create = fake.calls.find((call) => call.args[0] === 'create');
    assert.ok(create);
    assert.equal(create.args.includes('--hostname'), false);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('Docker-default hostname may change only with successor identity, while explicit hostname is preserved', async () => {
  const fx = await fixture({ hostname: 'green-api.example' });
  try {
    const fake = statefulDockerExecutor(fx);
    await runStagingGoogleRegistrationEnable({
      manifest: fx.manifest, mappingFile: fx.mappingFile, evidenceFile: fx.evidenceFile,
      command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true,
    });
    const create = fake.calls.find((call) => call.args[0] === 'create');
    assert.ok(create);
    assert.deepEqual(create.args.slice(create.args.indexOf('--hostname'), create.args.indexOf('--hostname') + 2), ['--hostname', 'green-api.example']);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('stateful executor rejects unknown Docker commands and argument shapes', async () => {
  const fx = await fixture();
  try {
    const fake = statefulDockerExecutor(fx);
    await assert.rejects(fake.command('docker', ['image', 'pull', fx.image], { phase: 'negative_unknown_command' }), /unexpected_docker_command/u);
    await assert.rejects(fake.command('docker', ['inspect', '--format', '{{json .}}', fx.manifest.apiContainer, 'unexpected'], { phase: 'negative_unknown_args' }), /unexpected_docker_command/u);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('failure after recreate restores the prior env and container deterministically', async () => {
  const fx = await fixture();
  try {
  const fake = statefulDockerExecutor(fx, { failOperation: 'replacement-startup' });
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
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: fx.manifest, mappingFile: fx.mappingFile, command: statefulDockerExecutor(fx).command }), /mapping_target_not_access_allowed/u);
  } finally { await rm(fx.root, { recursive: true, force: true }); }
});

test('wrong target, mode, symlink, changed unrelated byte, and false PASS all fail closed', async () => {
  const badManifest = await fixture({ apiContainer: 'wrong-api' });
  try { await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: badManifest.manifest, mappingFile: badManifest.mappingFile, command: statefulDockerExecutor(badManifest).command }), /target_not_staging_green/u); }
  finally { await rm(badManifest.root, { recursive: true, force: true }); }

  const mode = await fixture();
  try { await chmod(mode.mappingFile, 0o640); assert.throws(() => readRegistrationMapping(mode.mappingFile), /mapping_metadata_invalid/u); }
  finally { await rm(mode.root, { recursive: true, force: true }); }

  const link = await fixture();
  try { const linkPath = join(link.root, 'mapping-link'); await symlink(link.mappingFile, linkPath); assert.throws(() => readRegistrationMapping(linkPath), /mapping_symlink_forbidden/u); }
  finally { await rm(link.root, { recursive: true, force: true }); }

  const changed = await fixture();
  try {
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: changed.manifest, mappingFile: changed.mappingFile, evidenceFile: changed.evidenceFile, command: statefulDockerExecutor(changed, { mutateUnrelated: true }).command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /env_changed_since_preflight/u);
    assert.equal(await readFile(changed.envFile, 'utf8'), envContent({ unrelated: 'changed-after-preflight' }));
  }
  finally { await rm(changed.root, { recursive: true, force: true }); }

  const falsePass = await fixture();
  try {
    const fake = statefulDockerExecutor(falsePass, { falsePass: true });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: falsePass.manifest, mappingFile: falsePass.mappingFile, evidenceFile: falsePass.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /registration_config_readback_invalid/u);
    assert.equal(await readFile(falsePass.envFile, 'utf8'), envContent());
  } finally { await rm(falsePass.root, { recursive: true, force: true }); }
});

test('wrong schema or image and stop/rename interruption never produce a false PASS', async () => {
  const schema = await fixture();
  try { await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: schema.manifest, mappingFile: schema.mappingFile, command: statefulDockerExecutor(schema, { wrongSchema: true }).command }), /current_schema_migration_readback_invalid/u); }
  finally { await rm(schema.root, { recursive: true, force: true }); }

  const image = await fixture();
  try { await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: image.manifest, mappingFile: image.mappingFile, command: statefulDockerExecutor(image, { wrongImage: true }).command }), /image_readback_invalid/u); }
  finally { await rm(image.root, { recursive: true, force: true }); }

  const rename = await fixture();
  try {
    const fake = statefulDockerExecutor(rename, { failOperation: 'rename' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: rename.manifest, mappingFile: rename.mappingFile, evidenceFile: rename.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'seal_current_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(error.rollback.results.some((entry) => entry.phase === 'rollback_original_start' && entry.ok));
      return true;
    });
  } finally { await rm(rename.root, { recursive: true, force: true }); }

  const create = await fixture();
  try {
    const fake = statefulDockerExecutor(create, { failOperation: 'create' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: create.manifest, mappingFile: create.mappingFile, evidenceFile: create.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'create_replacement_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(error.rollback.results.some((entry) => entry.phase === 'rollback_api_readback' && entry.ok));
      return true;
    });
  } finally { await rm(create.root, { recursive: true, force: true }); }

  const createLoss = await fixture();
  try {
    const fake = statefulDockerExecutor(createLoss, { createMode: 'response-loss' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: createLoss.manifest, mappingFile: createLoss.mappingFile, evidenceFile: createLoss.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'create_response_lost_failed');
      assert.equal(error.rollback.restored, true);
      assert.equal(error.rollback.originalRunning, true);
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_create_response_readback'));
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_replacement_remove'));
      return true;
    });
    assert.equal(createLoss.state.api.State.Running, true);
  } finally { await rm(createLoss.root, { recursive: true, force: true }); }

  const foreignCreate = await fixture();
  try {
    const fake = statefulDockerExecutor(foreignCreate, { createMode: 'foreign-response-loss' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: foreignCreate.manifest, mappingFile: foreignCreate.mappingFile, evidenceFile: foreignCreate.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.rollback.restored, false);
      assert.equal(error.rollback.originalRunning, null);
      assert.equal(error.rollback.attemptedRestart, false);
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_replacement_remove'));
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_restore_start'));
      return true;
    });
    assert.ok(fake.state.containers.has(foreignCreate.manifest.apiContainer));
  } finally { await rm(foreignCreate.root, { recursive: true, force: true }); }

  const preexistingForeign = await fixture();
  try {
    const fake = statefulDockerExecutor(preexistingForeign, { createMode: 'foreign-preexisting' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: preexistingForeign.manifest, mappingFile: preexistingForeign.mappingFile, evidenceFile: preexistingForeign.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.rollback.restored, false);
      assert.equal(error.rollback.originalRunning, null);
      assert.equal(error.rollback.attemptedRestart, false);
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_replacement_remove'));
      return true;
    });
  } finally { await rm(preexistingForeign.root, { recursive: true, force: true }); }

  const mismatchedCreate = await fixture();
  try {
    const fake = statefulDockerExecutor(mismatchedCreate, { createMode: 'mismatched-registration' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: mismatchedCreate.manifest, mappingFile: mismatchedCreate.mappingFile, evidenceFile: mismatchedCreate.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.rollback.restored, false);
      assert.equal(error.rollback.originalRunning, null);
      assert.equal(error.rollback.attemptedRestart, false);
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_replacement_remove'));
      return true;
    });
    const survivor = fake.state.containers.get(mismatchedCreate.manifest.apiContainer);
    assert.equal(envMap(survivor.Config.Env)[registrationAllowlistKey], `${'c'.repeat(64)}=other-user`);
  } finally { await rm(mismatchedCreate.root, { recursive: true, force: true }); }

  const renameLoss = await fixture();
  try {
    const fake = statefulDockerExecutor(renameLoss, { renameMode: 'response-loss' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: renameLoss.manifest, mappingFile: renameLoss.mappingFile, evidenceFile: renameLoss.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'rename_response_lost_failed');
      assert.equal(error.rollback.restored, true);
      assert.equal(error.rollback.originalRunning, true);
      assert.equal(error.rollback.attemptedRestart, true);
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_rename_current_readback'));
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_rename_sealed_readback'));
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_restore_start'));
      return true;
    });
  } finally { await rm(renameLoss.root, { recursive: true, force: true }); }

  const foreignRename = await fixture();
  try {
    const fake = statefulDockerExecutor(foreignRename, { renameMode: 'foreign-response-loss' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: foreignRename.manifest, mappingFile: foreignRename.mappingFile, evidenceFile: foreignRename.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.rollback.restored, false);
      assert.equal(error.rollback.originalRunning, null);
      assert.equal(error.rollback.attemptedRestart, false);
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_restore_rename'));
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_restore_start'));
      return true;
    });
    assert.ok(fake.state.containers.has(foreignRename.manifest.apiContainer));
    assert.ok(fake.state.containers.has(`${foreignRename.manifest.apiContainer}-google-registration-rollback-${revision.slice(0, 12)}`));
  } finally { await rm(foreignRename.root, { recursive: true, force: true }); }

  const evidence = await fixture();
  try {
    await writeFile(evidence.evidenceFile, '{"existing":true}\n', { mode: 0o600 });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: evidence.manifest, mappingFile: evidence.mappingFile, evidenceFile: evidence.evidenceFile, command: statefulDockerExecutor(evidence).command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /evidence_already_exists/u);
    assert.equal(await readFile(evidence.envFile, 'utf8'), envContent());
  } finally { await rm(evidence.root, { recursive: true, force: true }); }

  const unsafeParent = await fixture();
  try {
    const directory = join(unsafeParent.root, 'unsafe-evidence-parent');
    await mkdir(directory, { mode: 0o755 });
    unsafeParent.evidenceFile = join(directory, 'evidence.json');
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: unsafeParent.manifest, mappingFile: unsafeParent.mappingFile, evidenceFile: unsafeParent.evidenceFile, command: statefulDockerExecutor(unsafeParent).command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /evidence_parent_unsafe/u);
    assert.equal(await readFile(unsafeParent.envFile, 'utf8'), envContent());
  } finally { await rm(unsafeParent.root, { recursive: true, force: true }); }
});

test('stop fail-before and response-loss-after-stop are recovered from real state readback', async () => {
  const failBefore = await fixture();
  try {
    const fake = statefulDockerExecutor(failBefore, { stopMode: 'fail-before' });
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
    const fake = statefulDockerExecutor(responseLoss, { stopMode: 'response-loss', failOperation: 'create' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: responseLoss.manifest, mappingFile: responseLoss.mappingFile, evidenceFile: responseLoss.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'create_replacement_api_failed');
      assert.equal(error.rollback.restored, true);
      assert.ok(error.rollback.results.some((entry) => entry.phase === 'rollback_api_readback' && entry.ok));
      return true;
    });
    assert.equal(responseLoss.state.api.State.Running, true);
    assert.ok(fake.calls.some((call) => call.phase === 'stop_state_readback'));
  } finally { await rm(responseLoss.root, { recursive: true, force: true }); }

  const inspectFailure = await fixture();
  try {
    const fake = statefulDockerExecutor(inspectFailure, { stopMode: 'unknown-inspect' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: inspectFailure.manifest, mappingFile: inspectFailure.mappingFile, evidenceFile: inspectFailure.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.code, 'stop_response_lost_failed');
      assert.equal(error.rollback.restored, true);
      assert.equal(error.rollback.originalRunning, true);
      assert.equal(error.rollback.attemptedRestart, true);
      assert.ok(fake.calls.some((call) => call.phase === 'stop_state_readback'));
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_original_start'));
      assert.ok(fake.calls.some((call) => call.phase === 'rollback_original_readback'));
      return true;
    });
  } finally { await rm(inspectFailure.root, { recursive: true, force: true }); }

  const noRecovery = await fixture();
  try {
    const fake = statefulDockerExecutor(noRecovery, { stopMode: 'unknown-inspect-no-recovery' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: noRecovery.manifest, mappingFile: noRecovery.mappingFile, evidenceFile: noRecovery.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.rollback.restored, false);
      assert.equal(error.rollback.originalRunning, null);
      assert.equal(error.rollback.attemptedRestart, false);
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_original_start'));
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_original_readback'));
      return true;
    });
  } finally { await rm(noRecovery.root, { recursive: true, force: true }); }

  const foreignIdentity = await fixture();
  try {
    const fake = statefulDockerExecutor(foreignIdentity, { stopMode: 'foreign-inspect' });
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: foreignIdentity.manifest, mappingFile: foreignIdentity.mappingFile, evidenceFile: foreignIdentity.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), (error) => {
      assert.equal(error.rollback.restored, false);
      assert.equal(error.rollback.originalRunning, null);
      assert.equal(error.rollback.attemptedRestart, false);
      assert.ok(!fake.calls.some((call) => call.phase === 'rollback_original_start'));
      return true;
    });
    assert.equal(fake.state.containers.get(foreignIdentity.manifest.apiContainer).Id, 'f'.repeat(64));
  } finally { await rm(foreignIdentity.root, { recursive: true, force: true }); }
});

test('resource and env ownership drift fail closed without overwriting concurrent bytes', async () => {
  for (const option of [{ driftHealth: true }, { driftMemory: true }, { driftMaskedPaths: true }]) {
    const fx = await fixture();
    try {
      const fake = statefulDockerExecutor(fx, option);
      await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: fx.manifest, mappingFile: fx.mappingFile, evidenceFile: fx.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /replacement_config_drift/u);
      assert.equal(await readFile(fx.envFile, 'utf8'), envContent());
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  for (const createMutation of ['user-root', 'remove-group', 'remove-mount', 'wrong-mount', 'security-drift', 'memory-drift']) {
    const fx = await fixture();
    try {
      const fake = statefulDockerExecutor(fx, { createMutation });
      await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: fx.manifest, mappingFile: fx.mappingFile, evidenceFile: fx.evidenceFile, command: fake.command, commandEnv: { STAGING_GOOGLE_REGISTRATION_EXECUTE: '1', STAGING_GOOGLE_REGISTRATION_CONFIRM: revision }, execute: true }), /replacement_config_drift/u);
      assert.equal(fx.state.api.State.Running, true);
      assert.equal(await readFile(fx.envFile, 'utf8'), envContent());
    } finally { await rm(fx.root, { recursive: true, force: true }); }
  }
  const missingRw = await fixture();
  try {
    const originalMount = missingRw.api.Mounts[0];
    delete originalMount.RW;
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: missingRw.manifest, mappingFile: missingRw.mappingFile, command: statefulDockerExecutor(missingRw).command }), /mount_readback_invalid/u);
  } finally { await rm(missingRw.root, { recursive: true, force: true }); }
  const owner = await fixture();
  try {
    owner.manifest.envUid = (process.getuid?.() ?? 0) + 1;
    await assert.rejects(runStagingGoogleRegistrationEnable({ manifest: owner.manifest, mappingFile: owner.mappingFile, command: statefulDockerExecutor(owner).command }), /env_file_metadata_invalid/u);
  } finally { await rm(owner.root, { recursive: true, force: true }); }
});

test('sanitized failure output contains no mapping material', () => {
  const output = sanitizeGoogleRegistrationEnableError({ code: 'registration_config_readback_invalid', rollback: { restored: false, results: [{ phase: 'rollback_env_restore', ok: false, code: 'env_restore_failed', secret: mappingLine() }] } });
  assert.deepEqual(output, { status: 'failed', code: 'registration_config_readback_invalid', rollback: { restored: false, originalRunning: null, attemptedRestart: false, results: [{ phase: 'rollback_env_restore', ok: false, code: 'env_restore_failed' }] } });
  assert.equal(JSON.stringify(output).includes(mappingLine()), false);
});
