#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const closureBaseline = 'f2b6a32c387d43b93c137ce2217ba30dd6da4562';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ownPath = 'tool/check_current_consumer_closure.mjs';
const reversePath = 'docs/evidence/release-readiness/wp160-source-binding-reverse-index-20260915.json';
export const currentEvidencePath = 'docs/evidence/release-readiness/wp161-current-consumer-closure-20260916.json';
const historicalExternal = new Set(['docs/evidence/external-gates/active-infrastructure-mail-provider-readiness.json']);
// WP158 is an active current-candidate provenance ratchet. It remains
// fail-closed and owner-gated, but its source inventory must follow the
// current regression harness without rewriting immutable historical evidence.
const currentEvidenceExceptions = new Set([
  'docs/evidence/release-readiness/wp158-play-internal-artifact-app-content-provenance-20260915.json',
]);
const digestPattern = /^[a-f0-9]{64}$/u;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fail(code, source, consumers = []) {
  const error = new Error(`${code}: ${source}${consumers.length ? ` -> ${[...new Set(consumers)].sort().join(', ')}` : ''}`);
  error.code = code;
  error.source = source;
  error.consumers = [...new Set(consumers)].sort();
  throw error;
}

function safePath(repositoryRoot, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.includes('\\')
      || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('UNSAFE_SOURCE_PATH', 'repository-relative path required');
  }
  const absolute = resolve(repositoryRoot, path);
  if (!existsSync(absolute)) fail('MISSING_SOURCE', path);
  if (lstatSync(absolute).isSymbolicLink()
      || !realpathSync(absolute).startsWith(`${realpathSync(repositoryRoot)}/`)) {
    fail('UNSAFE_SOURCE_PATH', path);
  }
  return absolute;
}

function git(repositoryRoot, args, buffer = false) {
  return execFileSync('git', ['-C', repositoryRoot, ...args], {
    encoding: buffer ? 'buffer' : 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
  });
}
const lines = (value) => value.split('\0').filter(Boolean);

function parseJson(text, path) {
  try { return JSON.parse(text); } catch { fail('INVALID_CURRENT_MANIFEST', path); }
}

// Parse only explicit repository source bindings. Drive hashes, binary hashes
// and historical candidate metadata are deliberately not local source hashes.
export function sourceBindings(value, manifest) {
  const entries = [];
  function inventory(node) {
    if (Array.isArray(node)) {
      for (const entry of node) {
        if (!entry || typeof entry.path !== 'string' || !digestPattern.test(entry.sha256 ?? '')) {
          fail('INVALID_SOURCE_BINDING', manifest);
        }
        entries.push({ path: entry.path, sha256: entry.sha256 });
      }
    } else if (node && typeof node === 'object') {
      for (const [path, digest] of Object.entries(node)) {
        if (!digestPattern.test(digest ?? '')) fail('INVALID_SOURCE_BINDING', manifest);
        entries.push({ path, sha256: digest });
      }
    } else fail('INVALID_SOURCE_BINDING', manifest);
  }
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === 'sourceInventory') inventory(child);
      else if (key === 'sourceBindings') {
        if (child?.repository !== undefined) inventory(child.repository);
        else visit(child);
      } else visit(child);
    }
  }
  visit(value);
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) fail('DUPLICATE_SOURCE_BINDING', entry.path, [manifest]);
    seen.add(entry.path);
  }
  return entries;
}

function isCurrentManifest(path) {
  return path.endsWith('.json') && (path.startsWith('store/')
    || (path.startsWith('docs/evidence/external-gates/') && !historicalExternal.has(path))
    || currentEvidenceExceptions.has(path));
}

function isHistoricalManifest(path) {
  return path.endsWith('.json') && path.startsWith('docs/evidence/') && !isCurrentManifest(path);
}

