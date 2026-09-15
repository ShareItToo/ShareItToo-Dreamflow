import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { checkCurrentConsumerClosure, sourceBindings } from '../../tool/check_current_consumer_closure.mjs';

const app = 'backend/src/app.js';
const manifest = 'store/privacy-disclosures.json';
const runner = 'tool/run_r9_database_recovery.mjs';
const reverse = 'docs/evidence/release-readiness/wp160-source-binding-reverse-index-20260915.json';
const historical = 'docs/evidence/release-readiness/old.json';
const historicalConsumer = 'tool/historical.mjs';
const digest = (text) => createHash('sha256').update(text).digest('hex');
const repo = resolve(new URL('../..', import.meta.url).pathname);

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'sit-wp161-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const put = (path, text) => { mkdirSync(dirname(join(directory, path)), { recursive: true }); writeFileSync(join(directory, path), text); };
  const json = (path, value) => put(path, JSON.stringify(value));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'fixture');
  put(app, 'export const version = 1;\n');
  json(manifest, { sourceInventory: [{ path: app, sha256: digest('export const version = 1;\n') }] });
  json(historical, { sourceInventory: { [app]: 'a'.repeat(64) } });
  json(reverse, { immutableHistoricalCodeConsumers: [{ consumer: historicalConsumer }] });
  put(historicalConsumer, `const path = '${app}';\n`);
  put('tool/validate_privacy_disclosures.mjs', `const sourcePaths = ['${app}'];\nconst file = '${manifest}';\n`);
  put('test/tool/privacy.test.mjs', "import '../../tool/validate_privacy_disclosures.mjs';\n");
  put('backend/sql/migrations/001_initial.up.sql', 'SELECT 1;');
  put('backend/sql/migrations/001_initial.down.sql', 'SELECT 1;');
  const inventory = (count, last) => {
    put(runner, `export const r9RequiredMigrationCount = ${count};\nconst last = plan.at(-1)?.filename !== '${last}';\nfunction validate({requiredLastMigration = '${last}'}) {}\n`);
    put('test/tool/run_r9_database_recovery.test.mjs', `import '../../${runner}';\nconst fixture = {totalMigrations: ${count}, finalMigrationCount: ${count}, lastMigration: '${last}'};\nassert.equal(r9RequiredMigrationCount, ${count});\n`);
  };
  inventory(1, '001_initial.up.sql');
  put('scripts/technical_regression_check.sh', 'node tool/check_current_consumer_closure.mjs\nnode --test test/tool/*.test.mjs\n');
  git('add', '.'); git('commit', '-qm', 'baseline');
  const baseline = git('rev-parse', 'HEAD');
  const check = () => checkCurrentConsumerClosure({ repositoryRoot: directory, baseline });
  const bind = (path = manifest, source = app) => json(path, { sourceInventory: [{ path: source, sha256: digest(readFileSync(join(directory, source))) }] });
  return { directory, baseline, put, json, git, check, bind, inventory };
}

test('clean baseline validates all current hashes and leaves historical hashes unchanged', (t) => {
  const f = fixture(t);
  const before = readFileSync(join(f.directory, historical));
  const result = f.check();
  assert.equal(result.currentMutableBindings.length, 1);
  assert.equal(result.migrationInventory.count, 1);
  assert.deepEqual(result.changedPaths, []);
  assert.deepEqual(readFileSync(join(f.directory, historical)), before);
});

test('app.js drift reports one root and all affected manifests', (t) => {
  const f = fixture(t);
  f.bind('store/second.json');
  f.put(app, 'export const version = 2;\n');
  assert.throws(f.check, (error) => error.code === 'STALE_SOURCE_HASH' && error.source === app
    && assert.deepEqual(error.consumers, [manifest, 'store/second.json']) === undefined);
});

