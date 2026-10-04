import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deriveProtectedEnvironmentScryptDigest,
  assertGreenPasswordEnrollmentActivationManifest } from '../ops/green_password_enrollment_activation.mjs';
import { greenPasswordEnrollmentCommandRequest,
  GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT } from '../ops/green_password_enrollment_activation_cli.mjs';
import { buildGreenEnrollmentPretransitionManifest, runGreenEnrollmentPretransition,
  GREEN_ENROLLMENT_PRETRANSITION_CONFIRMATION, GREEN_ENROLLMENT_PRETRANSITION_PROBE,
  runGreenEnrollmentPretransitionCli, GREEN_ENROLLMENT_PREPARATION_CONFIRMATION,
} from '../ops/green_enrollment_pretransition.mjs';
import { buildGreenEnrollmentActivationManifest, GREEN_ENROLLMENT_MANIFEST_CONFIRMATION,
} from '../ops/green_enrollment_activation_manifest.mjs';
import { privateJson, publishPrivateJson, publishPrivateJsonSet } from '../ops/green_enrollment_guarded_io.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const source = 'a'.repeat(40); const revision = 'b'.repeat(40);
const originalId = 'c'.repeat(64); const candidateId = 'd'.repeat(64);
const imageId = `sha256:${'e'.repeat(64)}`; const targetId = `sha256:${'f'.repeat(64)}`;
const image = `registry.example/sit:${revision}`;
const netId = '1'.repeat(64); const egressId = '2'.repeat(64);
const now = Date.parse('2026-10-04T10:00:00.000Z');
const flag = 'SIT_STAGING_PASSWORD_ENROLLMENT_ENABLED';
const invitationFileFlag = 'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS_FILE';
const inlineFlag = 'SIT_STAGING_PASSWORD_ENROLLMENT_INVITATIONS';
const envBytes = (env) => Buffer.from(`${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value)}\n`);
const queue = { dead: 0, pending: 0, processing: 0, retry: 0, sentInApp: 3, sentPush: 2,
  suppressedEmail: 5, suppressedPush: 7 };
