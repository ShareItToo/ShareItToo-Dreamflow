import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TARGET, GOOGLE_WEB_PROFILE, bindGoogleWebConfig, profile, cleanSource, sealArtifact, validateArtifact, deploy, sha256, stagingBootstrap, stagingBootstrapFor, retirementWorker } from '../../tool/staging_web_contract.mjs';
import { buildArchive, verifyArchive } from '../../tool/staging_web_archive.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fixture(t, googleWeb = null) {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-staging-web-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const sourceRoot = path.join(temp, 'source'); fs.mkdirSync(sourceRoot);
  const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); fs.writeFileSync(path.join(sourceRoot, 'fixture'), 'tracked'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  const source = git('rev-parse', 'HEAD');
  function artifact(name, version = '1.0.0+2026092905', binding = null) {
    const directory = path.join(temp, name); fs.mkdirSync(path.join(directory, 'web'), { recursive: true });
    for (const [file, text] of Object.entries({ 'index.html': '<script src="flutter_bootstrap.js" async></script>', 'main.dart.js': 'compiled fixture', 'manifest.json': '{"name":"ShareItToo"}', 'flutter_bootstrap.js': '_flutter.loader.load();' })) fs.writeFileSync(path.join(directory, 'web', file), text);
    const hash = sealArtifact({ directory, source, version, flutterVersion: { frameworkVersion: 'fixture' }, builderDigest: 'a'.repeat(64), googleWeb: binding });
    return { directory, hash };
  }
  const old = artifact('old', '1.0.0+2026092904'); const candidate = artifact('candidate', undefined, googleWeb);
  const root = path.join(temp, 'staging-web'); fs.mkdirSync(path.join(root, 'releases'), { recursive: true, mode: 0o755 });
  fs.cpSync(old.directory, path.join(root, 'releases', old.hash), { recursive: true });
  fs.symlinkSync(`releases/${old.hash}/web`, path.join(root, 'current'));
  const args = { root, target: TARGET, artifact: candidate.directory, manifestHash: candidate.hash, sourceRoot, source, currentHash: old.hash, verify: () => {} };
  return { temp, root, old, candidate, args, sourceRoot, source };
}

function googleHandoff(t) {
  // Synthetic public options only; no Firebase, Flutter build or live route.
  const config = { projectId: 'synthetic-sit-fixture', messagingSenderId: '123456789012',
    appId: `1:123456789012:web:${'a'.repeat(32)}`, apiKey: ['AI', 'za', 'x'.repeat(35)].join(''),
    authDomain: 'synthetic-sit-fixture.firebaseapp.com', backendProjectId: 'synthetic-sit-fixture', authorizedOrigin: TARGET };
  const binding = bindGoogleWebConfig(config, sha256(JSON.stringify(config)));
  const f = fixture(t, binding);
  const archive = path.join(f.temp, 'transfer.tar');
  const proof = buildArchive(f.candidate.directory, f.candidate.hash, archive);
  assert.equal(proof.archiveHash, sha256(fs.readFileSync(archive)));
  const extracted = path.join(f.temp, 'extracted'); fs.mkdirSync(extracted);
  // Independent system-tar extraction, then the real archive/artifact validators.
  execFileSync('tar', ['-xf', archive, '-C', extracted], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(verifyArchive(extracted, f.candidate.hash, archive).archiveHash, proof.archiveHash);
  const manifest = validateArtifact(extracted, f.candidate.hash, f.source);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.profileContractVersion, GOOGLE_WEB_PROFILE);
  assert.equal(manifest.googleWebConfigDigest, binding.digest);
  assert.equal(validateArtifact(f.old.directory, f.old.hash).schemaVersion, 1);
  for (const name of ['staging-web-manifest.json', 'SHA256SUMS', ...Object.keys(manifest.files).map((name) => `web/${name}`)]) {
    assert.deepEqual(fs.readFileSync(path.join(extracted, name)), fs.readFileSync(path.join(f.candidate.directory, name)), name);
  }
  const release = JSON.parse(fs.readFileSync(path.join(extracted, 'web/staging-release.json')));
  assert.deepEqual(release, { target: TARGET, source: f.source, version: manifest.version,
    profileDigest: sha256(JSON.stringify(profile(f.source, manifest.version, binding))) });
  assert.equal(fs.readFileSync(path.join(extracted, 'web/staging_bootstrap.js'), 'utf8'), stagingBootstrapFor(f.source, manifest.version, binding));
  return { ...f, binding, manifest, release, args: { ...f.args, artifact: extracted } };
}