test('repaired app.js bindings expose the complete transitive code/test matrix', (t) => {
  const f = fixture(t);
  f.put(app, 'export const version = 2;\n'); f.bind();
  f.put('tool/next.mjs', "import './validate_privacy_disclosures.mjs';\n");
  f.put('test/tool/next.test.mjs', "import '../../tool/next.mjs';\n");
  const result = f.check();
  assert.deepEqual(result.currentCodeConsumers.map(({ consumer }) => consumer), ['tool/next.mjs', 'tool/validate_privacy_disclosures.mjs']);
  assert.deepEqual(result.consumerTests, ['test/tool/next.test.mjs', 'test/tool/privacy.test.mjs']);
});

test('new nested current manifests and external repository bindings are discovered', (t) => {
  const f = fixture(t);
  f.json('store/nested/new.json', { wrapper: { sourceInventory: { [app]: '0'.repeat(64) } } });
  assert.throws(f.check, { code: 'STALE_SOURCE_HASH' });
  f.bind('store/nested/new.json');
  f.json('docs/evidence/external-gates/new.json', { sourceBindings: { drive: { sha256: 'not-a-local-hash' }, repository: [{ path: app, sha256: '0'.repeat(64) }] } });
  assert.throws(f.check, { code: 'STALE_SOURCE_HASH' });
  f.json('docs/evidence/external-gates/new.json', { sourceBindings: { repository: [{ path: app, sha256: digest(readFileSync(join(f.directory, app))) }] } });
  assert.equal(f.check().currentMutableBindings.length, 3);
});

test('invalid JSON, duplicate, missing and malformed hashes fail closed', (t) => {
  const f = fixture(t);
  f.put('store/new.json', '{'); assert.throws(f.check, { code: 'INVALID_CURRENT_MANIFEST' });
  f.json('store/new.json', { sourceInventory: [{ path: app }] }); assert.throws(f.check, { code: 'INVALID_SOURCE_BINDING' });
  f.json('store/new.json', { sourceInventory: [{ path: app, sha256: 'a'.repeat(64) }, { path: app, sha256: 'a'.repeat(64) }] });
  assert.throws(f.check, { code: 'DUPLICATE_SOURCE_BINDING' });
});

test('deleted bindings and whole deleted manifests cannot disappear from discovery', (t) => {
  const f = fixture(t);
  f.json(manifest, { sourceInventory: [] }); assert.throws(f.check, { code: 'REMOVED_CURRENT_BINDING' });
  rmSync(join(f.directory, manifest)); assert.throws(f.check, { code: 'REMOVED_CURRENT_BINDING' });
});

test('missing local source fails and changing existing historical evidence is refused', (t) => {
  const f = fixture(t);
  rmSync(join(f.directory, app)); assert.throws(f.check, { code: 'MISSING_SOURCE' });
  f.put(app, 'export const version = 1;\n');
  f.json(historical, { sourceInventory: {} }); assert.throws(f.check, { code: 'HISTORICAL_EVIDENCE_CHANGED' });
});

test('new migration detects count and last-file drift before database work', (t) => {
  const f = fixture(t);
  f.put('backend/sql/migrations/002_next.up.sql', 'SELECT 2;');
  f.put('backend/sql/migrations/002_next.down.sql', 'SELECT 2;');
  assert.throws(f.check, { code: 'R9_MIGRATION_INVENTORY_STALE' });
  f.inventory(2, '001_initial.up.sql'); assert.throws(f.check, { code: 'R9_MIGRATION_INVENTORY_STALE' });
  f.inventory(2, '002_next.up.sql'); assert.equal(f.check().migrationInventory.count, 2);
});

test('new migration with stale tests or missing rollback pair is refused', (t) => {
  const f = fixture(t);
  f.put('backend/sql/migrations/002_next.up.sql', 'SELECT 2;'); f.inventory(2, '002_next.up.sql');
  assert.throws(f.check, { code: 'MIGRATION_PAIR_MISSING' });
  f.put('backend/sql/migrations/002_next.down.sql', 'SELECT 2;');
  f.put('test/tool/run_r9_database_recovery.test.mjs', 'const totalMigrations = 1;');
  assert.throws(f.check, { code: 'R9_MIGRATION_TEST_STALE' });
});

