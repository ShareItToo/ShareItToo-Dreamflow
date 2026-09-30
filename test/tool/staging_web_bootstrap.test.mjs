import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootstrap, gatewayFromCandidate, GATEWAY_BODY, mountDigest } from '../../tool/staging_web_bootstrap.mjs';
import { serverAdapter } from '../../tool/bootstrap_staging_web.mjs';
import { sealArtifact, sha256, TARGET } from '../../tool/staging_web_contract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fixture(t) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-web-bootstrap-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const hostRoot = path.join(temp, 'host'); fs.mkdirSync(hostRoot, { mode: 0o755 });
  const sourceRoot = path.join(temp, 'source'); fs.mkdirSync(path.join(sourceRoot, 'backend/ops'), { recursive: true });
  const candidate = fs.readFileSync(path.join(repo, 'backend/ops/Caddyfile'), 'utf8');
  const gateway = gatewayFromCandidate(candidate);
  fs.writeFileSync(path.join(sourceRoot, 'backend/ops/Caddyfile'), candidate);
  const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
  git('init'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  const source = git('rev-parse', 'HEAD');
  const artifact = path.join(temp, 'artifact'); fs.mkdirSync(path.join(artifact, 'web'), { recursive: true });
  for (const [name, content] of Object.entries({ 'index.html': '<script src="flutter_bootstrap.js" async></script>', 'main.dart.js': 'fixture', 'manifest.json': '{"name":"ShareItToo"}', 'flutter_bootstrap.js': '_flutter.loader.load();' })) fs.writeFileSync(path.join(artifact, 'web', name), content);
  const artifactHash = sealArtifact({ directory: artifact, source, version: '1.0.0+2026092905', flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'a'.repeat(64) });
  const config = path.join(hostRoot, 'Caddyfile'); fs.writeFileSync(config, gateway, { mode: 0o644 });
  const stat = fs.statSync(config);
  const backupDirectory = path.join(hostRoot, 'backups/staging-web-bootstrap'); fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backupPath = path.join(backupDirectory, `Caddyfile.${sha256(gateway)}.backup`); fs.writeFileSync(backupPath, gateway, { mode: 0o600 });
  const mounts = [ { Type: 'bind', Source: hostRoot, Destination: '/app', RW: false, Mode: 'ro' }, { Type: 'bind', Source: config, Destination: '/etc/caddy/Caddyfile', RW: false, Mode: 'ro' } ];
  const manifest = { schemaVersion: 1, target: TARGET, runId: 'web-bootstrap-fixture', source, artifactHash, gatewayConfigHash: sha256(gateway), candidateConfigHash: sha256(candidate), containerId: 'a'.repeat(64), containerName: 'shareittoo-web', image: 'caddy:2.10-alpine', imageId: 'b'.repeat(64), version: 'v2.10.2', mountsHash: mountDigest(mounts), hostFile: { inode: stat.ino, device: stat.dev, uid: stat.uid, gid: stat.gid } };
  const state = { id: manifest.containerId, name: manifest.containerName, image: manifest.image, imageId: `sha256:${manifest.imageId}`, running: true, version: manifest.version, mounts, args: ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'] };
  const active = { value: { fixtureAdaptedHash: sha256(gateway) } }; let reloads = 0;
  const root = path.join(hostRoot, 'staging-web');
  const adapter = {
    inspect: () => state, mountedConfig: () => fs.readFileSync(config),
    validate: () => {}, adapt: (content) => ({ fixtureAdaptedHash: sha256(content) }), activeConfig: () => active.value,
    reload: () => { reloads++; active.value = { fixtureAdaptedHash: sha256(fs.readFileSync(config)) }; },
    fetch(route) {
      if (active.value.fixtureAdaptedHash === sha256(gateway)) return Buffer.from(GATEWAY_BODY);
      return fs.readFileSync(path.join(root, 'current', route.split('?')[0]));
    },
  };
  const args = { hostRoot, manifest, sourceRoot, artifact, adapter };
  return { temp, args, manifest, root, hostRoot, config, gateway, candidate, backupPath, backupDirectory, state, active, adapter, sourceRoot, artifact, reloads: () => reloads };
}
function restored(f) {
  assert.equal(fs.readFileSync(f.config, 'utf8'), f.gateway);
  assert.equal(fs.statSync(f.config).ino, f.manifest.hostFile.inode);
  assert.equal(fs.statSync(f.config).mode & 0o777, 0o644);
  assert.equal(f.adapter.mountedConfig().toString(), f.gateway);
  assert.equal(f.adapter.fetch('/').toString(), GATEWAY_BODY);
  assert.equal(fs.existsSync(path.join(f.root, 'current')), false);
  assert.equal(fs.existsSync(path.join(f.root, 'previous')), false);
  assert.equal(fs.readFileSync(f.backupPath, 'utf8'), f.gateway);
}
test('default bootstrap preflight validates exact gateway truth without filesystem mutation/reload', (t) => {
  const f = fixture(t);
  assert.equal(bootstrap(f.args).status, 'bootstrap-preflight-passed-no-mutation');
  assert.equal(fs.existsSync(f.root), false); assert.equal(f.reloads(), 0);
  assert.deepEqual(fs.readdirSync(f.backupDirectory), [path.basename(f.backupPath)]);
});
test('first Web install preserves file-bind inode and owner-only real gateway backup; no fake prior Web', (t) => {
  const f = fixture(t);
  assert.equal(bootstrap({ ...f.args, execute: true }).status, 'bootstrap-passed');
  assert.equal(fs.statSync(f.config).ino, f.manifest.hostFile.inode);
  assert.equal(fs.readFileSync(f.config, 'utf8'), f.candidate);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.manifest.artifactHash}/web`);
  assert.equal(fs.existsSync(path.join(f.root, 'previous')), false);
  assert.equal(f.reloads(), 1);
  assert.equal(fs.statSync(f.backupPath).mode & 0o777, 0o600);
  const evidence = path.join(f.backupDirectory, `${f.manifest.runId}.json`);
  assert.equal(fs.statSync(evidence).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(evidence)).status, 'bootstrap-passed');
});
for (const phase of ['copy', 'copied', 'config-install', 'config-installed', 'reload', 'reloaded', 'readback', 'verified']) {
  test(`${phase} failure restores exact gateway, config inode, permissions and absent current`, (t) => {
    const f = fixture(t);
    assert.throws(() => bootstrap({ ...f.args, execute: true, fault: (at) => { if (at === phase) throw Error('injected'); } }), /injected/);
    restored(f);
    assert.equal(fs.existsSync(path.join(f.root, '.deployment-lock')), false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.backupDirectory, `${f.manifest.runId}.json`))).status, 'failed-gateway-restored');
  });
}
test('ambiguous reload failure after activation still restores gateway via second reload', (t) => {
  const f = fixture(t); const reload = f.adapter.reload; let once = true;
  f.adapter.reload = () => { reload(); if (once) { once = false; throw Error('reload_timeout'); } };
  assert.throws(() => bootstrap({ ...f.args, execute: true }), /reload_timeout/);
  restored(f); assert.equal(f.reloads(), 2);
});
test('actual bad served bytes trigger rollback, not a successful installation', (t) => {
  const f = fixture(t); const fetch = f.adapter.fetch;
  f.adapter.fetch = (route) => route === '/' ? fetch(route) : Buffer.from('wrong');
  assert.throws(() => bootstrap({ ...f.args, execute: true }), /web_readback/); restored(f);
});
test('post-install Caddy validation failure restores original file-bind bytes', (t) => {
  const f = fixture(t); let validations = 0;
  f.adapter.validate = () => { if (++validations === 3) throw Error('post_install_invalid'); };
  assert.throws(() => bootstrap({ ...f.args, execute: true }), /post_install_invalid/);
  restored(f); assert.equal(f.reloads(), 1);
});
test('actual rollback reload failure retains lock even when backup bytes were restored', (t) => {
  const f = fixture(t); const reload = f.adapter.reload; let calls = 0;
  f.adapter.reload = () => { if (++calls === 2) throw Error('rollback_reload_failed'); reload(); };
  assert.throws(() => bootstrap({ ...f.args, execute: true, fault: (at) => { if (at === 'readback') throw Error('readback'); } }), /rollback_failed_manual_recovery_required/);
  assert.equal(fs.readFileSync(f.config, 'utf8'), f.gateway);
  assert.ok(fs.existsSync(path.join(f.root, '.deployment-lock')));
});
test('rollback failure retains recovery lock and backup and records no PASS', (t) => {
  const f = fixture(t);
  assert.throws(() => bootstrap({ ...f.args, execute: true, fault: (at) => { if (['readback', 'rollback'].includes(at)) throw Error('injected'); } }), /rollback_failed_manual_recovery_required/);
  assert.ok(fs.existsSync(path.join(f.root, '.deployment-lock')));
  assert.equal(fs.readFileSync(f.backupPath, 'utf8'), f.gateway);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.backupDirectory, `${f.manifest.runId}.json`))).status, 'rollback-failed-manual-recovery-required');
});
for (const variant of ['production', 'dirty', 'head', 'artifact', 'gateway', 'inode', 'hostPermissions', 'hostSymlink', 'backupPermissions', 'backupSymlink', 'backupParentPermissions', 'current', 'danglingCurrent', 'previous', 'lock', 'rootSymlink', 'rootPermissions', 'evidence', 'mountRw', 'mountSource', 'shadowMount', 'container', 'image', 'version', 'watch', 'mountedBytes', 'activeConfig', 'servedGateway', 'candidateRoutes', 'validate']) {
  test(`preflight rejects ${variant} without reload or config mutation`, (t) => {
    const f = fixture(t);
    const mkroot = () => fs.mkdirSync(f.root, { mode: 0o755 });
    if (variant === 'production') f.manifest.target = 'https://shareittoo.com';
    if (variant === 'dirty') fs.writeFileSync(path.join(f.sourceRoot, 'untracked'), 'dirty');
    if (variant === 'head') f.manifest.source = 'c'.repeat(40);
    if (variant === 'artifact') fs.appendFileSync(path.join(f.artifact, 'web/main.dart.js'), 'drift');
    if (variant === 'gateway') fs.writeFileSync(f.config, 'wrong');
    if (variant === 'inode') f.manifest.hostFile.inode++;
    if (variant === 'hostPermissions') fs.chmodSync(f.config, 0o666);
    if (variant === 'hostSymlink') { fs.unlinkSync(f.config); fs.symlinkSync(f.backupPath, f.config); }
    if (variant === 'backupPermissions') fs.chmodSync(f.backupPath, 0o644);
    if (variant === 'backupSymlink') { fs.unlinkSync(f.backupPath); fs.symlinkSync(f.config, f.backupPath); }
    if (variant === 'backupParentPermissions') fs.chmodSync(f.backupDirectory, 0o755);
    if (variant === 'current') { mkroot(); fs.mkdirSync(path.join(f.root, 'current')); }
    if (variant === 'danglingCurrent') { mkroot(); fs.symlinkSync('/nonexistent', path.join(f.root, 'current')); }
    if (variant === 'previous') { mkroot(); fs.symlinkSync('/app/current', path.join(f.root, 'previous')); }
    if (variant === 'lock') { mkroot(); fs.mkdirSync(path.join(f.root, '.deployment-lock')); }
    if (variant === 'rootSymlink') fs.symlinkSync(f.sourceRoot, f.root);
    if (variant === 'rootPermissions') { mkroot(); fs.chmodSync(f.root, 0o777); }
    if (variant === 'evidence') fs.writeFileSync(path.join(f.backupDirectory, `${f.manifest.runId}.json`), 'existing', { mode: 0o600 });
    if (variant === 'mountRw') f.state.mounts[0].RW = true;
    if (variant === 'mountSource') f.state.mounts[0].Source = '/production';
    if (variant === 'shadowMount') { f.state.mounts.push({ Type: 'bind', Source: '/other', Destination: '/app/staging-web', RW: false, Mode: 'ro' }); f.manifest.mountsHash = mountDigest(f.state.mounts); }
    if (variant === 'container') f.state.id = 'c'.repeat(64);
    if (variant === 'image') f.state.imageId = `sha256:${'c'.repeat(64)}`;
    if (variant === 'version') f.state.version = 'v2.11.0';
    if (variant === 'watch') f.state.args.push('--watch');
    if (variant === 'mountedBytes') f.adapter.mountedConfig = () => Buffer.from('wrong');
    if (variant === 'activeConfig') f.active.value = { other: true };
    if (variant === 'servedGateway') f.adapter.fetch = () => Buffer.from('not gateway');
    if (variant === 'candidateRoutes') f.manifest.candidateConfigHash = 'c'.repeat(64);
    if (variant === 'validate') f.adapter.validate = () => { throw Error('invalid_caddy'); };
    const bytes = fs.readFileSync(f.config);
    assert.throws(() => bootstrap({ ...f.args, execute: true }));
    assert.equal(f.reloads(), 0); assert.deepEqual(fs.readFileSync(f.config), bytes);
  });
}
test('same deployment lock blocks a second bootstrap while first is copying', (t) => {
  const f = fixture(t); let concurrentChecked = false;
  bootstrap({ ...f.args, execute: true, fault: (at) => {
    if (at === 'copy') {
      assert.throws(() => bootstrap({ ...f.args, manifest: { ...f.manifest, runId: 'web-bootstrap-second' }, execute: true }), /deployment_locked/);
      concurrentChecked = true;
    }
  } });
  assert.ok(concurrentChecked);
});
test('late releases symlink escape is rejected before copy; gateway stays untouched', (t) => {
  const f = fixture(t); const outside = path.join(f.temp, 'outside'); fs.mkdirSync(outside);
  assert.throws(() => bootstrap({ ...f.args, execute: true, fault: (at) => {
    if (at === 'copy') { fs.rmdirSync(path.join(f.root, 'releases')); fs.symlinkSync(outside, path.join(f.root, 'releases')); }
  } }));
  assert.deepEqual(fs.readdirSync(outside), []); restored(f);
});
test('foreign active configuration is never overwritten during automatic rollback', (t) => {
  const f = fixture(t);
  assert.throws(() => bootstrap({ ...f.args, execute: true, fault: (at) => {
    if (at === 'readback') { f.active.value = { foreign: true }; throw Error('drift'); }
  } }), /rollback_failed_manual_recovery_required/);
  assert.deepEqual(f.active.value, { foreign: true });
  assert.equal(f.reloads(), 1); assert.ok(fs.existsSync(path.join(f.root, '.deployment-lock')));
});
test('foreign host-file bytes during an interrupted in-place write are never overwritten', (t) => {
  const f = fixture(t);
  assert.throws(() => bootstrap({ ...f.args, execute: true, fault: (at) => {
    if (at === 'config-install') { fs.writeFileSync(f.config, 'foreign-config'); throw Error('drift'); }
  } }), /rollback_failed_manual_recovery_required/);
  assert.equal(fs.readFileSync(f.config, 'utf8'), 'foreign-config');
  assert.equal(f.reloads(), 0);
  assert.ok(fs.existsSync(path.join(f.root, '.deployment-lock')));
});
test('gateway reconstruction binds untouched Production/API/legal bytes to historical gateway hash', () => {
  const candidate = fs.readFileSync(path.join(repo, 'backend/ops/Caddyfile'), 'utf8');
  assert.equal(sha256(gatewayFromCandidate(candidate)), '6e5bf590292e7a28fc38ac1d43a68b1d4697831db33d6b49c0b9d1f21c0aca5b');
  assert.throws(() => gatewayFromCandidate(candidate.replace('/app/staging-web/current', '/app/current')), /candidate_route_contract/);
});
test('server command adapter has exact bounded paths, no raw inspect, no SSH or arbitrary routes', () => {
  const calls = []; const manifest = { containerId: 'a'.repeat(64) };
  const adapter = serverAdapter(manifest, (program, args, options) => {
    calls.push({ program, args, options });
    if (args[0] === 'inspect') return Buffer.from(JSON.stringify({ name: '/shareittoo-web' }));
    if (args.includes('version')) return Buffer.from('v2.10.2 fixture');
    return Buffer.from('{}');
  });
  adapter.inspect(); adapter.validate(Buffer.from('fixture')); adapter.adapt(Buffer.from('fixture')); adapter.reload(); adapter.activeConfig(); adapter.mountedConfig(); adapter.fetch('/');
  assert.ok(calls.every(({ program, options }) => ['docker', 'curl'].includes(program) && options.timeout === 15000));
  assert.ok(calls.some(({ args }) => args.includes('reload') && args.includes('/etc/caddy/Caddyfile')));
  assert.ok(calls.some(({ args }) => args.includes('validate') && args.includes('/dev/stdin')));
  assert.ok(!calls[0].args.join(' ').includes('.Env'));
  assert.throws(() => adapter.fetch('/api/v1/payments'), /readback_route_forbidden/);
  const cli = fs.readFileSync(path.join(repo, 'tool/bootstrap_staging_web.mjs'), 'utf8');
  assert.match(cli, /hostRoot: '\/docker\/shareittoo'/);
  assert.match(cli, /mode === '--execute-bootstrap'/);
  assert.match(cli, /process.getuid\(\) !== 0/);
  assert.match(cli, /bootstrap_executor_source_mismatch/);
  const failed = serverAdapter(manifest, () => { throw Error('private command output must not escape'); });
  assert.throws(() => failed.reload(), (error) => error.message === 'bootstrap_server_command_failed');
});