function literalReferences(text, consumer) {
  const refs = new Set();
  for (const match of text.matchAll(/['"]((?:backend\/|lib\/|tool\/|scripts\/|store\/|test\/|docs\/)[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)['"]/gu)) refs.add(match[1]);
  // Include named and side-effect imports, plus relative paths in URL/readFile
  // based tests that directly consume a changed script or validator.
  for (const match of text.matchAll(/["'](\.{1,2}\/[^'"\n]+)["']/gu)) {
    refs.add(posix.normalize(posix.join(posix.dirname(consumer), match[1])));
  }
  return refs;
}

function assertR9(paths, read, basePaths) {
  const runner = 'tool/run_r9_database_recovery.mjs';
  if (!paths.includes(runner)) fail('MISSING_MIGRATION_CONSUMER', runner);
  const migrations = paths.filter((path) => /^backend\/sql\/migrations\/\d+_[^/]+\.up\.sql$/u.test(path)).sort();
  const source = read(runner);
  const count = Number(source.match(/export const r9RequiredMigrationCount = (\d+);/u)?.[1]);
  const last = migrations.at(-1)?.split('/').at(-1);
  const lastAssertions = [...source.matchAll(/(?:plan\.at\(-1\)\?\.filename !==|requiredLastMigration =)\s*'([^']+)'/gu)].map((match) => match[1]);
  if (count !== migrations.length || lastAssertions.length !== 2 || lastAssertions.some((value) => value !== last)) {
    fail('R9_MIGRATION_INVENTORY_STALE', `backend/sql/migrations (${migrations.length}; ${last})`, [runner]);
  }
  for (const [index, path] of migrations.entries()) {
    if (Number(path.split('/').at(-1).split('_')[0]) !== index + 1) fail('MIGRATION_SEQUENCE_INVALID', path);
    const down = path.replace(/\.up\.sql$/u, '.down.sql');
    if ((!basePaths.has(path) || basePaths.has(down)) && !paths.includes(down)) fail('MIGRATION_PAIR_MISSING', path);
  }
  const testPath = 'test/tool/run_r9_database_recovery.test.mjs';
  const testText = read(testPath);
  if (!testText.includes(`totalMigrations: ${count},`) || !testText.includes(`finalMigrationCount: ${count},`)
      || !testText.includes(`lastMigration: '${last}'`) || !testText.includes(`assert.equal(r9RequiredMigrationCount, ${count})`)) {
    fail('R9_MIGRATION_TEST_STALE', testPath, [runner]);
  }
  return { count, last, runner, test: testPath };
}

export function checkCurrentConsumerClosure({ repositoryRoot = root, baseline = closureBaseline, changedPaths } = {}) {
  const started = performance.now();
  const canonicalRoot = realpathSync(repositoryRoot);
  const actualRoot = git(canonicalRoot, ['rev-parse', '--show-toplevel']).trim();
  if (actualRoot !== canonicalRoot) fail('WRONG_REPOSITORY_ROOT', canonicalRoot);
  const base = git(canonicalRoot, ['rev-parse', '--verify', `${baseline}^{commit}`]).trim();
  git(canonicalRoot, ['merge-base', '--is-ancestor', base, 'HEAD']);
  const listed = lines(git(canonicalRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']));
  const paths = [...new Set(listed)].filter((path) => existsSync(resolve(canonicalRoot, path))).sort();
  const pathSet = new Set(paths);
  const changed = [...new Set(changedPaths ?? [
    ...lines(git(canonicalRoot, ['diff', '--name-only', '-z', base])),
    ...lines(git(canonicalRoot, ['ls-files', '-z', '--others', '--exclude-standard'])),
  ])].filter((path) => path !== currentEvidencePath).sort();
  const textCache = new Map();
  function read(path) {
    if (!textCache.has(path)) textCache.set(path, readFileSync(safePath(canonicalRoot, path), 'utf8'));
    return textCache.get(path);
  }
  const basePaths = new Set(lines(git(canonicalRoot, ['ls-tree', '-rz', '--name-only', base])));
  for (const path of changed.filter((path) => basePaths.has(path) && isHistoricalManifest(path))) {
    fail('HISTORICAL_EVIDENCE_CHANGED', path);
  }
  const manifests = paths.filter(isCurrentManifest);
  const bindings = new Map();
  for (const manifest of manifests) {
    bindings.set(manifest, sourceBindings(parseJson(read(manifest), manifest), manifest));
  }
  // A deleted inventory entry or complete manifest must not disappear from the
  // reverse graph before the gate sees it. Compare affected baseline edges too.
  for (const manifest of [...basePaths].filter(isCurrentManifest).filter((path) => changed.includes(path))) {
    const previous = sourceBindings(parseJson(git(canonicalRoot, ['show', `${base}:${manifest}`]), manifest), manifest);
    for (const entry of previous) {
      if (!(bindings.get(manifest) ?? []).some((current) => current.path === entry.path)) {
        fail('REMOVED_CURRENT_BINDING', entry.path, [manifest]);
      }
    }
  }
  const problems = new Map();
  const addProblem = (code, path, manifest) => {
    const key = `${code}\0${path}`;
    if (!problems.has(key)) problems.set(key, { code, path, consumers: [] });
    problems.get(key).consumers.push(manifest);
  };
  for (const [manifest, entries] of bindings) {
    for (const entry of entries) {
      if (!pathSet.has(entry.path)) addProblem('MISSING_SOURCE', entry.path, manifest);
      else if (hash(readFileSync(safePath(canonicalRoot, entry.path))) !== entry.sha256) addProblem('STALE_SOURCE_HASH', entry.path, manifest);
    }
  }
  if (problems.size) {
    const first = [...problems.values()].sort((a, b) => a.path.localeCompare(b.path))[0];
    fail(first.code, first.path, first.consumers);
  }
  const migrationInventory = assertR9(paths, read, basePaths);
  const bootstrap = parseJson(read(reversePath), reversePath);
  const historicalConsumers = new Set(bootstrap.immutableHistoricalCodeConsumers.map(({ consumer }) => consumer));
  const codePaths = paths.filter((path) => /^tool\/.+\.(?:mjs|js)$/u.test(path) && path !== ownPath);
  const code = new Map(codePaths.map((path) => [path, literalReferences(read(path), path)]));
  // New historical consumers need reviewed classification in a successor
  // baseline. Merely mentioning a historical helper cannot bypass this gate.
  const affected = new Set(changed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [manifest, entries] of bindings) {
      if (!affected.has(manifest) && entries.some(({ path }) => affected.has(path))) { affected.add(manifest); grew = true; }
    }
    for (const [consumer, refs] of code) {
      if (!historicalConsumers.has(consumer) && !affected.has(consumer)
          && [...refs].some((path) => affected.has(path))) { affected.add(consumer); grew = true; }
    }
  }
  const regression = read('scripts/technical_regression_check.sh');
  if (!regression.includes('node --test test/tool/*.test.mjs')) fail('CONSUMER_TEST_GATE_MISSING', 'scripts/technical_regression_check.sh');
  const currentCodeConsumers = [];
  for (const [consumer, refs] of code) {
    if ((historicalConsumers.has(consumer) && !changed.includes(consumer)) || !affected.has(consumer)) continue;
    for (const dependency of refs) {
      if (affected.has(dependency) && !pathSet.has(dependency)) fail('MISSING_CODE_SOURCE', dependency, [consumer]);
    }
    // Resolve owning tests by actual import/reference, not by a filename guess.
    const tests = paths.filter((path) => /^test\/tool\/.+\.test\.mjs$/u.test(path))
      .filter((path) => literalReferences(read(path), path).has(consumer));
    if (tests.length === 0) fail('CURRENT_CONSUMER_WITHOUT_TEST', consumer);
    const required = read(consumer).match(/const sourcePaths = \[([\s\S]*?)\];/u)?.[1];
    if (required) {
      for (const dependency of literalReferences(required, consumer)) {
        if (!pathSet.has(dependency)) fail('MISSING_CODE_SOURCE', dependency, [consumer]);
        // Only the manifest's owning validator defines its required inventory;
        // other validators can consume that manifest alongside unrelated inputs.
        for (const manifest of [...refs].filter((path) => bindings.has(path) && bindings.get(path).length > 0
          && `tool/validate_${posix.basename(path, '.json').replaceAll('-', '_')}.mjs` === consumer)) {
          if (!bindings.get(manifest).some(({ path }) => path === dependency)) {
            fail('MISSING_REQUIRED_BINDING', dependency, [manifest, consumer]);
          }
        }
      }
    }
    currentCodeConsumers.push({ consumer, paths: [...refs].filter((path) => affected.has(path)).sort(), tests });
  }
  const directTestConsumers = paths
    .filter((path) => /^test\/tool\/.+\.test\.mjs$/u.test(path))
    .map((testPath) => ({
      test: testPath,
      paths: [...literalReferences(read(testPath), testPath)]
        .filter((path) => affected.has(path)).sort(),
    }))
    .filter(({ paths: pathsForTest }) => pathsForTest.length > 0);
  const consumerTests = [...new Set([
    ...currentCodeConsumers.flatMap(({ tests }) => tests),
    ...directTestConsumers.map(({ test }) => test),
  ])].sort();
  return {
    schemaVersion: 1, baseline: base, changedPaths: changed,
    currentMutableBindings: [...bindings].filter(([, entries]) => entries.length > 0).map(([binding, entries]) => ({
      binding, paths: entries.map(({ path }) => path).sort(),
    })),
    currentCodeConsumers,
    directTestConsumers,
    consumerTests,
    migrationInventory,
    historicalEvidenceRewritten: false,
    durationMs: Math.round(performance.now() - started),
  };
}

function main(args) {
  try {
    let baseline = closureBaseline;
    let json = false;
    let runConsumers = false;
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--base' && args[index + 1]) baseline = args[++index];
      else if (args[index] === '--json') json = true;
      else if (args[index] === '--run-consumers') runConsumers = true;
      else fail('UNKNOWN_ARGUMENT', args[index]);
    }
    const result = checkCurrentConsumerClosure({ baseline });
    if (runConsumers && result.consumerTests.length) {
      execFileSync(process.execPath, ['--test', ...result.consumerTests], { cwd: root, stdio: 'inherit' });
    }
    console.log(json ? JSON.stringify(result, null, 2)
      : `Current consumer closure PASS: manifests=${result.currentMutableBindings.length}, code=${result.currentCodeConsumers.length}, tests=${result.consumerTests.length}, migrations=${result.migrationInventory.count}, durationMs=${result.durationMs}; consumer assertions=${runConsumers ? 'executed' : 'matrix prepared'}.`);
  } catch (error) {
    console.error(error.code ? error.message : 'CURRENT_CONSUMER_CHECK_FAILED: repository or consumer execution failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