test('a new current code consumer requires executable owning tests', (t) => {
  const f = fixture(t);
  f.put('tool/new.mjs', `const source = '${app}';\n`);
  assert.throws(f.check, { code: 'CURRENT_CONSUMER_WITHOUT_TEST' });
  f.put('test/tool/new.test.mjs', "import '../../tool/new.mjs';\n");
  assert.ok(f.check().consumerTests.includes('test/tool/new.test.mjs'));
});

test('mentioning a historical helper cannot exempt a newly introduced consumer', (t) => {
  const f = fixture(t);
  f.put('tool/new.mjs', `// resolveBoundSnapshot\nconst source = '${app}';`);
  assert.throws(f.check, { code: 'CURRENT_CONSUMER_WITHOUT_TEST' });
});

test('owner source inventory cannot omit a newly required source', (t) => {
  const f = fixture(t);
  f.put('backend/src/new.js', 'export const value = true;');
  f.put('tool/validate_privacy_disclosures.mjs', `const sourcePaths = ['${app}', 'backend/src/new.js'];\nconst file = '${manifest}';\n`);
  assert.throws(f.check, { code: 'MISSING_REQUIRED_BINDING' });
});

test('source paths cannot leave the repository through traversal or a symlink', (t) => {
  const f = fixture(t);
  f.json('store/new.json', { sourceInventory: { '../outside.js': 'a'.repeat(64) } });
  assert.throws(f.check, { code: 'MISSING_SOURCE' });
  rmSync(join(f.directory, 'store/new.json'));
  symlinkSync(join(f.directory, app), join(f.directory, 'linked.js'));
  f.json('store/new.json', { sourceInventory: { 'linked.js': digest(readFileSync(join(f.directory, app))) } });
  assert.throws(f.check, { code: 'UNSAFE_SOURCE_PATH' });
});

test('discovery includes staged and unstaged changes and untracked files', (t) => {
  const f = fixture(t);
  f.put(app, 'export const version = 2;'); f.git('add', app); f.bind();
  f.put('untracked.md', 'new');
  const changed = f.check().changedPaths;
  assert.ok(changed.includes(app)); assert.ok(changed.includes(manifest)); assert.ok(changed.includes('untracked.md'));
});

test('baseline after source commits still covers an evidence-only successor', (t) => {
  const f = fixture(t);
  f.put(app, 'export const version = 2;'); f.bind(); f.git('add', '.'); f.git('commit', '-qm', 'source');
  f.put('docs/evidence/release-readiness/new.json', '{}'); f.git('add', '.'); f.git('commit', '-qm', 'evidence');
  assert.ok(f.check().currentCodeConsumers.some(({ consumer }) => consumer === 'tool/validate_privacy_disclosures.mjs'));
});

test('current gate executes before capacity probes, dependencies and expensive regression', () => {
  const source = readFileSync(join(repo, 'scripts/technical_regression_check.sh'), 'utf8');
  const guard = readFileSync(join(repo, 'scripts/release_host_capacity_guard.sh'), 'utf8');
  const offset = guard.indexOf('node tool/check_current_consumer_closure.mjs');
  assert.ok(offset >= 0);
  assert.ok(source.indexOf('release_host_capacity_begin') >= 0);
  for (const later of ['release_host_capacity_begin', 'flutter pub get', 'node --test test/tool/*.test.mjs']) {
    assert.ok(later === 'release_host_capacity_begin' || source.indexOf(later) > 0);
  }
});

test('repository-shaped sourceBindings array and object forms are explicit', () => {
  assert.deepEqual(sourceBindings({ sourceInventory: { [app]: 'a'.repeat(64) } }, manifest), [{ path: app, sha256: 'a'.repeat(64) }]);
  assert.deepEqual(sourceBindings({ artifact: { path: 'candidate.aab', sha256: 'not-a-source' } }, manifest), []);
});