// Simulate the four CLI HTTPS readbacks through the actual current symlink.
// No HTTP server is used: this proves the handoff, not gateway/browser behavior.
function routeVerifier(f, expected, drift = null) {
  let calls = 0;
  const verify = ({ directory, manifestHash }) => {
    calls += 1;
    assert.equal(manifestHash, expected.hash);
    assert.equal(fs.realpathSync(path.join(f.root, 'current')), path.join(directory, 'web'));
    for (const name of ['index.html', 'staging_bootstrap.js', 'flutter_service_worker.js', 'staging-release.json']) {
      let served = fs.readFileSync(path.join(f.root, 'current', name));
      if (name === 'staging_bootstrap.js' && drift === 'bootstrap') served = fs.readFileSync(path.join(f.old.directory, 'web', name));
      if (name === 'staging-release.json' && ['source', 'version', 'profileDigest'].includes(drift)) {
        const identity = JSON.parse(served);
        identity[drift] = JSON.parse(fs.readFileSync(path.join(f.old.directory, 'web', name)))[drift];
        if (drift === 'source') identity.source = '0'.repeat(40);
        served = Buffer.from(`${JSON.stringify(identity)}\n`);
      }
      if (sha256(served) !== sha256(fs.readFileSync(path.join(expected.directory, 'web', name)))) throw Error('staging_static_readback_mismatch');
    }
  };
  return { verify, calls: () => calls };
}

