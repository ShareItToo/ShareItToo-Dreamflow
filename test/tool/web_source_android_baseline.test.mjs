import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { androidBuildDecision, androidUnaffectedPath, retainAndroidBaseline } from '../../tool/web_source_android_baseline.mjs';

const web = { SIT_WEB_SOURCE_GATE: '1' };
const regression = readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'sit-web-android-baseline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path, bytes = 'fixture\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  git('init', '--quiet');
  git('config', 'user.name', 'Synthetic fixture');
  git('config', 'user.email', 'synthetic@example.invalid');
  write('lib/main.dart'); write('android/app/build.gradle'); write('docs/state.md');
  git('add', '.'); git('commit', '--quiet', '-m', 'baseline');
  const head = git('rev-parse', 'HEAD');
  const audit = {
    schemaVersion: 1, kind: 'sit-48h-r11-android-security-permission-surface',
    status: 'verified-local-merged-debug-artifact-ci-pending',
    source: { implementationHead: head },
    artifact: { buildType: 'debug', applicationId: 'com.shareittoo.app', minSdk: 24, bytes: 42, sha256: 'a'.repeat(64) },
  };
  const auditPath = join(root, '.git', 'synthetic-audit.json');
  writeFileSync(auditPath, JSON.stringify(audit));
  const baselinePath = join(root, '.git', 'sit-web-source-android-baseline-v1.json');
  return { root, git, write, head, audit, auditPath, baselinePath,
    retain: () => retainAndroidBaseline(root, head, auditPath) };
}

test('positive allowlist never treats Web-named Dart, dependencies or build tooling as unaffected', () => {
  for (const path of ['docs/a.md', 'test/widget.dart', 'backend/src/a.js', 'web/index.html', 'AGENTS.md']) {
    assert.equal(androidUnaffectedPath(path), true, path);
  }
  for (const path of ['lib/navigation/web_router.dart', 'lib/main.dart', 'android/app/build.gradle',
    'ios/Runner/a', 'assets/a.png', 'pubspec.yaml', 'pubspec.lock', '.metadata',
    'scripts/technical_regression_check.sh', 'tool/prepare_android_debug_build_metadata.mjs',
    '.github/workflows/regression.yml', 'unknown']) {
    assert.equal(androidUnaffectedPath(path), false, path);
  }
});

test('only explicit local Web mode can skip against a retained successful ancestor', (t) => {
  const f = fixture(t); f.retain();
  f.write('web/index.html'); f.git('add', '.'); f.git('commit', '--quiet', '-m', 'web');
  f.write('docs/state.md', 'unstaged docs'); f.write('test/new.test.mjs');
  assert.equal(androidBuildDecision(f.root, web).build, false);
  for (const env of [{}, { CI: 'true' }, { ...web, CI: 'true' }, { ...web, CI: '1' },
    { ...web, CI: '' }, { ...web, SIT_ALLOW_CANDIDATE_ROLLOVER: '1' }, { SIT_WEB_SOURCE_GATE: 'invalid' }]) {
    assert.equal(androidBuildDecision(f.root, env).build, true);
  }
});

test('all committed, staged, unstaged and untracked native/shared impacts require Android', async (t) => {
  for (const state of ['committed', 'staged', 'unstaged', 'untracked', 'deleted', 'renamed']) {
    await t.test(state, (t) => {
      const f = fixture(t); f.retain();
      if (state === 'untracked') f.write('lib/new.dart');
      else if (state === 'deleted') f.git('rm', 'lib/main.dart');
      else if (state === 'renamed') f.git('mv', 'lib/main.dart', 'docs/former.dart');
      else {
        f.write('lib/main.dart', 'changed');
        if (['staged', 'committed'].includes(state)) f.git('add', 'lib/main.dart');
        if (state === 'committed') f.git('commit', '--quiet', '-m', 'native');
      }
      const result = androidBuildDecision(f.root, web);
      assert.equal(result.build, true);
      assert.equal(result.reason, 'android-or-unknown-source-impact');
    });
  }
});

test('NUL-delimited paths cannot hide a newline-named native file', (t) => {
  const f = fixture(t); f.retain();
  f.write('lib/new\ndocs/fake.md');
  assert.equal(androidBuildDecision(f.root, web).build, true);
});

test('staged native change remains visible when worktree bytes were restored to HEAD', (t) => {
  const f = fixture(t); f.retain();
  f.write('lib/main.dart', 'staged'); f.git('add', 'lib/main.dart'); f.write('lib/main.dart');
  assert.equal(androidBuildDecision(f.root, web).build, true);
});

test('protected local Android config and ignored source changes invalidate reuse', async (t) => {
  for (const path of ['android/app/google-services.json', 'android/local.properties', 'android/key.properties', 'lib/local.hologram.dart']) {
    await t.test(path, (t) => {
      const f = fixture(t);
      f.write('.gitignore', '*.hologram.dart\nandroid/app/google-services.json\nandroid/local.properties\nandroid/key.properties\n');
      f.git('add', '.gitignore'); f.git('commit', '--quiet', '-m', 'ignore protected inputs');
      const head = f.git('rev-parse', 'HEAD'); f.audit.source.implementationHead = head;
      writeFileSync(f.auditPath, JSON.stringify(f.audit));
      retainAndroidBaseline(f.root, head, f.auditPath);
      assert.equal(androidBuildDecision(f.root, web).build, false);
      f.write(path, 'synthetic local change');
      assert.equal(androidBuildDecision(f.root, web).build, true);
    });
  }
});

