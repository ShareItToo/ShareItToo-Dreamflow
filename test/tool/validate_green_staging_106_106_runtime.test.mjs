import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main, parseArguments, runCli, PromotionCliFailure } from '../../tool/validate_green_staging_106_106_runtime.mjs';
import { digest, migrationInventory, repositoryRoot } from '../../backend/ops/green_staging_98_106_contract.mjs';
import { successorSourcePaths } from '../../backend/ops/green_staging_106_106_binding.mjs';
import { inputs } from '../../backend/test/fixtures/green_106106_preflight.js';
import { rehearsalFixture } from '../../backend/test/fixtures/green_106106_rehearsal.js';
import { promotionFixture } from '../../backend/test/fixtures/green_106106_promotion.js';

async function protectedPromotion() {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-promotion-cli-'));
  fs.chmodSync(directory, 0o700);
  const state = await promotionFixture(directory), args = ['--mode', 'promote'], files = {};
  for (const [name, value] of Object.entries({ binding: state.data.binding, publication: state.data.publicationBytes,
    target: state.data.target, 'execution-config': state.data.config, 'runtime-manifest': state.data.manifest })) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value)), file = path.join(directory, `${name}.json`);
    fs.writeFileSync(file, bytes, { mode: 0o600 }); files[name] = file;
    args.push(`--${name}`, file, `--${name}-sha256`, digest(bytes));
  }
  files.rehearsal = path.join(directory, `${state.config.runId}.rehearsal.json`);
  args.push('--rehearsal', files.rehearsal, '--rehearsal-sha256', state.options.rehearsalSha256,
    '--evidence-directory', directory, '--confirm', state.options.confirmation);
  return { ...state, args, files, directory, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
async function captureCli(args, dependencies) {
  let out = '', err = '';
  const code = await runCli(args, { dependencies, stdout: { write: v => { out += v; } }, stderr: { write: v => { err += v; } } });
  return { code, out, err };
}

test('explicit promote CLI consumes every protected input, reopens the exact receipt, and succeeds only at owner-smoke pending', async t => {
  const s = await protectedPromotion(), opened = [], original = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', (file, ...args) => { opened.push(file); return original(file, ...args); });
  try {
    const result = await captureCli(s.args, s.dependencies);
    assert.equal(result.code, 0); assert.equal(result.err, '');
    const value = JSON.parse(result.out); assert.equal(value.status, 'promoted_owner_smoke_pending');
    assert.equal(value.publicReleaseComplete, false); assert.equal(value.ownerSmokePassed, false);
    for (const file of Object.values(s.files)) assert.ok(opened.includes(file));
    assert.ok(opened.filter(file => file === s.files.rehearsal).length >= 2);
    assert.ok(opened.includes(path.join(s.directory, `${s.config.runId}.pgdump`)));
    assert.equal(s.calls.filter(c => c.phase === 'promotion_rename').length, 1);
    assert.equal(s.source.State.Running, false);
  } finally { mock.mock.restore(); s.close(); }
});
test('promotion arguments never imply promotion when explicit mode is absent; no Docker or evidence writes', async () => {
  const s = await protectedPromotion(), before = fs.readdirSync(s.directory).sort();
  try {
    const result = await main(s.args.slice(2), { ...s.dependencies, command: () => assert.fail('default Docker') });
    assert.equal(result.status, 'read_only_plan'); assert.deepEqual(fs.readdirSync(s.directory).sort(), before);
    assert.equal(s.calls.length, 0);
  } finally { s.close(); }
});
test('promote requires every argument once and exact protected bytes, permissions, directory, derived path and consent before commands', async t => {
  const s = await protectedPromotion(), baseline = fs.readdirSync(s.directory).sort();
  const reject = async args => { await assert.rejects(main(args, s.dependencies)); assert.equal(s.calls.length, 0);
    assert.deepEqual(fs.readdirSync(s.directory).sort(), baseline); };
  try {
    for (const key of ['binding', 'binding-sha256', 'publication', 'publication-sha256', 'target', 'target-sha256',
      'execution-config', 'execution-config-sha256', 'runtime-manifest', 'runtime-manifest-sha256', 'rehearsal',
      'rehearsal-sha256', 'evidence-directory', 'confirm']) {
      await t.test(`missing ${key}`, async () => { const a = [...s.args]; a.splice(a.indexOf(`--${key}`), 2); await reject(a); });
      await t.test(`duplicate ${key}`, async () => { await reject([...s.args, `--${key}`, s.args[s.args.indexOf(`--${key}`) + 1]]); });
    }
    for (const [name, file] of Object.entries(s.files)) {
      for (const hash of ['invalid', '0'.repeat(64)]) await t.test(`hash ${name} ${hash.length}`, async () => {
        const a = [...s.args]; a[a.indexOf(`--${name}-sha256`) + 1] = hash; await reject(a);
      });
      await t.test(`permissions ${name}`, async () => { fs.chmodSync(file, 0o644);
        try { await reject(s.args); } finally { fs.chmodSync(file, 0o600); } });
      await t.test(`tamper ${name}`, async () => { const bytes = fs.readFileSync(file); fs.appendFileSync(file, ' ');
        try { await reject(s.args); } finally { fs.writeFileSync(file, bytes); } });
    }
    for (const suffix of ['rehearsal.json', `${s.config.runId}.pgdump`, `../${path.basename(s.directory)}/${s.config.runId}.rehearsal.json`]) {
      const a = [...s.args]; a[a.indexOf('--rehearsal') + 1] = `${s.directory}/${suffix}`; await reject(a);
    }
    fs.chmodSync(s.directory, 0o750);
    try { await reject(s.args); } finally { fs.chmodSync(s.directory, 0o700); }
    const a = [...s.args]; a[a.indexOf('--confirm') + 1] = 'PRIVATE-invalid-consent'; await reject(a);
    const failure = await captureCli(a, s.dependencies);
    assert.deepEqual(failure, { code: 1, out: '', err: 'green_106_106_promote_failed\n' });
  } finally { s.close(); }
});
test('promotion preflight rejection and forward recovery preserve safe result but exit nonzero without retry', async t => {
  for (const status of ['preflight_rejected', 'forward_recovery_required']) await t.test(status, async () => {
    const s = await protectedPromotion(); let commands = 0;
    try {
      if (status === 'preflight_rejected') s.dependencies.command = () => { commands++; throw Error('PRIVATE-DYNAMIC-ERROR'); };
      else s.failures.add('promotion_start');
      const result = await captureCli(s.args, s.dependencies), safe = JSON.parse(result.out);
      assert.equal(safe.status, status); assert.equal(result.code, status === 'preflight_rejected' ? 2 : 3);
      assert.equal(result.err, `green_106_106_promote_${status}\n`);
      assert.ok(!result.out.includes('PRIVATE')); assert.equal(safe.oldImageRestarted, false);
      if (status === 'preflight_rejected') { assert.equal(commands, 1); assert.equal(safe.lockRetained, false); }
      else {
        assert.equal(s.calls.filter(c => c.phase === 'promotion_start').length, 1);
        assert.equal(safe.lockRetained, true);
        assert.ok(fs.existsSync(path.join(s.directory, `${s.config.runId}.promotion-failure.json`)));
      }
      assert.ok(!fs.existsSync(path.join(s.directory, `${s.config.runId}.promotion.json`)));
    } finally { s.close(); }
  });
  const failure = new PromotionCliFailure({ status: 'preflight_rejected', sourceId: 'PRIVATE', candidateId: 'PRIVATE', stage: 'PRIVATE' });
  assert.equal(failure.exitCode, 2); assert.equal(failure.result.sourceId, null); assert.equal(failure.result.stage, 'unknown');
  assert.ok(!JSON.stringify(failure.result).includes('PRIVATE'));
  assert.throws(() => new PromotionCliFailure({ status: 'PRIVATE' }));
});

async function protectedRehearsal() {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-rehearsal-cli-'));
  fs.chmodSync(directory, 0o700);
  const state = await rehearsalFixture(directory);
  const artifacts = { binding: state.data.binding, publication: state.data.publicationBytes, target: state.data.target,
    'execution-config': state.data.config, 'runtime-manifest': state.data.manifest, preflight: state.options.preflight };
  const args = ['--mode', 'rehearse'], files = {};
  for (const [name, value] of Object.entries(artifacts)) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    const file = path.join(directory, `${name}.json`); fs.writeFileSync(file, bytes, { mode: 0o600 });
    args.push(`--${name}`, file, `--${name}-sha256`, digest(bytes)); files[name] = file;
  }
  args.push('--evidence-directory', directory, '--confirm', state.options.confirmation);
  return { ...state, args, files, directory, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

async function protectedPreflight() {
  const state = await inputs();
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-preflight-cli-'));
  fs.chmodSync(directory, 0o700);
  const artifacts = { binding: state.f.binding, publication: state.f.publicationBytes, target: state.target,
    'execution-config': state.config, 'runtime-manifest': state.manifest };
  const args = ['--mode', 'preflight'], files = {};
  for (const [name, value] of Object.entries(artifacts)) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    const file = path.join(directory, `${name}.json`); fs.writeFileSync(file, bytes, { mode: 0o600 });
    args.push(`--${name}`, file, `--${name}-sha256`, digest(bytes)); files[name] = file;
  }
  const snapshot = () => Object.fromEntries(fs.readdirSync(directory).sort().map(name => {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    return [name, { hash: digest(fs.readFileSync(file)), mode: stat.mode, ino: stat.ino, size: stat.size, mtime: stat.mtimeMs }];
  }));
  return { ...state, args, files, directory, snapshot, close: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

test('successor CLI defaults read-only and rejects output and incomplete promotion/rehearsal arguments', () => {
  const args = ['--binding', '/private/binding', '--binding-sha256', 'a'.repeat(64),
    '--publication', '/private/publication', '--publication-sha256', 'b'.repeat(64)];
  assert.equal(parseArguments(args).mode, 'plan');
  assert.equal(parseArguments([...args, '--mode', 'collect']).mode, 'collect');
  for (const suffix of [['--mode', 'promote'], ['--mode', 'rehearse'], ['--output', '/private/result'],
    ['--binding', '/duplicate'], ['--mode']]) assert.throws(() => parseArguments([...args, ...suffix]));
});

test('CLI explicit rehearsal reads all six protected artifacts and runs only the injected isolated lifecycle', async t => {
  const s = await protectedRehearsal(), opened = new Set(), originalOpen = fs.openSync;
  const mock = t.mock.method(fs, 'openSync', (file, ...args) => { opened.add(file); return originalOpen(file, ...args); });
  try {
    const result = await main(s.args, s.dependencies);
    assert.equal(result.status, 'rehearsal_passed_services_sealed');
    assert.equal(result.canonicalPromotionImplemented, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(s.directory, 'synthetic-run.rehearsal.json'))).cleanupVerified, true);
    assert.equal(s.probeRan(), true);
    for (const file of Object.values(s.files)) assert.ok(opened.has(file));
    assert.equal(s.source.State.Running, false);
    assert.ok(!s.calls.some(c => c.args[0] === 'start' && c.args.includes(s.source.Id)));
    assert.ok(fs.existsSync(path.join(s.directory, 'synthetic-run.rehearsal.json')));
  } finally { mock.mock.restore(); s.close(); }
});

test('CLI rehearsal requires protected inputs, exact hashes and consent before any command or evidence write', async t => {
  const s = await protectedRehearsal(), baseline = fs.readdirSync(s.directory).sort();
  const reject = async args => { await assert.rejects(main(args, s.dependencies)); assert.equal(s.calls.length, 0);
    assert.deepEqual(fs.readdirSync(s.directory).sort(), baseline); };
  try {
    for (const key of ['target', 'target-sha256', 'execution-config', 'execution-config-sha256', 'runtime-manifest',
      'runtime-manifest-sha256', 'preflight', 'preflight-sha256', 'evidence-directory', 'confirm']) {
      await t.test(`missing ${key}`, async () => { const args = [...s.args]; args.splice(args.indexOf(`--${key}`), 2); await reject(args); });
      await t.test(`duplicate ${key}`, async () => { await reject([...s.args, `--${key}`, s.args[s.args.indexOf(`--${key}`) + 1]]); });
    }
    for (const name of Object.keys(s.files)) {
      await t.test(`hash mismatch ${name}`, async () => { const args = [...s.args]; args[args.indexOf(`--${name}-sha256`) + 1] = '0'.repeat(64); await reject(args); });
      await t.test(`permissions ${name}`, async () => { fs.chmodSync(s.files[name], 0o644);
        try { await reject(s.args); } finally { fs.chmodSync(s.files[name], 0o600); } });
      await t.test(`tamper ${name}`, async () => { const bytes = fs.readFileSync(s.files[name]); fs.appendFileSync(s.files[name], ' ');
        try { await reject(s.args); } finally { fs.writeFileSync(s.files[name], bytes); } });
    }
    for (const confirmation of ['yes', s.options.confirmation.slice(0, -1) + 'x']) {
      const args = [...s.args]; args[args.indexOf('--confirm') + 1] = confirmation; await reject(args);
      let err = '', out = '';
      assert.equal(await runCli(args, { dependencies: s.dependencies, stdout: { write: v => { out += v; } }, stderr: { write: v => { err += v; } } }), 1);
      assert.equal(out, ''); assert.equal(err, 'green_106_106_rehearse_failed\n');
    }
  } finally { s.close(); }
});
test('CLI consumes held exact publication bytes and protected binding; default performs no Docker or writes', async () => {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'sit-successor-cli-'));
  fs.chmodSync(temporary, 0o700);
  try {
    const commit = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`;
    const publication = { schemaVersion: 2, commit, tag: `ghcr.io/shareittoo/shareittoo-api:${commit}`,
      digest: image, workflow: 'regression', runId: '1', runAttempt: '1', repository: 'ShareItToo/ShareItToo-Dreamflow',
      eventName: 'workflow_dispatch', observedTagDigest: image, observedOciRevision: commit };
    const bytes = Buffer.from(`${JSON.stringify(publication)}\n`);
    const c = (id, name) => ({ id: id.repeat(64), name, imageId: image, imageDigest: image });
    const binding = { kind: 'sit-green-staging-106-106-binding', schemaVersion: 1, opsCommit: commit, reviewedCommit: commit,
      runtimeCommit: commit, publicationSha256: digest(bytes), candidateImageId: image,
      sourceInventory: Object.fromEntries(successorSourcePaths().map(p => [p, digest(fs.readFileSync(path.join(repositoryRoot, p)))])),
      scope: { api: { ...c('1', 'api'), runtimeCommit: commit }, database: c('2', 'db'), witnesses: [],
        networks: [{ id: '3'.repeat(64), name: 'internal', internal: true }, { id: '4'.repeat(64), name: 'provider', internal: false }],
        uploads: 'uploads', databaseName: 'synthetic', databaseUser: 'synthetic' } };
    const bindingBytes = Buffer.from(JSON.stringify(binding)), bindingPath = path.join(temporary, 'binding.json'), publicationPath = path.join(temporary, 'publication.json');
    fs.writeFileSync(bindingPath, bindingBytes, { mode: 0o600 }); fs.writeFileSync(publicationPath, bytes, { mode: 0o600 });
    const args = ['--binding', bindingPath, '--binding-sha256', digest(bindingBytes), '--publication', publicationPath, '--publication-sha256', digest(bytes)];
    const git = a => a[0] === 'show' ? fs.readFileSync(path.join(repositoryRoot, a[1].split(':').slice(1).join(':')))
      : a[0] === 'ls-tree' ? migrationInventory().map(r => r.name).join('\n') : commit;
    const deps = { sourceOptions: { git }, command: () => { throw new Error('unexpected Docker'); } };
    assert.equal((await main(args, deps)).status, 'read_only_plan');
    assert.deepEqual(fs.readdirSync(temporary).sort(), ['binding.json', 'publication.json']);
    fs.appendFileSync(publicationPath, ' ');
    await assert.rejects(main(args, deps));
    fs.writeFileSync(publicationPath, bytes); fs.chmodSync(publicationPath, 0o644);
    await assert.rejects(main(args, deps));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
test('CLI preflight main reads all five protected inputs and executes the injected read-only preflight without filesystem writes', async t => {
  const s = await protectedPreflight(), opened = new Set(), originalOpen = fs.openSync, before = s.snapshot();
  const mocks = [];
  try {
    mocks.push(t.mock.method(fs, 'openSync', (file, flags, ...rest) => {
      assert.equal(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND), 0);
      opened.add(file); return originalOpen(file, flags, ...rest);
    }));
    for (const method of ['writeFileSync', 'writeSync', 'appendFileSync', 'renameSync', 'mkdirSync', 'chmodSync', 'chownSync', 'unlinkSync', 'rmSync']) {
      mocks.push(t.mock.method(fs, method, () => assert.fail(`Unexpected filesystem mutation: ${method}`)));
    }
    const result = await main(s.args, s.dependencies);
    assert.equal(result.status, 'read_only_preflight_passed');
    assert.equal(result.promotionAuthorized, false); assert.equal(result.namespaceReadabilityVerified, false);
    for (const file of Object.values(s.files)) assert.ok(opened.has(file));
    assert.equal(s.open.size, 0); assert.deepEqual(s.snapshot(), before);
  } finally { for (const mock of mocks) mock.mock.restore(); s.close(); }
});
test('CLI preflight requires all six target/config/manifest arguments exactly once and validates their hashes', async t => {
  const s = await protectedPreflight();
  try {
    for (const name of ['target', 'execution-config', 'runtime-manifest']) for (const key of [name, `${name}-sha256`]) {
      await t.test(`missing ${key}`, async () => {
        const args = [...s.args]; args.splice(args.indexOf(`--${key}`), 2); await assert.rejects(main(args, s.dependencies));
      });
      await t.test(`duplicate ${key}`, async () => {
        const value = s.args[s.args.indexOf(`--${key}`) + 1];
        await assert.rejects(main([...s.args, `--${key}`, value], s.dependencies));
      });
    }
    for (const name of ['target', 'execution-config', 'runtime-manifest']) for (const value of ['invalid', '0'.repeat(64)]) {
      await t.test(`hash ${name} ${value === 'invalid' ? 'shape' : 'mismatch'}`, async () => {
        const args = [...s.args]; args[args.indexOf(`--${name}-sha256`) + 1] = value;
        await assert.rejects(main(args, s.dependencies));
      });
    }
    for (const mode of ['promote', 'rehearse', 'execute', 'private-mode-never-print']) {
      const args = [...s.args]; args[1] = mode; await assert.rejects(main(args, s.dependencies));
    }
  } finally { s.close(); }
});
test('CLI preflight rejects permissions, tampering and missing artifacts before any command', async t => {
  const s = await protectedPreflight();
  let commands = 0;
  const dependencies = { ...s.dependencies, command: () => { commands++; throw new Error('must not execute'); } };
  try {
    for (const name of ['target', 'execution-config', 'runtime-manifest']) {
      const file = s.files[name], bytes = fs.readFileSync(file);
      await t.test(`permissions ${name}`, async () => {
        fs.chmodSync(file, 0o644);
        try { await assert.rejects(main(s.args, dependencies)); } finally { fs.chmodSync(file, 0o600); }
      });
      await t.test(`tamper ${name}`, async () => {
        fs.appendFileSync(file, ' ');
        try { await assert.rejects(main(s.args, dependencies)); } finally { fs.writeFileSync(file, bytes); }
      });
      await t.test(`absent ${name}`, async () => {
        fs.renameSync(file, `${file}.held`);
        try { await assert.rejects(main(s.args, dependencies)); } finally { fs.renameSync(`${file}.held`, file); }
      });
    }
    assert.equal(commands, 0);
  } finally { s.close(); }
});
test('CLI output uses fixed mode-specific failure labels and never includes dynamic errors or rejected values', async () => {
  const s = await protectedPreflight();
  const capture = async (args, dependencies) => {
    let out = '', err = '';
    const code = await runCli(args, { dependencies, stdout: { write: text => { out += text; } }, stderr: { write: text => { err += text; } } });
    return { code, out, err };
  };
  try {
    const success = await capture(s.args, s.dependencies);
    assert.equal(success.code, 0); assert.equal(success.err, ''); assert.equal(JSON.parse(success.out).status, 'read_only_preflight_passed');
    const failed = await capture(s.args, { ...s.dependencies, command: () => { throw new Error('PRIVATE-DYNAMIC-ERROR'); } });
    assert.deepEqual(failed, { code: 1, out: '', err: 'green_106_106_preflight_failed\n' });
    for (const mode of ['plan', 'collect']) {
      const args = [...s.args]; args[1] = mode; args[args.indexOf('--binding-sha256') + 1] = '0'.repeat(64);
      assert.deepEqual(await capture(args, s.dependencies), { code: 1, out: '', err: `green_106_106_${mode}_failed\n` });
    }
    const invalid = [...s.args]; invalid[1] = 'PRIVATE-MODE';
    assert.deepEqual(await capture(invalid, s.dependencies), { code: 1, out: '', err: 'green_106_106_arguments_failed\n' });
  } finally { s.close(); }
});