function fixture(t, explicit = false) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-w12-preparation-')));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    NODE_ENV: 'production', DEPLOYMENT_ENVIRONMENT: 'test', PAYMENT_TRANSPORT: 'memory',
    STRIPE_LIVEMODE: 'false', PUBLIC_BASE_URL: 'https://staging.shareittoo.com/api/v1',
    PUSH_TRANSPORT: 'memory', IDENTITY_VERIFICATION_TRANSPORT: 'memory',
    SIT_LISTING_AI_PROVIDER: 'on_device', SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: '0',
    SIT_LISTING_AI_BUDGET_CENTS: '0', PRIVATE_PILOT_V4_ENABLED: 'true',
    SIT_STAGING_ACCESS_GATE_ENABLED: 'true', FIREBASE_AUTH_ENABLED: 'true',
    FIREBASE_PHONE_VERIFICATION_ENABLED: 'false', SIT_STAGING_GOOGLE_REGISTRATION_ENABLED: 'false',
    SIT_STAGING_GOOGLE_REGISTRATION_ALLOWLIST: '', APP_PUBLIC_URL: 'http://shareittoo-staging-api:8080',
    MAIL_TRANSPORT: 'memory', SIT_STAGING_ALLOWED_USER_IDS: 'w12-existing',
    SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: 'w12-existing',
    SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: 'existing@example.test',
    SMTP_HOST: 'smtp.internal', SMTP_PORT: '25', SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'true',
    SMTP_USER: '', [['SMTP', 'PASS', 'WORD'].join('_').replace('PASS_WORD', 'PASSWORD')]: '',
    MAIL_FROM: 'SIT <contact@example.test>', MAIL_REPLY_TO: 'contact@example.test',
    APP_COMMIT: revision, APP_VERSION: '1.2.3+2026100401', APP_BUILD_TIME: '2026-10-04T09:00:00Z',
  };
  if (explicit) Object.assign(env, { [flag]: 'false', [invitationFileFlag]: '', [inlineFlag]: '' });
  const proposed = { ...env, [flag]: 'false', [invitationFileFlag]: '', [inlineFlag]: '' };
  for (const key of ['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME']) delete proposed[key];
  const environmentFile = path.join(root, 'pretransition.env');
  fs.writeFileSync(environmentFile, envBytes(proposed), { mode: 0o600 });
  const mounts = [
    { Type: 'bind', Name: null, Source: path.join(root, 'mfa.key'), Destination: '/run/secrets/mfa-encryption-key', RW: false },
    { Type: 'bind', Name: null, Source: path.join(root, 'firebase.json'), Destination: '/run/secrets/firebase-service-account.json', RW: false },
    { Type: 'volume', Name: 'sit-w12-uploads', Source: '/var/lib/docker/volumes/sit-w12-uploads/_data', Destination: '/data/uploads', RW: true },
  ];
  const container = { Id: originalId, Name: '/shareittoo-staging-api', Image: imageId,
    State: { Running: true }, Config: { Image: image, User: 'shareittoo', WorkingDir: '/app',
      Hostname: originalId.slice(0, 12), Entrypoint: null, Cmd: ['node', 'src/server.js'],
      Labels: { 'com.shareittoo.sit.green': 'true' }, Env: Object.entries(env).map(([k, v]) => `${k}=${v}`) },
    HostConfig: { Binds: ['synthetic-original-mount-transport'], NetworkMode: 'sit-green', PortBindings: {},
      RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 }, SecurityOpt: ['no-new-privileges'],
      ReadonlyRootfs: true, CapDrop: ['ALL'], Memory: 134217728, PidsLimit: 256 },
    Mounts: mounts, NetworkSettings: { Ports: {}, Networks: {
      'sit-green': { NetworkID: netId }, 'sit-egress': { NetworkID: egressId },
    } } };
  const currentImage = { Id: imageId, RepoDigests: [`registry.example/sit@${imageId}`],
    Config: { User: 'shareittoo', Labels: { 'org.opencontainers.image.revision': revision } } };
  const probe = { queue, live: 200, ready: 200, mail: 'ok', commit: revision,
    version: env.APP_VERSION, enrollment: explicit ? 'false' : null };
  const input = { operationId: '3'.repeat(32), sourceCommit: source,
    currentImageDigest: imageId, currentEnvironmentScryptSalt: hash('original salt'),
    network: 'sit-green', networkId: netId, providerNetwork: 'sit-egress', providerNetworkId: egressId,
    environmentFile, environmentUid: process.getuid(), environmentGid: process.getgid(),
    environmentScryptSalt: hash('pretransition salt'),
    environmentScryptDigest: deriveProtectedEnvironmentScryptDigest(envBytes(proposed), hash('pretransition salt')),
    lockFile: path.join(root, 'pretransition.lock'), evidenceFile: path.join(root, 'pretransition-proof.json') };
  const manifest = buildGreenEnrollmentPretransitionManifest({ currentState: { container, image: currentImage, probe }, input });
  return { root, env, proposed, manifest, container, currentImage, probe, input };
}
function confirmations(state) {
  return { execute: GREEN_ENROLLMENT_PRETRANSITION_CONFIRMATION,
    sourceCommit: source, currentContainerId: originalId, operationId: state.manifest.operationId };
}