test('Google v2 archive handoff preflights without mutation and publishes exact identity over existing v1 route', (t) => {
  const f = googleHandoff(t); const reader = routeVerifier(f, f.candidate);
  const before = fs.readdirSync(f.root); const releases = fs.readdirSync(path.join(f.root, 'releases'));
  assert.equal(deploy({ ...f.args, verify: reader.verify }).status, 'preflight-passed-no-mutation');
  assert.equal(reader.calls(), 0);
  assert.deepEqual(fs.readdirSync(f.root), before);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'releases')), releases);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
  assert.equal(deploy({ ...f.args, execute: true, verify: reader.verify }).status, 'deployed');
  assert.equal(reader.calls(), 1);
  assert.equal(fs.readlinkSync(path.join(f.root, 'previous')), `releases/${f.old.hash}/web`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.root, 'current/staging-release.json'))), f.release);
  assert.equal(fs.existsSync(path.join(f.root, '.deployment-lock')), false);

  const recovery = routeVerifier(f, f.old);
  const rollback = { ...f.args, artifact: f.old.directory, manifestHash: f.old.hash,
    currentHash: f.candidate.hash, rollback: true, verify: recovery.verify };
  assert.equal(deploy(rollback).status, 'preflight-passed-no-mutation');
  assert.equal(recovery.calls(), 0);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.candidate.hash}/web`);
  assert.equal(deploy({ ...rollback, execute: true }).status, 'deployed');
  assert.equal(recovery.calls(), 1, 'explicit rollback must perform its own readback');
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
  assert.equal(fs.readlinkSync(path.join(f.root, 'previous')), `releases/${f.candidate.hash}/web`);
  validateArtifact(path.join(f.root, 'releases', f.candidate.hash), f.candidate.hash, f.source);
});

for (const drift of ['source', 'version', 'profileDigest', 'bootstrap']) {
  test(`Google v2 served ${drift} mismatch restores v1 pointer without claiming recovery readback`, (t) => {
    const f = googleHandoff(t); const reader = routeVerifier(f, f.candidate, drift);
    assert.throws(() => deploy({ ...f.args, execute: true, verify: reader.verify }), { message: 'staging_static_readback_mismatch' });
    assert.equal(reader.calls(), 1, 'automatic restoration validates disk only; no second served readback');
    for (const pointer of ['current', 'previous']) assert.equal(fs.readlinkSync(path.join(f.root, pointer)), `releases/${f.old.hash}/web`);
    for (const artifact of [f.old, f.candidate]) validateArtifact(path.join(f.root, 'releases', artifact.hash), artifact.hash, f.source);
    assert.equal(fs.existsSync(path.join(f.root, '.deployment-lock')), false);
    // Independent recovery readback is a separate step, not deploy success.
    const recovery = routeVerifier(f, f.old);
    recovery.verify({ directory: path.join(f.root, 'releases', f.old.hash), manifestHash: f.old.hash });
    assert.equal(recovery.calls(), 1);
  });
}
test('exact staging profile, no real-money/local-QA/provider expansion', () => {
  const p = profile('a'.repeat(40), '1.0.0+2026092905');
  assert.equal(p.SIT_API_BASE_URL, `${TARGET}/api/v1`);
  for (const key of ['SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE', 'SIT_SYNTHETIC_CLONE_BOOKING_LANE', 'SIT_SOCIAL_GOOGLE_ENABLED', 'SIT_SOCIAL_APPLE_ENABLED', 'SIT_SOCIAL_FACEBOOK_ENABLED', 'SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED', 'SIT_BLUE_OCEAN_LISTING_ASSISTANT', 'SIT_STAGE_A_NON_BINDING_PILOT']) assert.equal(p[key], 'false', key);
  // No inactive pilot/provider identity or unsigned Stage-A technical surface.
  assert.equal(p.SIT_STAGE_A_PILOT_ID, '');
  for (const key of ['SIT_SOCIAL_PROVIDER_ACTIVATION_VALIDATED', 'SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED', 'SIT_PLANNER_TECHNICAL_UI_ENABLED', 'SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED', 'SIT_LISTING_SETS_TECHNICAL_UI_ENABLED']) assert.equal(p[key], 'false', key);
  assert.equal(p.SIT_BACKEND_ENABLED, 'true');
  // D6 is not activated by the existing signed staging build contract.
  assert.equal(Object.hasOwn(p, 'SIT_MISSION_WEB_PREVIEW_ENABLED'), false);
  const missionConfig = fs.readFileSync(path.join(repo, 'lib/config/mission_web_entry_config.dart'), 'utf8');
  assert.match(missionConfig, /SIT_MISSION_WEB_PREVIEW_ENABLED/);
  assert.match(missionConfig, /defaultValue: false/);
});
test('preflight has no filesystem mutation; execution preserves validated rollback and exact bytes', (t) => {
  const f = fixture(t); const before = fs.readdirSync(f.root);
  assert.equal(deploy(f.args).status, 'preflight-passed-no-mutation');
  assert.deepEqual(fs.readdirSync(f.root), before);
  let verified = false;
  assert.equal(deploy({ ...f.args, execute: true, verify: () => { verified = true; } }).status, 'deployed');
  assert.equal(verified, true);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.candidate.hash}/web`);
  assert.equal(fs.readlinkSync(path.join(f.root, 'previous')), `releases/${f.old.hash}/web`);
  validateArtifact(path.join(f.root, 'releases', f.old.hash), f.old.hash);
});
for (const target of ['https://shareittoo.com', 'https://www.shareittoo.com', 'http://staging.shareittoo.com', `${TARGET}/`, 'https://staging.shareittoo.com.evil.invalid']) {
  test(`refuse non-exact target ${target}`, (t) => assert.throws(() => deploy({ ...fixture(t).args, target }), /target_forbidden/));
}
for (const phase of ['copied', 'previous', 'switched', 'verified']) {
  test(`failure at ${phase} retains/restores old current, recovery artifact and no lock`, (t) => {
    const f = fixture(t);
    assert.throws(() => deploy({ ...f.args, execute: true, fault: (point) => { if (point === phase) throw Error('injected'); } }), /injected/);
    assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
    validateArtifact(path.join(f.root, 'releases', f.old.hash), f.old.hash);
    assert.equal(fs.existsSync(path.join(f.root, '.deployment-lock')), false);
  });
}
test('failed HTTP/static verifier rolls back; rollback failure is never reported as success', (t) => {
  const f = fixture(t);
  assert.throws(() => deploy({ ...f.args, execute: true, verify: () => { throw Error('readback'); }, fault: (point) => { if (point === 'rollback') throw Error('io'); } }), /rollback_failed_manual_recovery_required/);
  assert.equal(fs.readlinkSync(path.join(f.root, 'previous')), `releases/${f.old.hash}/web`);
});
for (const variant of ['dirty', 'head', 'manifest', 'bytes', 'extra', 'symlink', 'hardlink', 'currentMissing', 'currentForeign', 'currentDirectory', 'rollbackCorrupt', 'rootAlias', 'releaseAlias', 'rootWritable', 'lock', 'collision']) {
  test(`fail closed: ${variant}`, (t) => {
    const f = fixture(t); const args = { ...f.args, execute: true };
    const current = path.join(f.root, 'current');
    if (variant === 'dirty') fs.writeFileSync(path.join(f.sourceRoot, 'untracked'), 'dirty');
    if (variant === 'head') args.source = 'b'.repeat(40);
    if (variant === 'manifest') args.manifestHash = 'b'.repeat(64);
    if (variant === 'bytes') fs.appendFileSync(path.join(f.candidate.directory, 'web/main.dart.js'), 'changed');
    if (variant === 'extra') fs.writeFileSync(path.join(f.candidate.directory, 'web/extra.js'), 'extra');
    if (variant === 'symlink') fs.symlinkSync(path.join(f.sourceRoot, 'fixture'), path.join(f.candidate.directory, 'web/escape'));
    if (variant === 'hardlink') fs.linkSync(path.join(f.sourceRoot, 'fixture'), path.join(f.candidate.directory, 'web/escape'));
    if (variant === 'currentMissing') fs.unlinkSync(current);
    if (variant === 'currentForeign') { fs.unlinkSync(current); fs.symlinkSync(f.old.directory, current); }
    if (variant === 'currentDirectory') { fs.unlinkSync(current); fs.mkdirSync(current); }
    if (variant === 'rollbackCorrupt') fs.appendFileSync(path.join(f.root, 'releases', f.old.hash, 'web/index.html'), 'drift');
    if (variant === 'rootAlias') { args.root = path.join(f.temp, 'alias'); fs.symlinkSync(f.root, args.root); }
    if (variant === 'releaseAlias') { fs.renameSync(path.join(f.root, 'releases'), path.join(f.temp, 'elsewhere')); fs.symlinkSync(path.join(f.temp, 'elsewhere'), path.join(f.root, 'releases')); }
    if (variant === 'rootWritable') fs.chmodSync(f.root, 0o777);
    if (variant === 'lock') fs.mkdirSync(path.join(f.root, '.deployment-lock'));
    if (variant === 'collision') fs.mkdirSync(path.join(f.root, 'releases', f.candidate.hash));
    assert.throws(() => deploy(args));
  });
}
test('manual recovery uses same validated transaction, not unverified link retargeting', (t) => {
  const f = fixture(t); deploy({ ...f.args, execute: true });
  const rollback = { ...f.args, artifact: f.old.directory, manifestHash: f.old.hash, currentHash: f.candidate.hash, rollback: true };
  assert.equal(deploy(rollback).status, 'preflight-passed-no-mutation');
  assert.equal(deploy({ ...rollback, execute: true }).status, 'deployed');
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
  assert.equal(fs.readlinkSync(path.join(f.root, 'previous')), `releases/${f.candidate.hash}/web`);
});