test('missing, malformed, symlinked and mismatched audit baselines fail closed', (t) => {
  const f = fixture(t);
  assert.equal(androidBuildDecision(f.root, web).build, true);
  f.write('.git/sit-web-source-android-baseline-v1.json', '{');
  assert.equal(androidBuildDecision(f.root, web).build, true);
  rmSync(f.baselinePath); symlinkSync(f.auditPath, f.baselinePath);
  assert.equal(androidBuildDecision(f.root, web).build, true);
  rmSync(f.baselinePath); f.retain();
  const record = JSON.parse(readFileSync(f.baselinePath, 'utf8'));
  record.audit.source.implementationHead = 'b'.repeat(40);
  writeFileSync(f.baselinePath, JSON.stringify(record));
  assert.equal(androidBuildDecision(f.root, web).build, true);
});

test('a baseline outside current ancestry cannot authorize a skip', (t) => {
  const f = fixture(t); f.retain();
  f.git('checkout', '--orphan', 'unrelated'); f.git('commit', '--quiet', '-m', 'unrelated');
  assert.equal(androidBuildDecision(f.root, web).build, true);
});

test('retention refuses changed HEAD, dirty shared source and invalid audit', (t) => {
  const f = fixture(t);
  assert.throws(() => retainAndroidBaseline(f.root, 'b'.repeat(40), f.auditPath), /not-clean-and-stable/u);
  f.write('lib/main.dart', 'dirty');
  assert.throws(f.retain, /not-clean-and-stable/u);
  f.write('lib/main.dart');
  f.audit.artifact.minSdk = 23; writeFileSync(f.auditPath, JSON.stringify(f.audit));
  assert.throws(f.retain, /audit-binding-invalid/u);
});

test('real shell branch keeps default/CI/rollover strict and skips build plus binary audit only together', () => {
  const start = regression.indexOf('android_source_action=build');
  const decision = regression.slice(start, regression.indexOf('if [[ "$android_source_action" == "skip" ]]', start));
  for (const [env, answer, expected] of [
    [{}, 'skip', 'build'], [{ CI: 'true' }, 'skip', 'build'],
    [{ SIT_ALLOW_CANDIDATE_ROLLOVER: '1' }, 'skip', 'build'],
    [web, 'skip', 'skip'], [web, 'build', 'build'],
  ]) {
    const result = spawnSync('bash', ['-c', `set -euo pipefail\nnode() { echo '${answer}'; }\n${decision}\necho "$android_source_action"`], {
      env: { ...process.env, SIT_WEB_SOURCE_GATE: '0', CI: 'false', SIT_ALLOW_CANDIDATE_ROLLOVER: '0', ...env }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), expected);
  }
  const build = regression.slice(regression.indexOf('else\nandroid_build_source_head=', start), regression.indexOf('\nrelease_host_capacity_end', start));
  assert.match(build.trimEnd(), /:app:assembleDebug[\s\S]*minSdk 24[\s\S]*audit_r11_android_security_surface[\s\S]*web_source_android_baseline.mjs retain[\s\S]*\nfi$/u);
});

test('actual Android shell segment skips all native steps or preserves fail-fast build failure', () => {
  const segment = regression.slice(regression.indexOf('android_source_action=build'), regression.indexOf('\nrelease_host_capacity_end'));
  const harness = `set -euo pipefail\nnode() { if [[ "$*" == *' decide' ]]; then echo "$fixture_action"; else echo "node-called:$*"; fi; }\nfunction ./android/gradlew() { echo gradle-called; return 19; }\n${segment}`;
  const env = { ...process.env, SIT_WEB_SOURCE_GATE: '1', CI: 'false', SIT_ALLOW_CANDIDATE_ROLLOVER: '0', SIT_R10_GRADLE_OFFLINE: '0' };
  const skip = spawnSync('bash', ['-c', harness], { env: { ...env, fixture_action: 'skip' }, encoding: 'utf8' });
  assert.equal(skip.status, 0, skip.stderr);
  assert.match(skip.stdout, /SKIPPED/u); assert.doesNotMatch(skip.stdout, /node-called|gradle-called/u);
  const build = spawnSync('bash', ['-c', harness], { env: { ...env, fixture_action: 'build' }, encoding: 'utf8' });
  assert.equal(build.status, 1); assert.match(build.stderr, /Android debug build failed/u);
  assert.match(build.stdout, /prepare_android_debug_build_metadata.*\ngradle-called/u);
  assert.doesNotMatch(build.stdout, / retain /u);
  const invalid = spawnSync('bash', ['-c', harness], { env: { ...env, fixture_action: 'invalid' }, encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Invalid Android source-reuse decision/u);
});