function harness(state, faults = {}) {
  const records = new Map([[originalId, structuredClone(state.container)]]);
  const calls = []; const mutations = []; let imageReads = 0; let rollback = false;
  const command = async (executable, args, options) => {
    const request = greenPasswordEnrollmentCommandRequest(executable, args, options.cwd);
    calls.push(request);
    const result = (stdout = '', status = 0) => ({ ...request, status, stdout });
    if (executable === 'git') {
      if (args.join(' ') === 'rev-parse --show-toplevel') return result(`${GREEN_PASSWORD_ENROLLMENT_REPOSITORY_ROOT}\n`);
      if (args.join(' ') === 'rev-parse HEAD') return result(`${source}\n`);
      if (args[0] === 'diff' || args[0] === 'ls-files' || args[0] === '--version') return result();
      throw new Error('unexpected git command');
    }
    assert.equal(executable, 'docker');
    if (args[0] === '--version') return result('Docker synthetic\n');
    const find = (identity) => records.get(identity) ?? [...records.values()].find((v) => v.Name === `/${identity}`);
    if (args[0] === 'container' && args[1] === 'inspect') {
      const identity = args.at(-1); let record = find(identity);
      if (faults.replaceBeforeRemoval && rollback && record?.Id === candidateId) {
        record.Config.Labels['com.shareittoo.w12-pretransition'] = 'foreign-owner';
      }
      if (faults.originalDrift && identity === originalId && mutations.length === 0) {
        record.Config.Env.push('UNEXPECTED=changed');
      }
      if (faults.rollbackReadback && rollback && identity === originalId) return result('', 1);
      return record ? result(JSON.stringify(record)) : result('', 1);
    }
    if (args[0] === 'container' && args[1] === 'ls') {
      const filter = args[args.indexOf('--filter') + 1];
      const record = filter.startsWith('id=') ? records.get(filter.slice(3))
        : find(filter.slice('name=^/'.length, -1));
      return result(record ? `${record.Id}\n` : '');
    }
    if (args[0] === 'image') {
      imageReads += 1;
      if (args.at(-1) === targetId) return result(JSON.stringify({ Id: targetId,
        RepoDigests: [`registry.example/sit@${targetId}`], Config: { User: 'shareittoo',
          Env: [`APP_COMMIT=${source}`, `APP_VERSION=${faults.targetVersionDrift ? '9.9.9+1' : '1.2.3+2026100402'}`],
          Labels: { 'org.opencontainers.image.revision': source,
            'org.opencontainers.image.version': '1.2.3+2026100402' } } }));
      const value = structuredClone(state.currentImage);
      if (faults.tagDrift && imageReads >= faults.tagDrift) value.Id = targetId;
      return result(JSON.stringify(value));
    }
    if (args[0] === 'network' && args[1] === 'inspect') {
      const internal = args.at(-1) === netId;
      return result(JSON.stringify({ Id: internal ? netId : egressId,
        Name: internal ? 'sit-green' : 'sit-egress', Internal: internal }));
    }
    if (args[0] === 'exec') {
      const record = find(args.find((v) => /^[a-f0-9]{64}$/u.test(v)));
      if (!record?.State.Running) return result('', 1);
      if (faults.candidateProbe && record.Id === candidateId) { rollback = true; return result('', 1); }
      if (args.at(-1) === GREEN_ENROLLMENT_PRETRANSITION_PROBE) {
        const explicit = record.Config.Env.includes(`${flag}=false`);
        return result(JSON.stringify({ ...state.probe, enrollment: explicit ? 'false' : null }));
      }
      if (args.at(-1).includes('const get = async (route)')) return result(JSON.stringify({
        commit: revision, deploymentEnvironment: 'test', firebaseAuthEnabled: true,
        firebasePhoneEnabled: false, googleRegistrationEnabled: false, liveStatus: 200,
        mailStatus: 'ok', passwordEnrollmentEnabled: false, paymentTransport: 'memory',
        readyStatus: 200, stripeLivemode: false,
      }));
      if (args.at(-1).includes('pool.query')) return result(JSON.stringify(queue));
      throw new Error('unexpected probe');
    }
    if (args[0] === 'run') {
      assert.ok(args.includes('--read-only')); assert.ok(args.includes('none'));
      return result(JSON.stringify({ uid: process.getuid(), gid: process.getgid(), user: 'shareittoo',
        readable: true, writable: false, sha256: state.spec.registrySha256 }));
    }
    mutations.push([...args]);
    const phase = args[0] === 'network' ? 'connect' : args[0];
    if (faults.fail === phase) { rollback = true; return result('', 1); }
    if (phase === 'create') {
      const supported = new Set(['--pull', '--name', '--env-file', '--restart', '--user', '--workdir',
        '--security-opt', '--cap-drop', '--memory', '--pids-limit', '--label', '--mount', '--network']);
      for (let i = 1; i < args.length && args[i].startsWith('--'); i += 1) {
        if (args[i] === '--read-only') continue;
        assert.ok(supported.has(args[i]), `unmodeled create option ${args[i]}`); i += 1;
      }
      assert.ok(args.includes('--read-only')); assert.ok(args.includes('134217728'));
      assert.equal(args[args.indexOf('--pull') + 1], 'never');
      const record = structuredClone(state.container);
      record.Id = candidateId; record.Name = `/${args[args.indexOf('--name') + 1]}`;
      record.State.Running = false; record.Config.Hostname = candidateId.slice(0, 12);
      record.Config.Env = Object.entries({ ...state.proposed, APP_COMMIT: revision,
        APP_VERSION: state.env.APP_VERSION, APP_BUILD_TIME: state.env.APP_BUILD_TIME })
        .map(([key, value]) => `${key}=${value}`);
      record.Config.Labels['com.shareittoo.w12-pretransition'] = state.manifest.operationId;
      record.HostConfig.Binds = null;
      record.HostConfig.Mounts = state.container.Mounts.map((mount) => ({ Type: mount.Type,
        Source: mount.Type === 'volume' ? mount.Name : mount.Source, Target: mount.Destination,
        ReadOnly: mount.RW === false }));
      record.NetworkSettings.Networks = { 'sit-green': { NetworkID: netId } };
      if (faults.candidateDrift) record.HostConfig.Memory += 1;
      records.set(candidateId, record);
    } else if (phase === 'connect') find(args.at(-1)).NetworkSettings.Networks['sit-egress'] = { NetworkID: egressId };
    else if (phase === 'stop') find(args.at(-1)).State.Running = false;
    else if (phase === 'rename') {
      if (find(args[2])) return result('', 1);
      find(args[1]).Name = `/${args[2]}`;
    } else if (phase === 'start') {
      if (faults.failCandidateStart && args[1] === candidateId) { rollback = true; return result('', 1); }
      find(args[1]).State.Running = true;
    } else if (phase === 'rm') records.delete(args.at(-1));
    else throw new Error(`unexpected mutation ${phase}`);
    if (faults.responseLoss?.includes(phase)) return result('', 125);
    return result(phase === 'create' ? candidateId : ['stop', 'start', 'rm'].includes(phase) ? args.at(-1) : '');
  };
  return { command, records, calls, mutations };
}