function legacyArtifact(directory) {
  const file = path.join(directory, 'staging-web-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file));
  delete manifest.bootstrapContractVersion;
  fs.writeFileSync(path.join(directory, 'web/staging_bootstrap.js'), stagingBootstrap);
  manifest.files['staging_bootstrap.js'] = sha256(stagingBootstrap);
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  const hash = sha256(fs.readFileSync(file));
  fs.writeFileSync(path.join(directory, 'SHA256SUMS'), `${hash}  staging-web-manifest.json\n${Object.entries(manifest.files).map(([name, digest]) => `${digest}  web/${name}\n`).join('')}`);
  return hash;
}

test('existing exact legacy current remains promotable and its verified previous destination remains rollback-safe', (t) => {
  const f = fixture(t);
  const legacyHash = legacyArtifact(f.old.directory);
  fs.cpSync(f.old.directory, path.join(f.root, 'releases', legacyHash), { recursive: true });
  fs.unlinkSync(path.join(f.root, 'current'));
  fs.symlinkSync(`releases/${legacyHash}/web`, path.join(f.root, 'current'));
  const bytes = fs.readFileSync(path.join(f.root, 'releases', legacyHash, 'web/staging_bootstrap.js'));
  assert.equal(deploy({ ...f.args, currentHash: legacyHash, execute: true }).status, 'deployed');
  assert.equal(fs.readlinkSync(path.join(f.root, 'previous')), `releases/${legacyHash}/web`);
  assert.equal(deploy({ ...f.args, artifact: f.old.directory, manifestHash: legacyHash,
    currentHash: f.candidate.hash, rollback: true, execute: true }).status, 'deployed');
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'releases', legacyHash, 'web/staging_bootstrap.js')), bytes);
});