test('pretransition dry-run is read-only and secret-free', async (t) => {
  const state = fixture(t); const h = harness(state);
  const result = await runGreenEnrollmentPretransition({ manifest: state.manifest, command: h.command });
  assert.equal(result.status, 'dry-run'); assert.equal(result.requiresPretransition, true);
  assert.equal(h.mutations.length, 0); assert.equal(fs.existsSync(state.manifest.lockFile), false);
  assert.ok(!JSON.stringify(result).includes('existing@example.test'));
  assert.ok(h.calls.every((call) => ['docker', 'git'].includes(call.executable)));
});
test('exact execute confirmation is mandatory before any command', async (t) => {
  const state = fixture(t); const h = harness(state);
  await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: {}, command: h.command }), /green_enrollment_preparation_denied/u);
  assert.equal(h.calls.length, 0);
});
test('same-image explicit-false transition preserves original and exact resource configuration', async (t) => {
  const state = fixture(t); const h = harness(state);
  const result = await runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} });
  assert.equal(result.status, 'pretransition-verified');
  assert.equal(h.records.get(originalId).State.Running, false);
  assert.equal(h.records.get(candidateId).State.Running, true);
  assert.equal(h.records.get(candidateId).Name, '/shareittoo-staging-api');
  assert.equal(h.records.get(candidateId).HostConfig.Memory, 134217728);
  assert.equal(privateJson(state.manifest.evidenceFile).value.candidateContainerId, candidateId);
  assert.ok(h.mutations.findIndex((args) => args[0] === 'create')
    < h.mutations.findIndex((args) => args[0] === 'stop'));
});
test('response loss on all forward mutations converges without retry', async (t) => {
  const state = fixture(t); const h = harness(state, { responseLoss: ['create', 'connect', 'stop', 'rename', 'start'] });
  const result = await runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} });
  assert.equal(result.status, 'pretransition-verified');
  assert.equal(h.mutations.filter((args) => args[0] === 'create').length, 1);
  assert.equal(new Set(h.mutations.map(JSON.stringify)).size, h.mutations.length);
});
for (const fault of [{ originalDrift: true }, { tagDrift: 2 }]) {
  test(`pre-mutation drift fails closed ${JSON.stringify(fault)}`, async (t) => {
    const state = fixture(t); const h = harness(state, fault);
    await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
      execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} }));
    assert.equal(h.mutations.length, 0); assert.equal(h.records.get(originalId).State.Running, true);
  });
}
test('post-create tag drift never attaches or starts and removes only owned candidate', async (t) => {
  const state = fixture(t); const h = harness(state, { tagDrift: 3 });
  await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} }),
  (error) => error.state === 'failed-original-restored');
  assert.deepEqual(h.mutations.map((args) => args[0]), ['create', 'rm']);
});
test('candidate configuration drift is neither started nor removed by guess', async (t) => {
  const state = fixture(t); const h = harness(state, { candidateDrift: true });
  await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} }),
  (error) => error.state === 'rollback-unconfirmed');
  assert.deepEqual(h.mutations.map((args) => args[0]), ['create']);
  assert.equal(h.records.get(originalId).State.Running, true);
});
for (const fault of [{ fail: 'connect' }, { failCandidateStart: true }, { candidateProbe: true,
  responseLoss: ['rm', 'rename', 'start'] }]) {
  test(`partial failure restores original ${JSON.stringify(fault)}`, async (t) => {
    const state = fixture(t); const h = harness(state, fault);
    await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
      execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} }),
    (error) => error.state === 'failed-original-restored');
    assert.equal(h.records.has(candidateId), false);
    assert.equal(h.records.get(originalId).State.Running, true);
    assert.equal(h.records.get(originalId).Name, '/shareittoo-staging-api');
    assert.equal(h.mutations.filter((args) => args[0] === 'create').length, 1);
  });
}
test('ownership replacement before removal is refused', async (t) => {
  const state = fixture(t); const h = harness(state, { candidateProbe: true, replaceBeforeRemoval: true });
  await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} }),
  (error) => error.state === 'rollback-unconfirmed');
  assert.equal(h.mutations.some((args) => args[0] === 'rm'), false);
});
test('rollback readback uncertainty stays explicit and never claims restoration', async (t) => {
  const state = fixture(t); const h = harness(state, { candidateProbe: true, rollbackReadback: true });
  await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command, wait: async () => {} }),
  (error) => error.state === 'rollback-unconfirmed');
  assert.equal(h.mutations.filter((args) => args[0] === 'start' && args[1] === originalId).length, 0);
});
test('environment bytes changing after manifest binding fail before mutation', async (t) => {
  const state = fixture(t); fs.appendFileSync(state.manifest.environmentFile, 'EXTRA=changed\n');
  const h = harness(state);
  await assert.rejects(runGreenEnrollmentPretransition({ manifest: state.manifest,
    execute: true, confirmations: confirmations(state), command: h.command }));
  assert.equal(h.mutations.length, 0);
});
test('publication is exclusive, private, and rejects symlink parents', (t) => {
  const state = fixture(t); const output = path.join(state.root, 'output.json');
  publishPrivateJson(output, { status: 'safe' });
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.throws(() => publishPrivateJson(output, { status: 'overwrite' }));
  assert.deepEqual(privateJson(output).value, { status: 'safe' });
  fs.symlinkSync(state.root, path.join(state.root, 'symlink'));
  assert.throws(() => publishPrivateJson(path.join(state.root, 'symlink', 'bad.json'), {}));
});