test('legacy candidate cannot be newly copied, including with a forged rollback request', (t) => {
  const f = fixture(t); const legacyHash = legacyArtifact(f.candidate.directory);
  const args = { ...f.args, manifestHash: legacyHash, execute: true };
  assert.throws(() => deploy(args), /artifact_bootstrap_contract/u);
  fs.symlinkSync(`releases/${legacyHash}/web`, path.join(f.root, 'previous'));
  assert.throws(() => deploy({ ...args, rollback: true }), /ENOENT/u);
  assert.equal(fs.existsSync(path.join(f.root, 'releases', legacyHash)), false);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
  assert.equal(fs.existsSync(path.join(f.root, '.deployment-lock')), false);
});
test('readback failure restores current and explicit rollback rejects a foreign recovery pointer', (t) => {
  const f = fixture(t);
  assert.throws(() => deploy({ ...f.args, execute: true, verify: () => { throw Error('readback_failed'); } }), /readback_failed/);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
  fs.unlinkSync(path.join(f.root, 'previous')); fs.symlinkSync('/app/current', path.join(f.root, 'previous'));
  assert.throws(() => deploy({ ...f.args, rollback: true }), /rollback_pointer_mismatch/);
});
test('execution without a readback callback cannot claim success', (t) => {
  const f = fixture(t);
  assert.throws(() => deploy({ ...f.args, execute: true, verify: undefined }), /deployment_readback_required/);
  assert.equal(fs.readlinkSync(path.join(f.root, 'current')), `releases/${f.old.hash}/web`);
});
for (const field of ['target', 'api', 'source', 'sourceClean', 'mode', 'pwaStrategy', 'profile']) {
  test(`even a rehashed manifest cannot weaken ${field}`, (t) => {
    const f = fixture(t); const file = path.join(f.candidate.directory, 'staging-web-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    if (field === 'profile') manifest.profile.SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE = 'true';
    else manifest[field] = field === 'sourceClean' ? false : 'forbidden';
    fs.writeFileSync(file, JSON.stringify(manifest));
    const manifestHash = sha256(fs.readFileSync(file));
    assert.throws(() => deploy({ ...f.args, manifestHash }), /artifact_(identity|profile)_mismatch/);
  });
}
test('builder fixes release/no-PWA/no-CDN flags, exact source and source-capacity gates', () => {
  const code = fs.readFileSync(path.join(repo, 'tool/build_staging_web.mjs'), 'utf8');
  for (const required of ["'--release'", "'--pwa-strategy=none'", "'--no-web-resources-cdn'", 'release_host_capacity_begin', 'release_host_capacity_end', '--enforce-lockfile', 'cleanSource(sourceRoot, source)', 'scripts/p0a_web_smoke.sh']) assert.ok(code.includes(required), required);
  const cli = fs.readFileSync(path.join(repo, 'tool/deploy_staging_web.mjs'), 'utf8');
  assert.match(cli, /root: DEPLOY_ROOT/); assert.match(cli, /execute === '--execute'/);
  assert.match(cli, /staging_static_readback_mismatch/);
});
test('Caddy changes only staging shell; API/legal/Production content is unchanged', () => {
  const actual = fs.readFileSync(path.join(repo, 'backend/ops/Caddyfile'), 'utf8');
  const start = 'staging.shareittoo.com {';
  assert.match(actual.split(start)[0], /root \* \/app\/current/);
  assert.doesNotMatch(actual.split(start)[0], /staging-web|no-store/);
  assert.match(actual.split(start)[1], /^\t\troot \* \/app\/staging-web\/current$/m);
  assert.doesNotMatch(actual.split(start)[1], /root \* \/staging-web\/current/);
  assert.match(actual.split(start)[1], /Cache-Control "no-store"/);
});
async function runBootstrap({ origin = TARGET, controller = null, marker = null, unregisterFails = false } = {}) {
  const events = []; const storage = new Map(marker ? [['sit-staging-worker-retirement', marker]] : []);
  const context = { URL, setTimeout: () => 0, location: { origin, reload: () => events.push('reload') },
    navigator: { serviceWorker: { controller, getRegistrations: async () => [{ active: { scriptURL: `${TARGET}/flutter_service_worker.js` }, unregister: async () => { events.push('unregister'); if (unregisterFails) throw Error('no'); } }] } },
    caches: { delete: async (key) => events.push(key) },
    sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: { createElement: () => ({}), body: { appendChild: (script) => events.push(script.src), textContent: '' } } };
  context.window = context;
  await vm.runInNewContext(stagingBootstrap, context);
  return { events, text: context.document.body.textContent };
}
test('Staging retires old worker and only Flutter caches before boot; never touches Production', async () => {
  const ready = await runBootstrap();
  assert.deepEqual(ready.events, ['unregister', 'flutter-app-cache', 'flutter-temp-cache', 'flutter-app-manifest', '/flutter_bootstrap.js']);
  assert.deepEqual((await runBootstrap({ origin: 'https://shareittoo.com' })).events, []);
  assert.match(retirementWorker, /self\.registration\.unregister/);
  assert.doesNotMatch(retirementWorker, /addEventListener\('fetch'/);
});
test('controlled old page reloads once; retirement errors and persistent controller fail visibly', async () => {
  assert.equal((await runBootstrap({ controller: {} })).events.at(-1), 'reload');
  const failed = await runBootstrap({ controller: {}, marker: 'reloaded' });
  assert.match(failed.text, /Offline-Cache/); assert.ok(!failed.events.includes('/flutter_bootstrap.js'));
  assert.match((await runBootstrap({ unregisterFails: true })).text, /Offline-Cache/);
});