function preparationSpec(state) {
  const specFile = path.join(state.root, 'preparation-spec.json');
  const spec = { schemaVersion: 1, input: state.input, currentContainerId: originalId,
    manifestFile: path.join(state.root, 'pretransition-manifest.json') };
  fs.writeFileSync(specFile, jsonBytes(spec), { mode: 0o600 });
  return { specFile, spec };
}
test('preparation CLI defaults to read-only, then publishes consumer-compatible protected manifest', async (t) => {
  const state = fixture(t); const h = harness(state); const { specFile, spec } = preparationSpec(state);
  const preview = await runGreenEnrollmentPretransitionCli(['--prepare-spec', specFile], { command: h.command });
  assert.equal(preview.status, 'dry-run'); assert.equal(fs.existsSync(spec.manifestFile), false);
  assert.equal(h.mutations.length, 0);
  const result = await runGreenEnrollmentPretransitionCli(['--prepare-spec', specFile, '--execute',
    '--confirm-execute', GREEN_ENROLLMENT_PREPARATION_CONFIRMATION], { command: h.command });
  assert.equal(result.status, 'created');
  assert.equal(privateJson(spec.manifestFile).sha256, result.manifestSha256);
  assert.deepEqual(privateJson(spec.manifestFile).value, state.manifest);
  assert.equal(fs.statSync(spec.manifestFile).mode & 0o777, 0o600);
  assert.equal(h.mutations.length, 0);
  assert.ok(!JSON.stringify(result).includes('existing@example.test'));
  assert.ok(!JSON.stringify(result).includes('SMTP_'));
  const executePreview = await runGreenEnrollmentPretransitionCli(['--manifest', spec.manifestFile], { command: h.command });
  assert.equal(executePreview.status, 'dry-run');
});
test('preparation CLI rejects malformed, duplicate, mixed and unauthorized arguments before commands', async (t) => {
  const state = fixture(t); const h = harness(state); const { specFile } = preparationSpec(state);
  for (const args of [[], ['--prepare-spec'], ['--prepare-spec', 'relative.json'],
    ['--prepare-spec', specFile, '--prepare-spec', specFile],
    ['--prepare-spec', specFile, '--manifest', specFile],
    ['--prepare-spec', specFile, '--confirm-source', source],
    ['--prepare-spec', specFile, '--execute'],
    ['--prepare-spec', specFile, '--confirm-execute', GREEN_ENROLLMENT_PREPARATION_CONFIRMATION],
    ['--prepare-spec', specFile, '--execute', '--execute'],
    ['--prepare-spec', specFile, '--email', 'new@example.test'],
  ]) await assert.rejects(runGreenEnrollmentPretransitionCli(args, { command: h.command }));
  assert.equal(h.calls.length, 0);
});
test('preparation CLI rejects noncanonical, public-mode and symlink specs', async (t) => {
  const state = fixture(t); const h = harness(state); const { specFile, spec } = preparationSpec(state);
  const args = ['--prepare-spec', specFile];
  fs.chmodSync(specFile, 0o644);
  await assert.rejects(runGreenEnrollmentPretransitionCli(args, { command: h.command }));
  fs.chmodSync(specFile, 0o600); fs.writeFileSync(specFile, JSON.stringify(spec));
  await assert.rejects(runGreenEnrollmentPretransitionCli(args, { command: h.command }));
  const link = path.join(state.root, 'spec-link.json'); fs.symlinkSync(specFile, link);
  await assert.rejects(runGreenEnrollmentPretransitionCli(['--prepare-spec', link], { command: h.command }));
  assert.equal(h.calls.length, 0);
});
test('preparation read-response loss and mid-read environment replacement never publish', async (t) => {
  for (const fault of ['loss', 'replacement']) {
    const state = fixture(t); const h = harness(state); const { specFile, spec } = preparationSpec(state);
    let happened = false;
    const command = async (executable, args, options) => {
      const result = await h.command(executable, args, options);
      if (!happened && args[0] === 'exec') {
        happened = true;
        if (fault === 'loss') return { ...result, status: 125, stdout: '' };
        fs.writeFileSync(state.manifest.environmentFile, envBytes({ ...state.proposed, EXTRA: 'swapped' }));
      }
      return result;
    };
    await assert.rejects(runGreenEnrollmentPretransitionCli(['--prepare-spec', specFile, '--execute',
      '--confirm-execute', GREEN_ENROLLMENT_PREPARATION_CONFIRMATION], { command }));
    assert.equal(fs.existsSync(spec.manifestFile), false); assert.equal(h.mutations.length, 0);
  }
});
test('preparation partial write and output inode substitution preserve evidence and signal uncertainty', async (t) => {
  for (const fault of ['partial', 'replacement']) {
    const state = fixture(t); const h = harness(state); const { specFile, spec } = preparationSpec(state);
    let wrote = false;
    const publicationFileSystem = Object.create(fs);
    publicationFileSystem.writeSync = (fd, bytes, offset, length, position) => {
      if (fault === 'partial') {
        if (wrote) throw new Error('synthetic private failure');
        wrote = true; return fs.writeSync(fd, bytes, offset, 1, position);
      }
      const written = fs.writeSync(fd, bytes, offset, length, position);
      fs.renameSync(spec.manifestFile, `${spec.manifestFile}.retained`);
      fs.writeFileSync(spec.manifestFile, jsonBytes({ foreign: true }), { mode: 0o600 });
      return written;
    };
    await assert.rejects(runGreenEnrollmentPretransitionCli(['--prepare-spec', specFile, '--execute',
      '--confirm-execute', GREEN_ENROLLMENT_PREPARATION_CONFIRMATION],
    { command: h.command, publicationFileSystem }), (error) => {
      assert.equal(error.message, 'green_enrollment_preparation_denied');
      return error.state === 'publication-unconfirmed';
    });
    assert.equal(h.mutations.length, 0);
    assert.equal(fs.existsSync(spec.manifestFile), true);
    if (fault === 'replacement') assert.deepEqual(privateJson(spec.manifestFile).value, { foreign: true });
  }
});

function manifestFixture(t) {
  const state = fixture(t, true); const uid = process.getuid(); const gid = process.getgid();
  const proposed = { ...state.proposed, [flag]: 'true',
    [invitationFileFlag]: '/run/secrets/staging-password-enrollment-registry.json',
    APP_PUBLIC_URL: 'https://staging.shareittoo.com', MAIL_TRANSPORT: 'smtp',
    SIT_STAGING_ALLOWED_USER_IDS: 'w12-existing,w12-new',
    SIT_STAGING_NOTIFICATION_ALLOWED_USER_IDS: 'w12-existing,w12-new',
    SIT_STAGING_NOTIFICATION_ALLOWED_EMAILS: 'existing@example.test,new@example.test' };
  const request = { email: 'new@example.test', ttlSeconds: 86400, userId: 'w12-new' };
  const verifier = hash('synthetic invitation verifier');
  const registry = [{ emailDigest: hash(`${verifier}\n${request.email}`),
    expiresAt: new Date(now + 86399000).toISOString(), issuedAt: new Date(now - 1000).toISOString(),
    tokenDigest: verifier, userId: request.userId }];
  const spec = { sourceCommit: source, sourceVersion: '1.2.3+2026100402', currentContainerId: originalId,
    currentImageDigest: imageId, targetImage: `registry.example/sit:${source}`,
    targetImageId: targetId, targetImageDigest: targetId, network: 'sit-green', networkId: netId,
    providerNetwork: 'sit-egress', providerNetworkId: egressId,
    environmentUid: uid, environmentGid: gid, environmentScryptSalt: hash('activation salt'),
    environmentScryptDigest: deriveProtectedEnvironmentScryptDigest(envBytes(proposed), hash('activation salt')),
    registryUid: uid, registryGid: gid, registrySha256: hash(jsonBytes(registry)) };
  for (const key of ['environment', 'registry', 'backup', 'evidence', 'lock', 'request', 'allowlist',
    'runtimeIdentity', 'manifest', 'bindings']) spec[`${key}File`] = path.join(state.root, `${key}.json`);
  fs.writeFileSync(spec.environmentFile, envBytes(proposed), { mode: 0o600 });
  for (const [key, value] of Object.entries({ registry, request,
    allowlist: { allowedUserIds: ['w12-existing', 'w12-new'], schema: 'sit-staging-access-allowlist', version: 1 },
    runtimeIdentity: { gid, schema: 'sit-staging-runtime-identity-readback', uid, version: 1 },
  })) fs.writeFileSync(spec[`${key}File`], jsonBytes(value), { mode: 0o600 });
  state.spec = spec; return state;
}
test('real producer output passes unchanged activation manifest validator and binds artifacts', async (t) => {
  const state = manifestFixture(t); const h = harness(state);
  const result = await buildGreenEnrollmentActivationManifest({ spec: state.spec,
    execute: true, confirmation: GREEN_ENROLLMENT_MANIFEST_CONFIRMATION, command: h.command, now });
  assert.equal(result.status, 'created');
  const manifest = privateJson(state.spec.manifestFile);
  assertGreenPasswordEnrollmentActivationManifest(manifest.value);
  const bindings = privateJson(state.spec.bindingsFile).value;
  assert.equal(bindings.manifestSha256, manifest.sha256);
  assert.equal(bindings.manifestSha256, result.manifestSha256);
  assert.deepEqual(bindings.queue, queue);
  assert.equal(bindings.artifacts.request.sha256, privateJson(state.spec.requestFile).sha256);
  assert.deepEqual(bindings.activationArguments, result.activationArguments);
  assert.ok(!JSON.stringify(bindings).includes('new@example.test'));
  assert.equal(h.mutations.length, 0);
});
test('producer defaults to dry run without publishing manifest', async (t) => {
  const state = manifestFixture(t); const h = harness(state);
  const result = await buildGreenEnrollmentActivationManifest({ spec: state.spec, command: h.command, now });
  assert.equal(result.status, 'dry-run'); assert.equal(fs.existsSync(state.spec.manifestFile), false);
});
test('producer independently binds target image version to final source candidate', async (t) => {
  const state = manifestFixture(t); const h = harness(state, { targetVersionDrift: true });
  await assert.rejects(buildGreenEnrollmentActivationManifest({ spec: state.spec, command: h.command, now }));
  assert.equal(fs.existsSync(state.spec.manifestFile), false);
});
test('producer rejects omitted pretransition, stale queue and request/allowlist/UID mismatch', async (t) => {
  for (const fault of ['pretransition', 'queue', 'request', 'allowlist', 'identity']) {
    const state = manifestFixture(t);
    if (fault === 'pretransition') state.container.Config.Env = state.container.Config.Env.filter((v) => !v.startsWith(`${flag}=`));
    if (fault === 'queue') state.probe.queue = { ...queue, pending: 1 };
    const field = { request: 'userId', allowlist: 'allowedUserIds', identity: 'uid' }[fault];
    if (field) {
      const file = state.spec[`${fault === 'identity' ? 'runtimeIdentity' : fault}File`];
      const value = privateJson(file).value; value[field] = field === 'uid' ? 9876 : 'mismatch';
      fs.writeFileSync(file, jsonBytes(value));
    }
    const h = harness(state);
    await assert.rejects(buildGreenEnrollmentActivationManifest({ spec: state.spec, command: h.command, now }), fault);
    assert.equal(fs.existsSync(state.spec.manifestFile), false);
  }
});
test('pre-existing bindings deny the whole output set without publishing a manifest', async (t) => {
  const state = manifestFixture(t); const h = harness(state);
  fs.writeFileSync(state.spec.bindingsFile, jsonBytes({ preserve: true }), { mode: 0o600 });
  await assert.rejects(buildGreenEnrollmentActivationManifest({ spec: state.spec,
    execute: true, confirmation: GREEN_ENROLLMENT_MANIFEST_CONFIRMATION, command: h.command, now }),
  (error) => error.state === 'denied');
  assert.equal(fs.existsSync(state.spec.manifestFile), false);
  assert.deepEqual(privateJson(state.spec.bindingsFile).value, { preserve: true });
});
test('output-set preflight binds both parents before any file creation', (t) => {
  const state = fixture(t); const first = path.join(state.root, 'first.json');
  const publicParent = path.join(state.root, 'public'); fs.mkdirSync(publicParent, { mode: 0o755 });
  const second = path.join(publicParent, 'second.json');
  assert.throws(() => publishPrivateJsonSet([
    { file: first, value: { first: true } }, { file: second, value: { second: true } },
  ]), (error) => error.state === 'denied');
  assert.equal(fs.existsSync(first), false); assert.equal(fs.existsSync(second), false);
});
test('foreign second output appearing during first publication is preserved with explicit uncertainty', (t) => {
  const state = fixture(t); const first = path.join(state.root, 'first.json');
  const second = path.join(state.root, 'second.json'); let raced = false;
  const fileSystem = Object.create(fs);
  fileSystem.writeSync = (...args) => {
    const written = fs.writeSync(...args);
    if (!raced) { raced = true; fs.writeFileSync(second, jsonBytes({ foreign: true }), { mode: 0o600 }); }
    return written;
  };
  assert.throws(() => publishPrivateJsonSet([
    { file: first, value: { first: true } }, { file: second, value: { second: true } },
  ], { fileSystem }), (error) => error.state === 'publication-unconfirmed');
  assert.deepEqual(privateJson(first).value, { first: true });
  assert.deepEqual(privateJson(second).value, { foreign: true });
});
test('second-file partial write preserves owned evidence and remains unconfirmed', (t) => {
  const state = fixture(t); const first = path.join(state.root, 'first.json');
  const second = path.join(state.root, 'second.json'); let secondFd; let wrote = false;
  const fileSystem = Object.create(fs);
  fileSystem.openSync = (...args) => {
    const fd = fs.openSync(...args);
    if (args[0] === second && (args[1] & fs.constants.O_CREAT)) secondFd = fd;
    return fd;
  };
  fileSystem.writeSync = (fd, bytes, offset, length, position) => {
    if (fd !== secondFd) return fs.writeSync(fd, bytes, offset, length, position);
    if (wrote) throw new Error('synthetic partial write');
    wrote = true; return fs.writeSync(fd, bytes, offset, 1, position);
  };
  assert.throws(() => publishPrivateJsonSet([
    { file: first, value: { first: true } }, { file: second, value: { second: true } },
  ], { fileSystem }), (error) => error.state === 'publication-unconfirmed');
  assert.deepEqual(privateJson(first).value, { first: true });
  assert.equal(fs.statSync(second).size, 1);
});
